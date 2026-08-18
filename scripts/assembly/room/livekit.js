import {
  Room,
  RoomEvent,
  Track
} from 'https://esm.sh/livekit-client@2.21.0';

import {
  state
} from './state.js';

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

let intentionalDisconnect =
  false;

function isMobileCameraDevice() {
  const ua = String(navigator.userAgent || '');
  const mobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches === true;
  return mobileUa || coarsePointer;
}

function getFacingModeFromPublication(room) {
  try {
    const publication = room?.localParticipant?.getTrackPublication?.(Track.Source.Camera);
    const mediaTrack = publication?.track?.mediaStreamTrack;
    const facingMode = mediaTrack?.getSettings?.().facingMode;
    if (facingMode === 'environment' || facingMode === 'user') return facingMode;

    const label = String(mediaTrack?.label || '').toLowerCase();
    if (/back|rear|environment|traseir/.test(label)) return 'environment';
    if (/front|user|facetime|frontal|frente/.test(label)) return 'user';
  } catch (_) {}
  return state.mobileCameraFacing || 'user';
}

function findCameraForFacing(devices, facing, activeDeviceId) {
  const patterns = facing === 'environment'
    ? [/back/i, /rear/i, /environment/i, /traseir/i]
    : [/front/i, /user/i, /facetime/i, /frontal/i, /frente/i];

  const labeled = devices.find((device) =>
    device.deviceId !== activeDeviceId && patterns.some((pattern) => pattern.test(device.label || ''))
  );
  if (labeled) return labeled;

  return devices.find((device) => device.deviceId !== activeDeviceId) || null;
}

function safeText(
  value
) {
  return String(
    value ?? ''
  ).trim();
}

function escapeCssSelector(
  value
) {
  const text =
    safeText(
      value
    );

  if (
    window.CSS?.escape
  ) {
    return window.CSS
      .escape(
        text
      );
  }

  return text.replace(
    /["\\]/g,
    '\\$&'
  );
}

function logLiveKit(
  message,
  details = null
) {
  if (details) {
    console.log(
      `[LiveKit] ${message}`,
      details
    );

    return;
  }

  console.log(
    `[LiveKit] ${message}`
  );
}

function warnLiveKit(
  message,
  details = null
) {
  if (details) {
    console.warn(
      `[LiveKit] ${message}`,
      details
    );

    return;
  }

  console.warn(
    `[LiveKit] ${message}`
  );
}

function getParticipantInfo(
  participant
) {
  if (!participant) {
    return null;
  }

  return {
    identity:
      participant.identity,

    name:
      participant.name ||
      '',

    metadata:
      participant.metadata ||
      '',

    isSpeaking:
      participant.isSpeaking ||
      false,

    microphoneEnabled:
      participant
        .isMicrophoneEnabled ??
      false,

    cameraEnabled:
      participant
        .isCameraEnabled ??
      false,

    screenShareEnabled:
      participant
        .isScreenShareEnabled ??
      false
  };
}

function getAllParticipants(
  room
) {
  const participants =
    [];

  if (
    room?.localParticipant
  ) {
    participants.push(
      room.localParticipant
    );
  }

  room
    ?.remoteParticipants
    ?.forEach(
      (participant) => {
        participants.push(
          participant
        );
      }
    );

  return participants;
}

function forEachPublication(
  participant,
  callback
) {
  if (
    !participant
      ?.trackPublications
  ) {
    return;
  }

  participant
    .trackPublications
    .forEach(
      (publication) => {
        callback(
          publication
        );
      }
    );
}

/*
 * ESSENCIAL:
 *
 * Uma publication pode continuar
 * tendo .track mesmo quando está
 * mutada.
 *
 * Não podemos tratar esse track
 * como câmera ativa.
 */
function isPublicationUsable(
  publication
) {
  return Boolean(
    publication &&
    publication.track &&
    publication.isMuted !==
      true
  );
}

function getTileMedia(
  identity
) {
  const escapedIdentity =
    escapeCssSelector(
      identity
    );

  const tile =
    document.querySelector(
      `.call-tile[data-identity="${escapedIdentity}"]`
    );

  return (
    tile?.querySelector(
      '.tile-media'
    ) ||
    null
  );
}

/*
 * ============================================================
 * COMPARTILHAMENTO DE TELA
 * ============================================================
 *
 * Ao compartilhar:
 * - esconde grade de câmeras
 * - ocupa todo o palco
 * - object-fit contain
 *
 * Ao parar:
 * - esconde completamente container
 * - volta imediatamente para grade
 */
function renderScreenShareFixed(
  track,
  ownerName = ''
) {
  renderScreenShare(
    track,
    ownerName
  );

  const container =
    document.getElementById(
      'call-screen-share'
    );

  const surface =
    document.getElementById(
      'screen-share-surface'
    );

  const grid =
    document.getElementById(
      'call-grid'
    );

  const stopButton =
    document.getElementById(
      'btn-stop-screen-share'
    );

  if (
    !container ||
    !surface
  ) {
    return;
  }

  /*
   * NÃO HÁ MAIS
   * COMPARTILHAMENTO.
   */
  if (!track) {
    container.style
      .display =
      'none';

    container.style
      .height =
      '';

    container.style
      .minHeight =
      '';

    container.style
      .marginBottom =
      '';

    container.style
      .flexDirection =
      '';

    surface.style
      .display =
      '';

    surface.style
      .flex =
      '';

    surface.style
      .height =
      '';

    surface.style
      .minHeight =
      '';

    surface.style
      .aspectRatio =
      '';

    surface.style
      .alignItems =
      '';

    surface.style
      .justifyContent =
      '';

    surface.style
      .overflow =
      '';

    surface.style
      .background =
      '';

    if (grid) {
      grid.style.display =
        'grid';
    }

    if (stopButton) {
      stopButton.style
        .display =
        'none';
    }

    return;
  }

  /*
   * HÁ COMPARTILHAMENTO.
   */
  container.style
    .display =
    'flex';

  container.style
    .flexDirection =
    'column';

  container.style
    .height =
    '100%';

  container.style
    .minHeight =
    '0';

  container.style
    .marginBottom =
    '0';

  surface.style
    .display =
    'flex';

  surface.style
    .flex =
    '1 1 auto';

  surface.style
    .height =
    '100%';

  surface.style
    .minHeight =
    '0';

  /*
   * Remove o 16:9 fixo
   * enquanto compartilha.
   */
  surface.style
    .aspectRatio =
    'auto';

  surface.style
    .alignItems =
    'center';

  surface.style
    .justifyContent =
    'center';

  surface.style
    .overflow =
    'hidden';

  surface.style
    .background =
    '#000';

  const video =
    surface.querySelector(
      'video'
    );

  if (video) {
    video.style.width =
      '100%';

    video.style.height =
      '100%';

    video.style.display =
      'block';

    /*
     * IMPORTANTE:
     * contain mostra a tela inteira.
     */
    video.style.objectFit =
      'contain';

    video.style
      .objectPosition =
      'center center';

    video.style
      .background =
      '#000';
  }

  /*
   * Durante o compartilhamento,
   * a tela ocupa o palco principal.
   */
  if (grid) {
    grid.style.display =
      'none';
  }

  /*
   * Somente quem compartilha
   * vê o botão Parar.
   */
  if (stopButton) {
    const localIdentity =
      state.room
        ?.localParticipant
        ?.identity ||
      '';

    stopButton.style
      .display =
      (
        localIdentity &&
        state.screenShareOwner ===
          localIdentity
      )
        ? ''
        : 'none';
  }
}

function clearCameraElement(
  identity
) {
  const media =
    getTileMedia(
      identity
    );

  if (!media) {
    return;
  }

  media
    .querySelectorAll(
      'video[data-assembly-camera="1"]'
    )
    .forEach(
      (element) =>
        element.remove()
    );
}

function attachCameraTrack(
  identity,
  track
) {
  const media =
    getTileMedia(
      identity
    );

  if (
    !media ||
    !track
  ) {
    return;
  }

  /*
   * Só removemos o avatar se
   * realmente existe câmera ativa.
   */
  while (
    media.firstChild
  ) {
    media.removeChild(
      media.firstChild
    );
  }

  try {
    /*
     * Evita múltiplos vídeos
     * do mesmo track.
     */
    try {
      track
        .detach?.()
        .forEach?.(
          (element) =>
            element.remove?.()
        );
    } catch (_) {}

    const element =
      track.attach();

    element.playsInline =
      true;

    element.autoplay =
      true;

    element.dataset
      .assemblyCamera =
      '1';

    element.style.width =
      '100%';

    element.style.height =
      '100%';

    element.style.objectFit =
      'cover';

    element.style
      .objectPosition =
      'center center';

    /*
     * Câmera local sem áudio.
     */
    element.muted =
      identity ===
      state.room
        ?.localParticipant
        ?.identity;

    media.appendChild(
      element
    );

    const playPromise =
      element.play?.();

    if (
      playPromise?.catch
    ) {
      playPromise.catch(
        () => {
          warnLiveKit(
            'O navegador bloqueou a reprodução automática do vídeo.'
          );
        }
      );
    }
  } catch (error) {
    warnLiveKit(
      'Não foi possível anexar a câmera do participante.',
      {
        identity,
        error
      }
    );
  }
}

function getAudioTrackIdentifier(
  track
) {
  return (
    safeText(
      track?.sid
    ) ||
    safeText(
      track
        ?.mediaStreamTrack
        ?.id
    )
  );
}

function attachAudio(
  track,
  participant = null
) {
  if (!track) {
    return;
  }

  try {
    const trackIdentifier =
      getAudioTrackIdentifier(
        track
      );

    if (
      trackIdentifier
    ) {
      const escapedIdentifier =
        escapeCssSelector(
          trackIdentifier
        );

      const existingAudio =
        document.querySelector(
          `[data-lk-track-id="${escapedIdentifier}"]`
        );

      if (existingAudio) {
        return;
      }
    }

    const element =
      track.attach();

    element.autoplay =
      true;

    element.playsInline =
      true;

    element.dataset.lkAudio =
      '1';

    element.style.display =
      'none';

    if (
      trackIdentifier
    ) {
      element.dataset
        .lkTrackId =
        trackIdentifier;
    }

    if (
      participant?.identity
    ) {
      element.dataset
        .lkParticipant =
        participant.identity;
    }

    document.body
      .appendChild(
        element
      );

    const playPromise =
      element.play?.();

    if (
      playPromise?.catch
    ) {
      playPromise.catch(
        () => {
          warnLiveKit(
            'O navegador bloqueou a reprodução automática do áudio.',
            getParticipantInfo(
              participant
            )
          );
        }
      );
    }
  } catch (error) {
    warnLiveKit(
      'Não foi possível anexar o áudio remoto.',
      {
        participant:
          getParticipantInfo(
            participant
          ),

        error
      }
    );
  }
}

function detachAudio(
  track
) {
  if (!track) {
    return;
  }

  try {
    track
      .detach()
      .forEach(
        (element) => {
          element.remove();
        }
      );
  } catch (error) {
    warnLiveKit(
      'Não foi possível remover o áudio remoto.',
      error
    );
  }
}

function removeAllAttachedAudio() {
  document
    .querySelectorAll(
      '[data-lk-audio="1"]'
    )
    .forEach(
      (element) => {
        element.remove();
      }
    );
}

function syncRemoteAudio(
  room
) {
  if (!room) {
    return;
  }

  room
    .remoteParticipants
    ?.forEach(
      (participant) => {
        forEachPublication(
          participant,
          (publication) => {
            if (
              publication.kind ===
                Track.Kind.Audio &&
              isPublicationUsable(
                publication
              )
            ) {
              attachAudio(
                publication.track,
                participant
              );
            }
          }
        );
      }
    );
}

/*
 * Não recria mais toda a grade
 * quando muda o participante falando.
 *
 * Isso evita flicker e reanexação
 * incorreta da câmera.
 */
function updateActiveSpeakerClasses(
  speakers
) {
  state.activeSpeakers
    .clear();

  (
    speakers ||
    []
  ).forEach(
    (participant) => {
      if (
        participant?.identity
      ) {
        state.activeSpeakers
          .add(
            participant.identity
          );
      }
    }
  );

  document
    .querySelectorAll(
      '.call-tile'
    )
    .forEach(
      (tile) => {
        const identity =
          tile.dataset
            .identity ||
          '';

        tile.classList
          .toggle(
            'active-speaker',
            state
              .activeSpeakers
              .has(
                identity
              )
          );
      }
    );
}

function findActiveMedia(
  room
) {
  const cameras =
    new Map();

  let screenTrack =
    null;

  let screenOwner =
    null;

  let screenOwnerName =
    '';

  getAllParticipants(
    room
  ).forEach(
    (participant) => {
      forEachPublication(
        participant,
        (publication) => {
          if (
            !isPublicationUsable(
              publication
            )
          ) {
            return;
          }

          /*
           * CÂMERA
           */
          if (
            publication.source ===
              Track.Source.Camera &&
            participant
              .isCameraEnabled !==
              false
          ) {
            cameras.set(
              participant.identity,
              publication.track
            );
          }

          /*
           * SCREEN SHARE
           */
          if (
            !screenTrack &&
            publication.source ===
              Track.Source.ScreenShare &&
            participant
              .isScreenShareEnabled !==
              false
          ) {
            screenTrack =
              publication.track;

            screenOwner =
              participant.identity;

            screenOwnerName =
              participant.name ||
              '';
          }
        }
      );
    }
  );

  return {
    cameras,
    screenTrack,
    screenOwner,
    screenOwnerName
  };
}

/*
 * Sincroniza a UI com o estado REAL
 * atual do LiveKit.
 */
function syncMediaFromRoom(
  room
) {
  if (!room) {
    state.cameraTracks
      .clear();

    state.screenShareTrack =
      null;

    state.screenShareOwner =
      null;

    renderScreenShareFixed(
      null,
      ''
    );

    return;
  }

  const media =
    findActiveMedia(
      room
    );

  state.cameraTracks
    .clear();

  media.cameras
    .forEach(
      (
        track,
        identity
      ) => {
        state.cameraTracks
          .set(
            identity,
            track
          );
      }
    );

  state.screenShareTrack =
    media.screenTrack;

  state.screenShareOwner =
    media.screenOwner;

  /*
   * Primeiro cria os tiles.
   *
   * renderGrid() cria o avatar
   * automaticamente.
   */
  renderGrid(
    room
  );

  /*
   * Depois substitui avatar por
   * vídeo SOMENTE se a câmera
   * estiver realmente ativa.
   */
  state.cameraTracks
    .forEach(
      (
        track,
        identity
      ) => {
        attachCameraTrack(
          identity,
          track
        );
      }
    );

  renderScreenShareFixed(
    state.screenShareTrack,
    media.screenOwnerName
  );

  renderParticipantsList(
    room
  );

  /*
   * Mantém indicação visual
   * de quem está falando.
   */
  document
    .querySelectorAll(
      '.call-tile'
    )
    .forEach(
      (tile) => {
        const identity =
          tile.dataset
            .identity ||
          '';

        tile.classList
          .toggle(
            'active-speaker',
            state
              .activeSpeakers
              .has(
                identity
              )
          );
      }
    );

  syncRemoteAudio(
    room
  );
}

function getInitialDevicePrefs() {
  const preferences = {
    cameraOn:
      true,

    micOn:
      true,

    cameraDeviceId:
      null,

    micDeviceId:
      null
  };

  try {
    preferences.cameraOn =
      sessionStorage.getItem(
        'prep_camera_on'
      ) !==
      '0';

    preferences.micOn =
      sessionStorage.getItem(
        'prep_mic_on'
      ) !==
      '0';

    preferences.cameraDeviceId =
      sessionStorage.getItem(
        'prep_camera_dev'
      ) ||
      null;

    preferences.micDeviceId =
      sessionStorage.getItem(
        'prep_mic_dev'
      ) ||
      null;
  } catch (error) {
    warnLiveKit(
      'Não foi possível recuperar as preferências dos dispositivos.',
      error
    );
  }

  if (isMobileCameraDevice()) {
    /* A reunião sempre inicia pela câmera frontal no celular. */
    preferences.cameraDeviceId = null;
    state.mobileCameraFacing = 'user';
  }

  return preferences;
}

async function enableInitialMicrophone(
  room,
  preferences
) {
  try {
    const options =
      preferences
        .micDeviceId
        ? {
            deviceId:
              preferences
                .micDeviceId
          }
        : undefined;

    await room
      .localParticipant
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

    window
      .AssemblyUtils
      ?.showToast?.(
        'Não foi possível acessar o microfone.',
        'warning'
      );
  }
}

async function enableInitialCamera(
  room,
  preferences
) {
  try {
    const options = isMobileCameraDevice()
      ? { facingMode: 'user' }
      : preferences.cameraDeviceId
        ? { deviceId: preferences.cameraDeviceId }
        : undefined;

    await room
      .localParticipant
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

    window
      .AssemblyUtils
      ?.showToast?.(
        'Não foi possível acessar a câmera.',
        'warning'
      );
  }
}

function handlePublicationStateChanged(
  room,
  publication,
  participant
) {
  logLiveKit(
    'Estado de faixa alterado.',
    {
      participant:
        getParticipantInfo(
          participant
        ),

      source:
        publication?.source,

      kind:
        publication?.kind,

      muted:
        publication?.isMuted,

      trackSid:
        publication
          ?.trackSid ||
        null
    }
  );

  syncMediaFromRoom(
    room
  );
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

  if (state.room) {
    try {
      state.room
        .disconnect();
    } catch (_) {}

    state.room =
      null;
  }

  intentionalDisconnect =
    false;

  setConnectionConnecting();

  showBanner(
    '',
    'info'
  );

  logLiveKit(
    'Iniciando conexão.',
    {
      url:
        tokenInfo.url,

      room:
        tokenInfo.room ||
        tokenInfo
          .roomName ||
        null,

      identity:
        tokenInfo.identity ||
        tokenInfo
          .participantIdentity ||
        null
    }
  );

  const room =
    new Room({
      adaptiveStream:
        true,

      dynacast:
        true,

      videoCaptureDefaults: {
        facingMode: 'user'
      },

      publishDefaults: {
        videoCodec:
          'vp8',

        simulcast:
          true,

        dtx:
          true
      }
    });

  state.room =
    room;

  room
    .on(
      RoomEvent.Reconnecting,
      () => {
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
        state.connected =
          true;

        setConnectionConnected();

        showBanner(
          '',
          'info'
        );

        syncMediaFromRoom(
          room
        );
      }
    )

    .on(
      RoomEvent.Disconnected,
      (reason) => {
        state.connected =
          false;

        logLiveKit(
          'Desconectado da sala.',
          {
            reason,

            intentional:
              intentionalDisconnect,

            room:
              room.name,

            identity:
              room
                .localParticipant
                ?.identity
          }
        );

        setConnectionDisconnected();

        if (
          intentionalDisconnect
        ) {
          showBanner(
            '',
            'info'
          );
        } else {
          showBanner(
            'Você foi desconectado da assembleia.',
            'error'
          );
        }

        removeAllAttachedAudio();

        state.cameraTracks
          .clear();

        state.screenShareTrack =
          null;

        state.screenShareOwner =
          null;

        renderScreenShareFixed(
          null,
          ''
        );

        renderParticipantsList(
          room
        );
      }
    )

    .on(
      RoomEvent
        .ActiveSpeakersChanged,
      (speakers) => {
        updateActiveSpeakerClasses(
          speakers
        );
      }
    )

    .on(
      RoomEvent
        .ParticipantConnected,
      (participant) => {
        logLiveKit(
          'Participante conectado.',
          getParticipantInfo(
            participant
          )
        );

        syncMediaFromRoom(
          room
        );
      }
    )

    .on(
      RoomEvent
        .ParticipantDisconnected,
      (participant) => {
        logLiveKit(
          'Participante desconectado.',
          getParticipantInfo(
            participant
          )
        );

        state.cameraTracks
          .delete(
            participant.identity
          );

        if (
          state.screenShareOwner ===
          participant.identity
        ) {
          state.screenShareTrack =
            null;

          state.screenShareOwner =
            null;

          renderScreenShareFixed(
            null,
            ''
          );
        }

        document
          .querySelectorAll(
            `[data-lk-participant="${escapeCssSelector(
              participant.identity
            )}"]`
          )
          .forEach(
            (element) =>
              element.remove()
          );

        syncMediaFromRoom(
          room
        );
      }
    )

    .on(
      RoomEvent
        .TrackSubscribed,
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
              publication
                .source,

            trackSid:
              publication
                .trackSid ||
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
        }

        syncMediaFromRoom(
          room
        );
      }
    )

    .on(
      RoomEvent
        .TrackUnsubscribed,
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
              publication
                .source,

            trackSid:
              publication
                .trackSid ||
              null
          }
        );

        if (
          track.kind ===
          Track.Kind.Audio
        ) {
          detachAudio(
            track
          );
        }

        if (
          publication.source ===
          Track.Source.Camera
        ) {
          state.cameraTracks
            .delete(
              participant.identity
            );

          clearCameraElement(
            participant.identity
          );
        }

        if (
          publication.source ===
            Track.Source
              .ScreenShare &&
          state.screenShareOwner ===
            participant.identity
        ) {
          state.screenShareTrack =
            null;

          state.screenShareOwner =
            null;

          renderScreenShareFixed(
            null,
            ''
          );
        }

        syncMediaFromRoom(
          room
        );
      }
    )

    /*
     * MUITO IMPORTANTE:
     *
     * setCameraEnabled(false)
     * frequentemente MUTA a faixa.
     */
    .on(
      RoomEvent.TrackMuted,
      (
        publication,
        participant
      ) => {
        handlePublicationStateChanged(
          room,
          publication,
          participant
        );
      }
    )

    .on(
      RoomEvent.TrackUnmuted,
      (
        publication,
        participant
      ) => {
        handlePublicationStateChanged(
          room,
          publication,
          participant
        );
      }
    )

    .on(
      RoomEvent
        .LocalTrackPublished,
      (publication) => {
        logLiveKit(
          'Faixa local publicada.',
          {
            kind:
              publication
                .kind,

            source:
              publication
                .source,

            trackSid:
              publication
                .trackSid ||
              null
          }
        );

        syncMediaFromRoom(
          room
        );
      }
    )

    .on(
      RoomEvent
        .LocalTrackUnpublished,
      (publication) => {
        logLiveKit(
          'Faixa local removida.',
          {
            kind:
              publication
                .kind,

            source:
              publication
                .source,

            trackSid:
              publication
                .trackSid ||
              null
          }
        );

        const localIdentity =
          room
            .localParticipant
            ?.identity;

        if (
          publication.source ===
            Track.Source.Camera &&
          localIdentity
        ) {
          state.cameraTracks
            .delete(
              localIdentity
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

          renderScreenShareFixed(
            null,
            ''
          );
        }

        syncMediaFromRoom(
          room
        );
      }
    );

  try {
    await room.connect(
      tokenInfo.url,
      tokenInfo.token,
      {
        autoSubscribe:
          true
      }
    );

    state.connected =
      true;

    setConnectionConnected();

    showBanner(
      '',
      'info'
    );

    logLiveKit(
      'Conectado com sucesso.',
      {
        room:
          room.name,

        identity:
          room
            .localParticipant
            .identity,

        name:
          room
            .localParticipant
            .name ||
          '',

        remoteParticipants:
          room
            .remoteParticipants
            .size,

        totalParticipants:
          room
            .remoteParticipants
            .size +
          1
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

    setControlActive(
      'btn-mic',
      room
        .localParticipant
        .isMicrophoneEnabled ??
      false
    );

    setControlActive(
      'btn-camera',
      room
        .localParticipant
        .isCameraEnabled ??
      false
    );

    setControlActive(
      'btn-screen',
      room
        .localParticipant
        .isScreenShareEnabled ??
      false
    );

    syncMediaFromRoom(
      room
    );
  } catch (error) {
    state.connected =
      false;

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

    if (
      state.room ===
      room
    ) {
      state.room =
        null;
    }

    throw error;
  }
}

export async function toggleMicrophone() {
  const room =
    state.room;

  if (
    !room ||
    !state.connected
  ) {
    return;
  }

  const enabled =
    !(
      room
        .localParticipant
        .isMicrophoneEnabled ??
      false
    );

  try {
    await room
      .localParticipant
      .setMicrophoneEnabled(
        enabled
      );

    setControlActive(
      'btn-mic',
      room
        .localParticipant
        .isMicrophoneEnabled ??
      enabled
    );

    renderParticipantsList(
      room
    );
  } catch (error) {
    console.error(
      '[LiveKit] Erro ao alterar microfone:',
      error
    );

    window
      .AssemblyUtils
      ?.showToast?.(
        'Não foi possível alterar o microfone.',
        'error'
      );
  }
}

export async function canSwitchMobileCamera() {
  if (!isMobileCameraDevice()) return false;

  try {
    const devices = await Room.getLocalDevices('videoinput', true);
    return Array.isArray(devices) && devices.length > 1;
  } catch (error) {
    warnLiveKit('Não foi possível listar as câmeras do celular.', error);
    return false;
  }
}

export async function switchMobileCamera() {
  const room = state.room;
  if (!room || !state.connected || !isMobileCameraDevice()) return false;

  const cameraEnabled = room.localParticipant.isCameraEnabled ?? false;
  if (!cameraEnabled) {
    await room.localParticipant.setCameraEnabled(true, { facingMode: 'user' });
    state.mobileCameraFacing = 'user';
    setControlActive('btn-camera', true);
    syncMediaFromRoom(room);
    return true;
  }

  const currentFacing = getFacingModeFromPublication(room);
  const nextFacing = currentFacing === 'environment' ? 'user' : 'environment';

  try {
    const devices = await Room.getLocalDevices('videoinput', true);
    const activeDeviceId = room.getActiveDevice?.('videoinput') || '';
    const targetDevice = findCameraForFacing(devices, nextFacing, activeDeviceId);

    if (targetDevice?.deviceId) {
      const switched = await room.switchActiveDevice('videoinput', targetDevice.deviceId, true);
      if (switched !== false) {
        state.mobileCameraFacing = nextFacing;
        syncMediaFromRoom(room);
        return true;
      }
    }

    /* Fallback para navegadores móveis que não expõem labels/deviceIds úteis. */
    await room.localParticipant.setCameraEnabled(false);
    await room.localParticipant.setCameraEnabled(true, { facingMode: nextFacing });
    state.mobileCameraFacing = nextFacing;
    setControlActive('btn-camera', true);
    syncMediaFromRoom(room);
    return true;
  } catch (error) {
    console.error('[LiveKit] Erro ao alternar câmera frontal/traseira:', error);
    window.AssemblyUtils?.showToast?.('Não foi possível trocar a câmera do celular.', 'error');
    return false;
  }
}

export async function toggleCamera() {
  const room =
    state.room;

  if (
    !room ||
    !state.connected
  ) {
    return;
  }

  const enabled =
    !(
      room
        .localParticipant
        .isCameraEnabled ??
      false
    );

  try {
    await room
      .localParticipant
      .setCameraEnabled(
        enabled
      );

    setControlActive(
      'btn-camera',
      room
        .localParticipant
        .isCameraEnabled ??
      enabled
    );

    /*
     * Imediatamente refaz tile.
     *
     * Se câmera desligada:
     * avatar volta ao centro.
     */
    syncMediaFromRoom(
      room
    );
  } catch (error) {
    console.error(
      '[LiveKit] Erro ao alterar câmera:',
      error
    );

    window
      .AssemblyUtils
      ?.showToast?.(
        'Não foi possível alterar a câmera.',
        'error'
      );
  }
}

export async function toggleScreenShare() {
  const room =
    state.room;

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
    window
      .AssemblyUtils
      ?.showToast?.(
        'Você não possui permissão para compartilhar tela.',
        'warning'
      );

    return;
  }

  const enabled =
    !(
      room
        .localParticipant
        .isScreenShareEnabled ??
      false
    );

  try {
    /*
     * Se está PARANDO:
     * limpa a UI antes do LiveKit.
     *
     * Isso elimina a tela vazia
     * da imagem 4.
     */
    if (!enabled) {
      state.screenShareTrack =
        null;

      state.screenShareOwner =
        null;

      renderScreenShareFixed(
        null,
        ''
      );

      setControlActive(
        'btn-screen',
        false
      );
    }

    await room
      .localParticipant
      .setScreenShareEnabled(
        enabled
      );

    setControlActive(
      'btn-screen',
      room
        .localParticipant
        .isScreenShareEnabled ??
      enabled
    );

    syncMediaFromRoom(
      room
    );
  } catch (error) {
    console.error(
      '[LiveKit] Erro ao compartilhar tela:',
      error
    );

    state.screenShareTrack =
      null;

    state.screenShareOwner =
      null;

    renderScreenShareFixed(
      null,
      ''
    );

    setControlActive(
      'btn-screen',
      false
    );

    window
      .AssemblyUtils
      ?.showToast?.(
        'Não foi possível compartilhar tela.',
        'error'
      );
  }
}

export async function disconnectRoom() {
  const room =
    state.room;

  if (!room) {
    state.connected =
      false;

    setConnectionDisconnected();

    return;
  }

  intentionalDisconnect =
    true;

  logLiveKit(
    'Saindo da sala.',
    {
      room:
        room.name,

      identity:
        room
          .localParticipant
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

    state.cameraTracks
      .clear();

    state.activeSpeakers
      .clear();

    state.screenShareTrack =
      null;

    state.screenShareOwner =
      null;

    state.connected =
      false;

    state.room =
      null;

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

    renderScreenShareFixed(
      null,
      ''
    );

    setConnectionDisconnected();
  }
}