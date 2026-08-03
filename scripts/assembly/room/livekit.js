import { Room, RoomEvent, Track } from 'https://esm.sh/livekit-client@2.21.0';
import { state } from './state.js';
import { renderGrid, renderParticipantsList, renderScreenShare, setControlActive, showBanner, setConnectionConnected, setConnectionConnecting, setConnectionDisconnected, setConnectionReconnecting } from './ui.js';

function safeText(value) {
  return String(value ?? '').trim();
}

function isLoopbackHost(hostname) {
  const value = safeText(hostname).toLowerCase();
  return value === 'localhost'
    || value === '127.0.0.1'
    || value === '0.0.0.0'
    || value === '::1'
    || value === '[::1]';
}

function getValidatedLivekitUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (_) {
    throw new Error('URL do LiveKit inválida.');
  }

  if (parsed.protocol === 'http:') parsed.protocol = 'ws:';
  if (parsed.protocol === 'https:') parsed.protocol = 'wss:';

  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new Error('A URL do LiveKit deve usar ws:// ou wss://.');
  }

  const pageHost = safeText(window.location.hostname).toLowerCase();
  if (isLoopbackHost(parsed.hostname) && !isLoopbackHost(pageHost)) {
    throw new Error('O servidor de vídeo foi configurado com localhost. Use uma URL pública do LiveKit para conectar dispositivos diferentes.');
  }

  return parsed.toString().replace(/\/$/, '');
}

function getTileMedia(identity) {
  const tile = document.querySelector(`.call-tile[data-identity="${CSS.escape(identity)}"]`);
  return tile?.querySelector('.tile-media') || null;
}

function attachCameraTrack(identity, track) {
  const media = getTileMedia(identity);
  if (!media) return;
  while (media.firstChild) media.removeChild(media.firstChild);
  try {
    const el = track.attach();
    el.playsInline = true;
    el.autoplay = true;
    el.muted = identity === state.room?.localParticipant?.identity;
    media.appendChild(el);
  } catch (_) {}
}

function detachCameraTrack(identity) {
  const media = getTileMedia(identity);
  if (!media) return;
  const video = media.querySelector('video');
  if (video) video.remove();
  if (media.querySelector('.tile-avatar')) return;
  const avatar = document.createElement('div');
  avatar.className = 'tile-avatar';
  avatar.textContent = (window.AssemblyUtils?.getInitials?.(identity) || 'US').slice(0, 2);
  media.appendChild(avatar);
}

function attachAudio(track) {
  try {
    const el = track.attach();
    el.autoplay = true;
    el.dataset.lkAudio = '1';
    el.style.display = 'none';
    document.body.appendChild(el);
  } catch (_) {}
}

function detachAudio(track) {
  try {
    track.detach().forEach((el) => el.remove());
  } catch (_) {}
}

function updateActiveSpeakers(speakers) {
  state.activeSpeakers.clear();
  (speakers || []).forEach((p) => state.activeSpeakers.add(p.identity));
  renderGrid(state.room);
  attachKnownTracks();
}

function attachKnownTracks() {
  if (!state.room) return;
  const participants = [];
  if (state.room.localParticipant) participants.push(state.room.localParticipant);
  state.room.remoteParticipants?.forEach((p) => participants.push(p));

  participants.forEach((p) => {
    p.trackPublications.forEach((pub) => {
      if (!pub.track) return;
      if (pub.kind === Track.Kind.Audio) return;
      if (pub.source === Track.Source.Camera) {
        state.cameraTracks.set(p.identity, pub.track);
        attachCameraTrack(p.identity, pub.track);
      }
      if (pub.source === Track.Source.ScreenShare) {
        state.screenShareTrack = pub.track;
        state.screenShareOwner = p.identity;
      }
    });
  });

  if (state.screenShareTrack) {
    const owner = participants.find(p => p.identity === state.screenShareOwner);
    renderScreenShare(state.screenShareTrack, owner?.name || '');
  } else {
    renderScreenShare(null, '');
  }
}

function getInitialDevicePrefs() {
  const prefs = {
    cameraOn: true,
    micOn: true,
    cameraDeviceId: null,
    micDeviceId: null
  };
  try {
    prefs.cameraOn = sessionStorage.getItem('prep_camera_on') !== '0';
    prefs.micOn = sessionStorage.getItem('prep_mic_on') !== '0';
    prefs.cameraDeviceId = sessionStorage.getItem('prep_camera_dev') || null;
    prefs.micDeviceId = sessionStorage.getItem('prep_mic_dev') || null;
  } catch (_) {}
  return prefs;
}

export async function connectToRoom(tokenInfo) {
  if (!tokenInfo?.url || !tokenInfo?.token) throw new Error('Token inválido');
  setConnectionConnecting();
  showBanner('', 'info');
  const livekitUrl = getValidatedLivekitUrl(tokenInfo.url);

  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
    publishDefaults: {
      videoCodec: 'vp8',
      simulcast: true,
      dtx: true
    }
  });

  state.room = room;

  room
    .on(RoomEvent.Reconnecting, () => {
      setConnectionReconnecting();
      showBanner('Reconectando à assembleia...', 'warning');
    })
    .on(RoomEvent.Reconnected, () => {
      setConnectionConnected();
      showBanner('', 'info');
    })
    .on(RoomEvent.Disconnected, () => {
      setConnectionDisconnected();
      showBanner('Você foi desconectado da assembleia.', 'error');
    })
    .on(RoomEvent.ActiveSpeakersChanged, (speakers) => updateActiveSpeakers(speakers))
    .on(RoomEvent.ParticipantConnected, () => {
      // #region debug-point D:participant-connected
      fetch("http://10.1.32.166:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"livekit-cross-device",runId:"pre-fix",hypothesisId:"D",location:"scripts/assembly/room/livekit.js:ParticipantConnected",msg:"[DEBUG] remote participant connected",data:{localIdentity:room.localParticipant?.identity||null,remoteCount:room.remoteParticipants?.size||0},ts:Date.now()})}).catch(()=>{});
      // #endregion
      renderGrid(room);
      attachKnownTracks();
      renderParticipantsList(room);
    })
    .on(RoomEvent.ParticipantDisconnected, (p) => {
      state.cameraTracks.delete(p.identity);
      if (state.screenShareOwner === p.identity) {
        state.screenShareOwner = null;
        state.screenShareTrack = null;
        renderScreenShare(null, '');
      }
      renderGrid(room);
      attachKnownTracks();
      renderParticipantsList(room);
    })
    .on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
      // #region debug-point D:track-subscribed
      fetch("http://10.1.32.166:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"livekit-cross-device",runId:"pre-fix",hypothesisId:"D",location:"scripts/assembly/room/livekit.js:TrackSubscribed",msg:"[DEBUG] subscribed to remote track",data:{participantIdentity:participant?.identity||null,kind:track?.kind||null,source:pub?.source||null,remoteCount:room.remoteParticipants?.size||0},ts:Date.now()})}).catch(()=>{});
      // #endregion
      if (track.kind === Track.Kind.Audio) {
        attachAudio(track);
        return;
      }
      if (pub.source === Track.Source.Camera) {
        state.cameraTracks.set(participant.identity, track);
        renderGrid(room);
        attachKnownTracks();
      }
      if (pub.source === Track.Source.ScreenShare) {
        state.screenShareTrack = track;
        state.screenShareOwner = participant.identity;
        renderScreenShare(track, participant.name || '');
      }
      renderParticipantsList(room);
    })
    .on(RoomEvent.TrackUnsubscribed, (track, pub, participant) => {
      if (track.kind === Track.Kind.Audio) {
        detachAudio(track);
        return;
      }
      if (pub.source === Track.Source.Camera) {
        state.cameraTracks.delete(participant.identity);
        detachCameraTrack(participant.identity);
      }
      if (pub.source === Track.Source.ScreenShare) {
        state.screenShareTrack = null;
        state.screenShareOwner = null;
        renderScreenShare(null, '');
      }
      renderParticipantsList(room);
    })
    .on(RoomEvent.LocalTrackPublished, () => {
      renderGrid(room);
      attachKnownTracks();
      renderParticipantsList(room);
    })
    .on(RoomEvent.LocalTrackUnpublished, () => {
      renderGrid(room);
      attachKnownTracks();
      renderParticipantsList(room);
    });

  // #region debug-point C:before-connect
  fetch("http://10.1.32.166:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"livekit-cross-device",runId:"pre-fix",hypothesisId:"C",location:"scripts/assembly/room/livekit.js:before-connect",msg:"[DEBUG] connecting room with token info",data:{url:livekitUrl,room:tokenInfo?.room||null,identity:tokenInfo?.identity||null},ts:Date.now()})}).catch(()=>{});
  // #endregion

  try {
    await room.connect(livekitUrl, tokenInfo.token, { autoSubscribe: true });
  } catch (error) {
    // #region debug-point C:connect-error
    fetch("http://10.1.32.166:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"livekit-cross-device",runId:"pre-fix",hypothesisId:"C",location:"scripts/assembly/room/livekit.js:connect-error",msg:"[DEBUG] room connect failed",data:{url:livekitUrl,room:tokenInfo?.room||null,identity:tokenInfo?.identity||null,errorName:error?.name||null,errorMessage:error?.message||String(error)},ts:Date.now()})}).catch(()=>{});
    // #endregion
    throw error;
  }

  // #region debug-point C:after-connect
  fetch("http://10.1.32.166:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"livekit-cross-device",runId:"post-fix",hypothesisId:"C",location:"scripts/assembly/room/livekit.js:after-connect",msg:"[DEBUG] room connected",data:{url:livekitUrl,room:tokenInfo?.room||null,localIdentity:room.localParticipant?.identity||null,remoteCount:room.remoteParticipants?.size||0,connectionState:room.state||null},ts:Date.now()})}).catch(()=>{});
  // #endregion

  state.connected = true;
  setConnectionConnected();

  const prefs = getInitialDevicePrefs();
  try {
    await room.localParticipant.setMicrophoneEnabled(prefs.micOn, prefs.micDeviceId ? { deviceId: prefs.micDeviceId } : undefined);
  } catch (_) {}
  try {
    await room.localParticipant.setCameraEnabled(prefs.cameraOn, prefs.cameraDeviceId ? { deviceId: prefs.cameraDeviceId } : undefined);
  } catch (_) {}

  setControlActive('btn-mic', prefs.micOn);
  setControlActive('btn-camera', prefs.cameraOn);
  setControlActive('btn-screen', false);

  renderGrid(room);
  attachKnownTracks();
  renderParticipantsList(room);
}

export async function toggleMicrophone() {
  const room = state.room;
  if (!room) return;
  const enabled = !(room.localParticipant.isMicrophoneEnabled ?? false);
  await room.localParticipant.setMicrophoneEnabled(enabled);
  setControlActive('btn-mic', enabled);
  renderParticipantsList(room);
}

export async function toggleCamera() {
  const room = state.room;
  if (!room) return;
  const enabled = !(room.localParticipant.isCameraEnabled ?? false);
  await room.localParticipant.setCameraEnabled(enabled);
  setControlActive('btn-camera', enabled);
  renderGrid(room);
  attachKnownTracks();
  renderParticipantsList(room);
}

export async function toggleScreenShare() {
  const room = state.room;
  if (!room) return;
  if (!state.permissions?.canScreenShare) {
    if (window.AssemblyUtils?.showToast) window.AssemblyUtils.showToast('Você não possui permissão para compartilhar tela', 'warning');
    return;
  }
  const enabled = !(room.localParticipant.isScreenShareEnabled ?? false);
  try {
    await room.localParticipant.setScreenShareEnabled(enabled);
    setControlActive('btn-screen', enabled);
  } catch (e) {
    if (window.AssemblyUtils?.showToast) window.AssemblyUtils.showToast('Não foi possível compartilhar tela', 'error');
    setControlActive('btn-screen', false);
  }
}

export async function disconnectRoom() {
  if (!state.room) return;
  try {
    state.room.disconnect();
  } catch (_) {}
  state.connected = false;
  setConnectionDisconnected();
}
