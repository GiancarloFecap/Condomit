import {
  Room,
  RoomEvent,
  Track
} from 'https://esm.sh/livekit-client@2.21.0';

import { state } from './state.js';

import {
  renderGrid,
  renderParticipantsList,
  renderScreenShare,
  setControlActive,
  showBanner,
  setConnectionConnected,
  setConnectionConnecting,
  setConnectionDisconnected,
  setConnectionReconnecting
} from './ui.js';

/*
 * Permite diferenciar uma saída intencional,
 * feita pelo botão de sair, de uma queda de conexão.
 */
let intentionalDisconnect = false;

function safeText(value) {
  return String(value ?? '').trim();
}

function escapeCssSelector(value) {
  const text = safeText(value);

  if (window.CSS?.escape) {
    return window.CSS.escape(text);
  }

  return text.replace(/["\\]/g, '\\$&');
}

function logLiveKit(message, details = null) {
  if (details) {
    console.log(`[LiveKit] ${message}`, details);
    return;
  }

  console.log(`[LiveKit] ${message}`);
}

function warnLiveKit(message, details = null) {
  if (details) {
    console.warn(`[LiveKit] ${message}`, details);
    return;
  }

  console.warn(`[LiveKit] ${message}`);
}

function getParticipantInfo(participant) {
  if (!participant) {
    return null;
  }

  return {
    identity: participant.identity,
    name: participant.name || '',
    metadata: participant.metadata || '',
    isSpeaking: participant.isSpeaking || false
  };
}

function getTileMedia(identity) {
  const escapedIdentity = escapeCssSelector(identity);

  const tile = document.querySelector(
    `.call-tile[data-identity="${escapedIdentity}"]`
  );

  return tile?.querySelector('.tile-media') || null;
}

function getTrackIdentifier(track) {
  return (
    safeText(track?.sid) ||
    safeText(track?.mediaStreamTrack?.id)
  );
}

function attachCameraTrack(identity, track) {
  const media = getTileMedia(identity);

  if (!media || !track) {
    return;
  }

  const existingVideo =
    media.querySelector('video');

  const previousTrack =
    media.__livekitCameraTrack || null;

  /*
   * Evita desconectar e anexar novamente a mesma faixa.
   * Reanexar o mesmo vídeo provoca uma piscada perceptível.
   */
  if (
    existingVideo &&
    previousTrack === track
  ) {
    return;
  }

  if (
    existingVideo &&
    previousTrack &&
    previousTrack !== track
  ) {
    try {
      previousTrack.detach(existingVideo);
    } catch (_) {
      existingVideo.remove();
    }
  }

  while (media.firstChild) {
    media.removeChild(media.firstChild);
  }

  try {
    const element = track.attach();

    element.playsInline = true;
    element.autoplay = true;
    element.dataset.lkVideo = '1';

    const trackIdentifier =
      getTrackIdentifier(track);

    if (trackIdentifier) {
      element.dataset.lkTrackId =
        trackIdentifier;
    }

    /*
     * A câmera local precisa ficar sem áudio para evitar eco.
     */
    element.muted =
      identity === state.room?.localParticipant?.identity;

    media.__livekitCameraTrack = track;
    media.appendChild(element);

    const playPromise = element.play?.();

    if (playPromise?.catch) {
      playPromise.catch(() => {
        warnLiveKit(
          'O navegador bloqueou a reprodução automática do vídeo.'
        );
      });
    }
  } catch (error) {
    delete media.__livekitCameraTrack;

    warnLiveKit(
      'Não foi possível anexar a câmera do participante.',
      {
        identity,
        error
      }
    );
  }
}

function detachCameraTrack(identity) {
  const media = getTileMedia(identity);

  if (!media) {
    return;
  }

  const video =
    media.querySelector('video');

  const attachedTrack =
    media.__livekitCameraTrack || null;

  if (video && attachedTrack) {
    try {
      attachedTrack.detach(video);
    } catch (_) {
      video.remove();
    }
  } else if (video) {
    video.remove();
  }

  delete media.__livekitCameraTrack;

  if (media.querySelector('.tile-avatar')) {
    return;
  }

  const avatar = document.createElement('div');

  avatar.className = 'tile-avatar';

  avatar.textContent = (
    window.AssemblyUtils?.getInitials?.(identity) || 'US'
  ).slice(0, 2);

  media.appendChild(avatar);
}

function attachAudio(track, participant = null) {
  if (!track) {
    return;
  }

  try {
    const trackIdentifier =
      safeText(track.sid) ||
      safeText(track.mediaStreamTrack?.id);

    if (trackIdentifier) {
      const escapedIdentifier =
        escapeCssSelector(trackIdentifier);

      const existingAudio = document.querySelector(
        `[data-lk-track-id="${escapedIdentifier}"]`
      );

      if (existingAudio) {
        return;
      }
    }

    const element = track.attach();

    element.autoplay = true;
    element.playsInline = true;
    element.dataset.lkAudio = '1';
    element.style.display = 'none';

    if (trackIdentifier) {
      element.dataset.lkTrackId =
        trackIdentifier;
    }

    if (participant?.identity) {
      element.dataset.lkParticipant =
        participant.identity;
    }

    document.body.appendChild(element);

    const playPromise = element.play?.();

    if (playPromise?.catch) {
      playPromise.catch(() => {
        warnLiveKit(
          'O navegador bloqueou a reprodução automática do áudio.',
          getParticipantInfo(participant)
        );
      });
    }
  } catch (error) {
    warnLiveKit(
      'Não foi possível anexar o áudio remoto.',
      {
        participant:
          getParticipantInfo(participant),
        error
      }
    );
  }
}

function detachAudio(track) {
  if (!track) {
    return;
  }

  try {
    track.detach().forEach((element) => {
      element.remove();
    });
  } catch (error) {
    warnLiveKit(
      'Não foi possível remover o áudio remoto.',
      error
    );
  }
}

function removeAllAttachedAudio() {
  document
    .querySelectorAll('[data-lk-audio="1"]')
    .forEach((element) => {
      element.remove();
    });
}

function updateActiveSpeakers(speakers) {
  const nextActiveSpeakers = new Set(
    (speakers || [])
      .map((participant) =>
        safeText(participant?.identity)
      )
      .filter(Boolean)
  );

  state.activeSpeakers.clear();

  nextActiveSpeakers.forEach((identity) => {
    state.activeSpeakers.add(identity);
  });

  /*
   * ActiveSpeakersChanged é disparado repetidamente enquanto
   * alguém fala. Não recrie a grade nem os elementos <video>.
   * Apenas altere a classe visual do participante existente.
   */
  document
    .querySelectorAll(
      '.call-tile[data-identity]'
    )
    .forEach((tile) => {
      const identity =
        safeText(tile.dataset.identity);

      tile.classList.toggle(
        'active-speaker',
        state.activeSpeakers.has(identity)
      );
    });
}

function attachKnownTracks() {
  if (!state.room) {
    return;
  }

  const participants = [];

  if (state.room.localParticipant) {
    participants.push(
      state.room.localParticipant
    );
  }

  state.room.remoteParticipants?.forEach(
    (participant) => {
      participants.push(participant);
    }
  );

  participants.forEach((participant) => {
    participant.trackPublications.forEach(
      (publication) => {
        if (!publication.track) {
          return;
        }

        /*
         * O áudio remoto é anexado no evento TrackSubscribed.
         * Não anexamos áudio local.
         */
        if (
          publication.kind ===
          Track.Kind.Audio
        ) {
          return;
        }

        if (
          publication.source ===
          Track.Source.Camera
        ) {
          state.cameraTracks.set(
            participant.identity,
            publication.track
          );

          attachCameraTrack(
            participant.identity,
            publication.track
          );
        }

        if (
          publication.source ===
          Track.Source.ScreenShare
        ) {
          state.screenShareTrack =
            publication.track;

          state.screenShareOwner =
            participant.identity;
        }
      }
    );
  });

  if (state.screenShareTrack) {
    const owner = participants.find(
      (participant) =>
        participant.identity ===
        state.screenShareOwner
    );

    renderScreenShare(
      state.screenShareTrack,
      owner?.name || ''
    );
  } else {
    renderScreenShare(null, '');
  }
}

function refreshRoomInterface(room) {
  renderGrid(room);
  attachKnownTracks();
  renderParticipantsList(room);
}

function getInitialDevicePrefs() {
  const preferences = {
    cameraOn: true,
    micOn: true,
    cameraDeviceId: null,
    micDeviceId: null
  };

  try {
    preferences.cameraOn =
      sessionStorage.getItem(
        'prep_camera_on'
      ) !== '0';

    preferences.micOn =
      sessionStorage.getItem(
        'prep_mic_on'
      ) !== '0';

    preferences.cameraDeviceId =
      sessionStorage.getItem(
        'prep_camera_dev'
      ) || null;

    preferences.micDeviceId =
      sessionStorage.getItem(
        'prep_mic_dev'
      ) || null;
  } catch (error) {
    warnLiveKit(
      'Não foi possível recuperar as preferências dos dispositivos.',
      error
    );
  }

  return preferences;
}

async function enableInitialMicrophone(
  room,
  preferences
) {
  try {
    const options =
      preferences.micDeviceId
        ? {
            deviceId:
              preferences.micDeviceId
          }
        : undefined;

    await room.localParticipant
      .setMicrophoneEnabled(
        preferences.micOn,
        options
      );
  } catch (error) {
    warnLiveKit(
      'Não foi possível ativar o microfone inicial.',
      error
    );

    setControlActive(
      'btn-mic',
      false
    );

    if (
      window.AssemblyUtils?.showToast
    ) {
      window.AssemblyUtils.showToast(
        'Não foi possível acessar o microfone.',
        'warning'
      );
    }
  }
}

async function enableInitialCamera(
  room,
  preferences
) {
  try {
    const options =
      preferences.cameraDeviceId
        ? {
            deviceId:
              preferences.cameraDeviceId
          }
        : undefined;

    await room.localParticipant
      .setCameraEnabled(
        preferences.cameraOn,
        options
      );
  } catch (error) {
    warnLiveKit(
      'Não foi possível ativar a câmera inicial.',
      error
    );

    setControlActive(
      'btn-camera',
      false
    );

    if (
      window.AssemblyUtils?.showToast
    ) {
      window.AssemblyUtils.showToast(
        'Não foi possível acessar a câmera.',
        'warning'
      );
    }
  }
}

export async function connectToRoom(
  tokenInfo
) {
  if (
    !tokenInfo?.url ||
    !tokenInfo?.token
  ) {
    throw new Error(
      'Token ou endereço do LiveKit inválido.'
    );
  }

  /*
   * Evita manter uma conexão anterior aberta.
   */
  if (state.room) {
    try {
      state.room.disconnect();
    } catch (_) {}

    state.room = null;
  }

  intentionalDisconnect = false;

  setConnectionConnecting();
  showBanner('', 'info');

  /*
   * Nunca registre tokenInfo.token no console.
   * O token permite acesso temporário à sala.
   */
  logLiveKit(
    'Iniciando conexão.',
    {
      url:
        tokenInfo.url,

      room:
        tokenInfo.room ||
        tokenInfo.roomName ||
        null,

      identity:
        tokenInfo.identity ||
        tokenInfo.participantIdentity ||
        null
    }
  );

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
    .on(
      RoomEvent.Reconnecting,
      () => {
        logLiveKit(
          'Tentando reconectar à sala.'
        );

        setConnectionReconnecting();

        showBanner(
          'Reconectando à assembleia...',
          'warning'
        );
      }
    )

    .on(
      RoomEvent.Reconnected,
      () => {
        logLiveKit(
          'Conexão restabelecida.',
          {
            room:
              room.name,

            identity:
              room.localParticipant
                ?.identity
          }
        );

        state.connected = true;

        setConnectionConnected();
        showBanner('', 'info');

        refreshRoomInterface(room);
      }
    )

    .on(
      RoomEvent.Disconnected,
      (reason) => {
        state.connected = false;

        logLiveKit(
          'Desconectado da sala.',
          {
            reason,
            intentional:
              intentionalDisconnect,

            room:
              room.name,

            identity:
              room.localParticipant
                ?.identity
          }
        );

        setConnectionDisconnected();

        if (intentionalDisconnect) {
          showBanner('', 'info');
        } else {
          showBanner(
            'Você foi desconectado da assembleia.',
            'error'
          );
        }

        removeAllAttachedAudio();
        renderParticipantsList(room);
      }
    )

    .on(
      RoomEvent.ActiveSpeakersChanged,
      (speakers) => {
        updateActiveSpeakers(
          speakers
        );
      }
    )

    .on(
      RoomEvent.ParticipantConnected,
      (participant) => {
        logLiveKit(
          'Participante conectado.',
          {
            participant:
              getParticipantInfo(
                participant
              ),

            room:
              room.name,

            totalRemote:
              room.remoteParticipants
                .size
          }
        );

        refreshRoomInterface(room);
      }
    )

    .on(
      RoomEvent.ParticipantDisconnected,
      (participant) => {
        logLiveKit(
          'Participante desconectado.',
          {
            participant:
              getParticipantInfo(
                participant
              ),

            room:
              room.name,

            totalRemote:
              room.remoteParticipants
                .size
          }
        );

        state.cameraTracks.delete(
          participant.identity
        );

        if (
          state.screenShareOwner ===
          participant.identity
        ) {
          state.screenShareOwner =
            null;

          state.screenShareTrack =
            null;

          renderScreenShare(
            null,
            ''
          );
        }

        refreshRoomInterface(room);
      }
    )

    .on(
      RoomEvent.TrackSubscribed,
      (
        track,
        publication,
        participant
      ) => {
        logLiveKit(
          'Faixa remota recebida.',
          {
            participant:
              getParticipantInfo(
                participant
              ),

            kind:
              track.kind,

            source:
              publication.source,

            trackSid:
              publication.trackSid ||
              null
          }
        );

        if (
          track.kind ===
          Track.Kind.Audio
        ) {
          attachAudio(
            track,
            participant
          );

          renderParticipantsList(
            room
          );

          return;
        }

        if (
          publication.source ===
          Track.Source.Camera
        ) {
          state.cameraTracks.set(
            participant.identity,
            track
          );

          /*
           * O participante normalmente já possui um tile desde
           * ParticipantConnected. Só recrie a grade se ele ainda
           * não existir e anexe apenas a nova câmera.
           */
          if (
            !getTileMedia(
              participant.identity
            )
          ) {
            renderGrid(room);
          }

          attachCameraTrack(
            participant.identity,
            track
          );
        }

        if (
          publication.source ===
          Track.Source.ScreenShare
        ) {
          state.screenShareTrack =
            track;

          state.screenShareOwner =
            participant.identity;

          renderScreenShare(
            track,
            participant.name || ''
          );
        }

        renderParticipantsList(room);
      }
    )

    .on(
      RoomEvent.TrackUnsubscribed,
      (
        track,
        publication,
        participant
      ) => {
        logLiveKit(
          'Faixa remota removida.',
          {
            participant:
              getParticipantInfo(
                participant
              ),

            kind:
              track.kind,

            source:
              publication.source,

            trackSid:
              publication.trackSid ||
              null
          }
        );

        if (
          track.kind ===
          Track.Kind.Audio
        ) {
          detachAudio(track);

          renderParticipantsList(
            room
          );

          return;
        }

        if (
          publication.source ===
          Track.Source.Camera
        ) {
          state.cameraTracks.delete(
            participant.identity
          );

          detachCameraTrack(
            participant.identity
          );
        }

        if (
          publication.source ===
          Track.Source.ScreenShare
        ) {
          state.screenShareTrack =
            null;

          state.screenShareOwner =
            null;

          renderScreenShare(
            null,
            ''
          );
        }

        renderParticipantsList(room);
      }
    )

    .on(
      RoomEvent.LocalTrackPublished,
      (publication) => {
        logLiveKit(
          'Faixa local publicada.',
          {
            kind:
              publication.kind,

            source:
              publication.source,

            trackSid:
              publication.trackSid ||
              null
          }
        );

        refreshRoomInterface(room);
      }
    )

    .on(
      RoomEvent.LocalTrackUnpublished,
      (publication) => {
        logLiveKit(
          'Faixa local removida.',
          {
            kind:
              publication.kind,

            source:
              publication.source,

            trackSid:
              publication.trackSid ||
              null
          }
        );

        refreshRoomInterface(room);
      }
    );

  try {
    await room.connect(
      tokenInfo.url,
      tokenInfo.token,
      {
        autoSubscribe: true
      }
    );

    state.connected = true;

    setConnectionConnected();
    showBanner('', 'info');

    logLiveKit(
      'Conectado com sucesso.',
      {
        room:
          room.name,

        identity:
          room.localParticipant
            .identity,

        name:
          room.localParticipant
            .name || '',

        remoteParticipants:
          room.remoteParticipants
            .size,

        totalParticipants:
          room.remoteParticipants
            .size + 1
      }
    );

    const preferences =
      getInitialDevicePrefs();

    await enableInitialMicrophone(
      room,
      preferences
    );

    await enableInitialCamera(
      room,
      preferences
    );

    /*
     * Utiliza o estado real retornado pelo LiveKit,
     * e não apenas a preferência armazenada.
     */
    setControlActive(
      'btn-mic',
      room.localParticipant
        .isMicrophoneEnabled ??
        false
    );

    setControlActive(
      'btn-camera',
      room.localParticipant
        .isCameraEnabled ??
        false
    );

    setControlActive(
      'btn-screen',
      room.localParticipant
        .isScreenShareEnabled ??
        false
    );

    refreshRoomInterface(room);
  } catch (error) {
    state.connected = false;

    setConnectionDisconnected();

    showBanner(
      'Não foi possível conectar à assembleia.',
      'error'
    );

    console.error(
      '[LiveKit] Erro ao conectar:',
      error
    );

    try {
      room.disconnect();
    } catch (_) {}

    if (state.room === room) {
      state.room = null;
    }

    throw error;
  }
}

export async function toggleMicrophone() {
  const room = state.room;

  if (
    !room ||
    !state.connected
  ) {
    return;
  }

  const enabled = !(
    room.localParticipant
      .isMicrophoneEnabled ??
    false
  );

  try {
    await room.localParticipant
      .setMicrophoneEnabled(
        enabled
      );

    setControlActive(
      'btn-mic',
      room.localParticipant
        .isMicrophoneEnabled ??
        enabled
    );

    renderParticipantsList(room);
  } catch (error) {
    console.error(
      '[LiveKit] Erro ao alterar microfone:',
      error
    );

    if (
      window.AssemblyUtils?.showToast
    ) {
      window.AssemblyUtils.showToast(
        'Não foi possível alterar o microfone.',
        'error'
      );
    }
  }
}

export async function toggleCamera() {
  const room = state.room;

  if (
    !room ||
    !state.connected
  ) {
    return;
  }

  const enabled = !(
    room.localParticipant
      .isCameraEnabled ??
    false
  );

  try {
    await room.localParticipant
      .setCameraEnabled(
        enabled
      );

    setControlActive(
      'btn-camera',
      room.localParticipant
        .isCameraEnabled ??
        enabled
    );

    /*
     * LocalTrackPublished/LocalTrackUnpublished já atualizam
     * a grade. Aqui atualizamos apenas a lista lateral.
     */
    renderParticipantsList(room);
  } catch (error) {
    console.error(
      '[LiveKit] Erro ao alterar câmera:',
      error
    );

    if (
      window.AssemblyUtils?.showToast
    ) {
      window.AssemblyUtils.showToast(
        'Não foi possível alterar a câmera.',
        'error'
      );
    }
  }
}

export async function toggleScreenShare() {
  const room = state.room;

  if (
    !room ||
    !state.connected
  ) {
    return;
  }

  if (
    !state.permissions
      ?.canScreenShare
  ) {
    if (
      window.AssemblyUtils?.showToast
    ) {
      window.AssemblyUtils.showToast(
        'Você não possui permissão para compartilhar tela.',
        'warning'
      );
    }

    return;
  }

  const enabled = !(
    room.localParticipant
      .isScreenShareEnabled ??
    false
  );

  try {
    await room.localParticipant
      .setScreenShareEnabled(
        enabled
      );

    setControlActive(
      'btn-screen',
      room.localParticipant
        .isScreenShareEnabled ??
        enabled
    );
  } catch (error) {
    console.error(
      '[LiveKit] Erro ao compartilhar tela:',
      error
    );

    if (
      window.AssemblyUtils?.showToast
    ) {
      window.AssemblyUtils.showToast(
        'Não foi possível compartilhar tela.',
        'error'
      );
    }

    setControlActive(
      'btn-screen',
      false
    );
  }
}

export async function disconnectRoom() {
  const room = state.room;

  if (!room) {
    state.connected = false;

    setConnectionDisconnected();

    return;
  }

  intentionalDisconnect = true;

  logLiveKit(
    'Saindo da sala.',
    {
      room:
        room.name,

      identity:
        room.localParticipant
          ?.identity
    }
  );

  try {
    room.disconnect();
  } catch (error) {
    warnLiveKit(
      'Erro durante a desconexão.',
      error
    );
  } finally {
    removeAllAttachedAudio();

    state.cameraTracks.clear();
    state.activeSpeakers.clear();

    state.screenShareTrack = null;
    state.screenShareOwner = null;

    state.connected = false;
    state.room = null;

    setControlActive(
      'btn-mic',
      false
    );

    setControlActive(
      'btn-camera',
      false
    );

    setControlActive(
      'btn-screen',
      false
    );

    renderScreenShare(
      null,
      ''
    );

    setConnectionDisconnected();
  }
}