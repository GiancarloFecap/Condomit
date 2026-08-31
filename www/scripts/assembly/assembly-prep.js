(function () {
  'use strict';

  const U = window.AssemblyUtils;
  const A = window.AssemblyAuth;
  const API = window.AssemblyAPI;

  const state = {
    assemblyId: null,
    assembly: null,
    user: null,
    userCep: null,
    stream: null,
    audioContext: null,
    analyser: null,
    dataArray: null,
    audioAnimationId: null,
    cameraOn: true,
    micOn: true,
    cameraDeviceId: null,
    micDeviceId: null,
    audioOutputDeviceId: null,
    mediaRecorder: null,
    recordedChunks: [],
    testRecording: false,
    testPlaying: false,
    permissions: {
      camera: 'unknown',
      microphone: 'unknown'
    }
  };

  function $(id) { return document.getElementById(id); }

  function toast(msg, type) {
    if (U && U.showToast) return U.showToast(msg, type);
    const c = $('toast-container');
    if (!c) return null;
    const t = document.createElement('div');
    t.className = 'toast toast-' + (type || 'info');
    t.textContent = msg;
    Object.assign(t.style, {
      position: 'fixed', top: '20px', right: '20px',
      padding: '12px 20px', borderRadius: '8px', color: '#fff',
      fontWeight: '500', zIndex: '99999',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      transform: 'translateX(120%)', transition: 'transform 0.3s ease',
      backgroundColor: type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#3b82f6'
    });
    c.appendChild(t);
    requestAnimationFrame(() => { t.style.transform = 'translateX(0)'; });
    setTimeout(() => {
      t.style.transform = 'translateX(120%)';
      setTimeout(() => t.remove(), 300);
    }, 3500);
    return t;
  }

  function showError(title, message) {
    $('loading-screen').style.display = 'none';
    $('error-screen').style.display = 'flex';
    $('error-title').textContent = title || 'Erro';
    $('error-message').textContent = message || 'Ocorreu um erro inesperado.';
  }

  function showMain() {
    $('loading-screen').style.display = 'none';
    $('error-screen').style.display = 'none';
    $('main-app').style.display = 'flex';
  }

  function getDisplayName(user) {
    if (!user) return 'Usuário';
    const n = user.name || user.full_name || user.displayName || user.email || 'Usuário';
    return typeof n === 'string' ? n : 'Usuário';
  }

  function getCondoName(assembly) {
    if (!assembly) return '--';
    if (assembly.condominium_name) return assembly.condominium_name;
    if (assembly.condominium && typeof assembly.condominium === 'object') {
      return assembly.condominium.name || assembly.condominium.condominium_name || '--';
    }
    if (assembly.cep) return `CEP ${assembly.cep}`;
    return '--';
  }

  function getAssemblyCep(assembly) {
    if (!assembly) return null;
    if (assembly.cep) return assembly.cep;
    if (assembly.condominium_cep) return assembly.condominium_cep;
    if (assembly.condominium && typeof assembly.condominium === 'object') {
      return assembly.condominium.cep || null;
    }
    return null;
  }

  function getAssemblyDate(assembly) {
    if (!assembly) return '--/--/----';
    const d = assembly.scheduled_at || assembly.date || assembly.assembly_date || assembly.start_date;
    if (!d) return '--/--/----';
    if (U && U.formatDateBR) return U.formatDateBR(d);
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '--/--/----';
    return dt.toLocaleDateString('pt-BR');
  }

  function getAssemblyTime(assembly) {
    if (!assembly) return '--:--';
    const d = assembly.scheduled_at || assembly.start_time || assembly.time || assembly.assembly_time;
    if (!d) {
      const dt = assembly.scheduled_at ? new Date(assembly.scheduled_at) : null;
      if (dt && !isNaN(dt.getTime())) {
        return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
      }
      return '--:--';
    }
    if (typeof d === 'string' && d.includes(':')) {
      const parts = d.split(':');
      return `${parts[0]}:${parts[1] || '00'}`;
    }
    if (U && U.formatTime) return U.formatTime(d);
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '--:--';
    return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
  }

  function getAssemblyStartDateTime(assembly) {
    if (!assembly) return null;
    if (assembly.scheduled_at) {
      const direct = new Date(assembly.scheduled_at);
      if (!Number.isNaN(direct.getTime())) return direct;
    }

    const date = String(assembly.date || assembly.assembly_date || assembly.start_date || '').slice(0, 10);
    const time = String(assembly.start_time || assembly.time || assembly.assembly_time || '00:00').slice(0, 5);
    if (!date) return null;

    const local = new Date(`${date}T${time}:00`);
    return Number.isNaN(local.getTime()) ? null : local;
  }

  function isAssemblyClosed(assembly) {
    if (!assembly) return false;
    const s = (assembly.status || '').toString().toLowerCase();
    return ['ended', 'closed', 'finished', 'completed', 'encerrada', 'cancelada', 'cancelled', 'canceled'].includes(s);
  }

  function populateAssemblyInfo() {
    const a = state.assembly;
    const u = state.user;
    const name = a ? (a.title || a.name || a.assembly_name || 'Assembleia') : 'Assembleia';
    const displayName = getDisplayName(u);
    const initials = U && U.getInitials ? U.getInitials(displayName) : (displayName ? displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'US');

    $('header-assembly-name').textContent = name;
    $('header-assembly-date').textContent = getAssemblyDate(a);
    $('header-assembly-time').textContent = getAssemblyTime(a);
    $('header-user-name').textContent = displayName;
    $('header-user-avatar').textContent = initials;
    $('placeholder-avatar').textContent = initials;
    $('video-display-name').textContent = displayName;
    $('summary-name').textContent = name;
    $('summary-date').textContent = getAssemblyDate(a);
    $('summary-time').textContent = getAssemblyTime(a);
    $('summary-condo').textContent = getCondoName(a);
    $('summary-user').textContent = displayName;
  }

  function updateStatusCard(type, status, title, desc) {
    const item = $(`status-${type === 'perm' ? 'permissions' : type}`);
    if (!item) return;
    item.classList.remove('ok', 'warning', 'error');
    item.classList.add(status || 'warning');

    const icon = type === 'camera' ? $('status-camera-icon')
      : type === 'mic' ? $('status-mic-icon')
      : $('status-perm-icon');
    const titleEl = type === 'camera' ? $('status-camera-title')
      : type === 'mic' ? $('status-mic-title')
      : $('status-perm-title');
    const descEl = type === 'camera' ? $('status-camera-desc')
      : type === 'mic' ? $('status-mic-desc')
      : $('status-perm-desc');

    if (icon) {
      icon.className = status === 'ok' ? 'fas fa-check-circle'
        : status === 'error' ? 'fas fa-times-circle'
        : type === 'camera' ? 'fas fa-video'
        : type === 'mic' ? 'fas fa-microphone'
        : 'fas fa-shield-alt';
    }
    if (titleEl && title) titleEl.textContent = title;
    if (descEl && desc) descEl.textContent = desc;
  }

  function updateBadgeCamera() {
    const badge = $('badge-camera');
    const icon = badge.querySelector('i');
    const txt = $('badge-camera-text');
    badge.classList.remove('camera-on', 'camera-off');
    if (state.cameraOn) {
      badge.classList.add('camera-on');
      icon.className = 'fas fa-video';
      txt.textContent = 'Câmera';
    } else {
      badge.classList.add('camera-off');
      icon.className = 'fas fa-video-slash';
      txt.textContent = 'Câmera off';
    }
  }

  function updateBadgeMic() {
    const badge = $('badge-mic');
    const icon = badge.querySelector('i');
    const txt = $('badge-mic-text');
    badge.classList.remove('mic-on', 'mic-off');
    if (state.micOn) {
      badge.classList.add('mic-on');
      icon.className = 'fas fa-microphone';
      txt.textContent = 'Mic';
    } else {
      badge.classList.add('mic-off');
      icon.className = 'fas fa-microphone-slash';
      txt.textContent = 'Mic off';
    }
  }

  function updateVideoPlaceholder() {
    const ph = $('videoPlaceholder');
    const video = $('localVideo');
    if (state.cameraOn && state.stream && state.stream.getVideoTracks().length > 0) {
      ph.classList.add('hidden');
      video.style.visibility = 'visible';
    } else {
      ph.classList.remove('hidden');
      video.style.visibility = 'hidden';
    }
  }

  function updateEnterButton() {
    const btn = $('btn-enter');
    const canEnter = state.permissions.camera !== 'denied' || state.permissions.microphone !== 'denied';
    const hasBasicPerm = state.permissions.camera !== 'unknown' || state.permissions.microphone !== 'unknown';
    btn.disabled = !(hasBasicPerm && canEnter);
  }

  function isMobileMediaDevice() {
    const ua = String(navigator.userAgent || '');
    return /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
      || window.matchMedia?.('(pointer: coarse)')?.matches === true;
  }

  function normalizeMobileCameras(devices) {
    const cameras = Array.isArray(devices) ? devices.filter(Boolean) : [];
    if (!isMobileMediaDevice() || cameras.length <= 1) {
      return cameras.map((device, index) => ({ device, label: device.label || `Câmera ${index + 1}` }));
    }

    const labelOf = (device) => String(device?.label || '').toLowerCase();
    let front = cameras.find((device) => /facing\s*front|camera\s*1|front|user|frontal|frente|facetime/.test(labelOf(device)));
    let back = cameras.find((device) => /facing\s*back|camera\s*0|back|rear|environment|traseir/.test(labelOf(device)));

    if (!front) front = cameras[0] || null;
    if (!back) back = cameras.find((device) => device !== front) || null;

    const result = [];
    if (front) result.push({ device: front, label: 'Câmera frontal' });
    if (back && back !== front) result.push({ device: back, label: 'Câmera traseira' });
    return result;
  }

  function populateCameraSelect(select, devices, selectedId) {
    if (!select) return;
    const normalized = normalizeMobileCameras(devices);
    select.innerHTML = '';
    if (!normalized.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Nenhuma câmera encontrada';
      select.appendChild(option);
      select.disabled = true;
      return;
    }
    select.disabled = false;
    normalized.forEach(({ device, label }, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId || `camera-${index}`;
      option.textContent = label;
      if ((selectedId && device.deviceId === selectedId) || (!selectedId && index === 0)) option.selected = true;
      select.appendChild(option);
    });
    state.cameraDeviceId = select.value || normalized[0]?.device?.deviceId || '';
  }

  function populateDeviceSelect(select, devices, selectedId, defaultLabel) {
    if (!select) return;
    select.innerHTML = '';
    if (!devices || devices.length === 0) {
      const o = document.createElement('option');
      o.value = '';
      o.textContent = defaultLabel || 'Nenhum dispositivo encontrado';
      select.appendChild(o);
      select.disabled = true;
      return;
    }
    select.disabled = false;
    devices.forEach((d, i) => {
      const o = document.createElement('option');
      o.value = d.deviceId || `default-${i}`;
      o.textContent = d.label || `${defaultLabel || 'Dispositivo'} ${i + 1}`;
      if ((selectedId && d.deviceId === selectedId) || (!selectedId && i === 0)) {
        o.selected = true;
      }
      select.appendChild(o);
    });
  }

  async function enumerateAndPopulate() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      populateDeviceSelect($('camera-select'), [], null, 'Nenhum dispositivo');
      populateDeviceSelect($('mic-select'), [], null, 'Nenhum dispositivo');
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(d => d.kind === 'videoinput');
      const mics = devices.filter(d => d.kind === 'audioinput');
      const outputs = devices.filter(d => d.kind === 'audiooutput');

      populateCameraSelect($('camera-select'), cameras, state.cameraDeviceId);
      populateDeviceSelect($('mic-select'), mics, state.micDeviceId, 'Microfone');

      if (outputs.length > 0 && typeof $('localVideo').setSinkId === 'function') {
        $('audio-output-field').style.display = '';
        populateDeviceSelect($('audio-output-select'), outputs, state.audioOutputDeviceId, 'Saída de áudio');
      } else {
        $('audio-output-field').style.display = 'none';
      }
    } catch (e) {
      console.warn('enumerateDevices falhou:', e);
    }
  }

  function cleanupStreamOnly() {
    if (state.stream) {
      state.stream.getTracks().forEach(t => {
        try { t.stop(); } catch (_) {}
      });
      state.stream = null;
    }
  }

  function cleanupAudio() {
    if (state.audioAnimationId) {
      cancelAnimationFrame(state.audioAnimationId);
      state.audioAnimationId = null;
    }
    if (state.analyser) {
      try { state.analyser.disconnect(); } catch (_) {}
      state.analyser = null;
    }
    if (state.audioContext) {
      try { state.audioContext.close(); } catch (_) {}
      state.audioContext = null;
    }
    state.dataArray = null;
  }

  function cleanupStreams() {
    cleanupStreamOnly();
    cleanupAudio();
    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
      try { state.mediaRecorder.stop(); } catch (_) {}
    }
    state.mediaRecorder = null;
    state.recordedChunks = [];
  }

  function resetAudioMeterBars() {
    const bars = document.querySelectorAll('#audio-meter .bar');
    bars.forEach(b => { b.classList.remove('active', 'low', 'mid', 'high'); });
    const lvl = $('audio-meter-level');
    if (lvl) lvl.textContent = '-∞ dB';
  }

  function animateAudioMeter() {
    if (!state.analyser || !state.dataArray) return;

    function tick() {
      state.audioAnimationId = requestAnimationFrame(tick);
      state.analyser.getByteFrequencyData(state.dataArray);

      let sum = 0;
      for (let i = 0; i < state.dataArray.length; i++) sum += state.dataArray[i];
      const avg = sum / state.dataArray.length;
      const normalized = Math.min(1, avg / 128);

      const bars = document.querySelectorAll('#audio-meter .bar');
      const activeCount = Math.min(bars.length, Math.ceil(normalized * bars.length));

      bars.forEach((bar, idx) => {
        bar.classList.remove('active', 'low', 'mid', 'high');
        if (idx < activeCount) {
          bar.classList.add('active');
          const pct = (idx + 1) / bars.length;
          if (pct <= 0.4) bar.classList.add('low');
          else if (pct <= 0.75) bar.classList.add('mid');
          else bar.classList.add('high');
        }
      });

      const lvlEl = $('audio-meter-level');
      if (lvlEl) {
        const db = normalized === 0 ? -Infinity : (20 * Math.log10(normalized));
        lvlEl.textContent = isFinite(db) ? `${db.toFixed(0)} dB` : '-∞ dB';
      }
    }

    tick();
  }

  function setupAudioAnalyser() {
    if (!state.stream || !state.stream.getAudioTracks().length) return;
    cleanupAudio();

    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      state.audioContext = new AC();
      const source = state.audioContext.createMediaStreamSource(state.stream);
      state.analyser = state.audioContext.createAnalyser();
      state.analyser.fftSize = 256;
      source.connect(state.analyser);
      state.dataArray = new Uint8Array(state.analyser.frequencyBinCount);
      animateAudioMeter();
    } catch (e) {
      console.warn('Erro ao criar analisador de áudio:', e);
    }
  }

  async function requestMediaStream(options) {
    options = options || {};
    const videoConstraints = options.video !== false ? {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      ...(!options.videoDeviceId && isMobileMediaDevice() ? { facingMode: { ideal: 'user' } } : {}),
      ...(options.videoDeviceId ? { deviceId: { exact: options.videoDeviceId } } : {})
    } : false;

    const audioConstraints = options.audio !== false ? {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      ...(options.audioDeviceId ? { deviceId: { exact: options.audioDeviceId } } : {})
    } : false;

    return await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: audioConstraints
    });
  }

  function attachStream(stream) {
    const video = $('localVideo');
    video.classList.add('mirrored');
    try {
      video.srcObject = stream;
    } catch (_) {
      video.src = URL.createObjectURL(stream);
    }
  }

  function applyTrackState() {
    if (!state.stream) return;
    state.stream.getVideoTracks().forEach(t => {
      try { t.enabled = state.cameraOn; } catch (_) {}
    });
    state.stream.getAudioTracks().forEach(t => {
      try { t.enabled = state.micOn; } catch (_) {}
    });
    updateVideoPlaceholder();
    updateBadgeCamera();
    updateBadgeMic();
  }

  async function initialMediaSetup() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      updateStatusCard('camera', 'error', 'Câmera', 'Navegador não suporta getUserMedia');
      updateStatusCard('mic', 'error', 'Microfone', 'Navegador não suporta getUserMedia');
      updateStatusCard('perm', 'error', 'Permissões', 'Navegador incompatível');
      return;
    }

    let stream = null;
    let camError = null;
    let micError = null;
    let permError = null;

    try {
      stream = await requestMediaStream({ video: true, audio: true });
    } catch (e) {
      permError = e;
      console.warn('getUserMedia completo falhou, tentando separado:', e);
    }

    if (!stream) {
      try {
        stream = await requestMediaStream({ video: true, audio: false });
      } catch (ce) {
        camError = ce;
        console.warn('Câmera falhou:', ce);
      }
      try {
        const audioOnly = await requestMediaStream({ video: false, audio: true });
        if (stream && audioOnly) {
          audioOnly.getAudioTracks().forEach(tr => stream.addTrack(tr));
        } else if (audioOnly) {
          stream = audioOnly;
        }
      } catch (me) {
        micError = me;
        console.warn('Mic falhou:', me);
      }
    }

    if (stream) {
      cleanupStreamOnly();
      state.stream = stream;
      attachStream(stream);
      applyTrackState();
      setupAudioAnalyser();
    }

    const hadVideo = stream && stream.getVideoTracks().length > 0;
    const hadAudio = stream && stream.getAudioTracks().length > 0;

    if (hadVideo) {
      state.cameraOn = true;
      $('camera-toggle').checked = true;
      updateStatusCard('camera', 'ok', 'Câmera', 'Conectada e funcionando');
    } else {
      state.cameraOn = false;
      $('camera-toggle').checked = false;
      const msg = camError ? camError.name === 'NotAllowedError' || camError.name === 'PermissionDeniedError'
        ? 'Permissão negada pelo usuário'
        : (camError.name === 'NotFoundError' || camError.name === 'DevicesNotFoundError'
          ? 'Nenhuma câmera encontrada'
          : (camError.message || 'Erro ao acessar câmera'))
        : 'Câmera indisponível';
      updateStatusCard('camera', camError && (camError.name === 'NotAllowedError' || camError.name === 'PermissionDeniedError') ? 'error' : 'warning', 'Câmera', msg);
      if (camError && (camError.name === 'NotAllowedError' || camError.name === 'PermissionDeniedError')) {
        toast('Não foi possível acessar sua câmera: permissão negada', 'error');
      }
    }

    if (hadAudio) {
      state.micOn = true;
      $('mic-toggle').checked = true;
      updateStatusCard('mic', 'ok', 'Microfone', 'Conectado e funcionando');
    } else {
      state.micOn = false;
      $('mic-toggle').checked = false;
      const msg = micError ? micError.name === 'NotAllowedError' || micError.name === 'PermissionDeniedError'
        ? 'Permissão negada pelo usuário'
        : (micError.name === 'NotFoundError' || micError.name === 'DevicesNotFoundError'
          ? 'Nenhum microfone encontrado'
          : (micError.message || 'Erro ao acessar microfone'))
        : 'Microfone indisponível';
      updateStatusCard('mic', micError && (micError.name === 'NotAllowedError' || micError.name === 'PermissionDeniedError') ? 'error' : 'warning', 'Microfone', msg);
      if (micError && (micError.name === 'NotAllowedError' || micError.name === 'PermissionDeniedError')) {
        toast('Não foi possível acessar seu microfone: permissão negada', 'error');
      }
    }

    if (hadVideo || hadAudio) {
      state.permissions.camera = hadVideo ? 'granted' : (camError && (camError.name === 'NotAllowedError' || camError.name === 'PermissionDeniedError') ? 'denied' : 'unknown');
      state.permissions.microphone = hadAudio ? 'granted' : (micError && (micError.name === 'NotAllowedError' || micError.name === 'PermissionDeniedError') ? 'denied' : 'unknown');
      updateStatusCard('perm',
        (hadVideo && hadAudio) ? 'ok'
          : (state.permissions.camera === 'denied' || state.permissions.microphone === 'denied') ? 'warning'
          : 'warning',
        'Permissões do navegador',
        (hadVideo && hadAudio) ? 'Todas as permissões concedidas'
          : 'Algumas permissões pendentes');
    } else {
      state.permissions.camera = permError && (permError.name === 'NotAllowedError' || permError.name === 'PermissionDeniedError') ? 'denied' : 'unknown';
      state.permissions.microphone = permError && (permError.name === 'NotAllowedError' || permError.name === 'PermissionDeniedError') ? 'denied' : 'unknown';
      updateStatusCard('perm', 'error', 'Permissões do navegador',
        permError && (permError.name === 'NotAllowedError' || permError.name === 'PermissionDeniedError')
          ? 'Permissões negadas. Verifique as configurações do navegador.'
          : 'Não foi possível acessar os dispositivos.');
    }

    updateEnterButton();
    await enumerateAndPopulate();
  }

  async function checkPermissionsAPI() {
    if (!navigator.permissions || !navigator.permissions.query) return;
    try {
      const camPerm = await navigator.permissions.query({ name: 'camera' }).catch(() => null);
      if (camPerm) {
        state.permissions.camera = camPerm.state || state.permissions.camera;
        camPerm.onchange = () => {
          state.permissions.camera = camPerm.state;
          updatePermStatus();
        };
      }
    } catch (_) {}
    try {
      const micPerm = await navigator.permissions.query({ name: 'microphone' }).catch(() => null);
      if (micPerm) {
        state.permissions.microphone = micPerm.state || state.permissions.microphone;
        micPerm.onchange = () => {
          state.permissions.microphone = micPerm.state;
          updatePermStatus();
        };
      }
    } catch (_) {}
    updatePermStatus();
  }

  function updatePermStatus() {
    const cp = state.permissions.camera;
    const mp = state.permissions.microphone;

    if (cp === 'denied') {
      updateStatusCard('camera', 'error', 'Câmera', 'Permissão negada nas configurações do navegador');
    } else if (cp === 'granted') {
      const cur = $('status-camera');
      if (cur && !cur.classList.contains('error')) {
        updateStatusCard('camera', 'ok', 'Câmera', 'Conectada e funcionando');
      }
    }

    if (mp === 'denied') {
      updateStatusCard('mic', 'error', 'Microfone', 'Permissão negada nas configurações do navegador');
    } else if (mp === 'granted') {
      const cur = $('status-mic');
      if (cur && !cur.classList.contains('error')) {
        updateStatusCard('mic', 'ok', 'Microfone', 'Conectado e funcionando');
      }
    }

    const bothGranted = cp === 'granted' && mp === 'granted';
    const anyDenied = cp === 'denied' || mp === 'denied';
    updateStatusCard('perm',
      bothGranted ? 'ok' : anyDenied ? 'error' : 'warning',
      'Permissões do navegador',
      bothGranted ? 'Todas as permissões concedidas'
        : anyDenied ? 'Algumas permissões foram negadas. Verifique as configurações do navegador.'
        : 'Aguardando autorização completa...');
    updateEnterButton();
  }

  async function handleCameraToggle(checked) {
    if (state.cameraOn === checked && state.stream && state.stream.getVideoTracks().length) {
      applyTrackState();
      return;
    }
    state.cameraOn = checked;

    if (checked && (!state.stream || state.stream.getVideoTracks().length === 0)) {
      try {
        const camStream = await requestMediaStream({
          video: true,
          audio: false,
          videoDeviceId: state.cameraDeviceId || undefined
        });
        if (state.stream) {
          state.stream.getVideoTracks().forEach(t => { try { t.stop(); } catch (_) {} });
          camStream.getVideoTracks().forEach(tr => state.stream.addTrack(tr));
        } else {
          cleanupStreamOnly();
          state.stream = camStream;
          attachStream(state.stream);
          setupAudioAnalyser();
        }
        updateStatusCard('camera', 'ok', 'Câmera', 'Conectada e funcionando');
      } catch (e) {
        console.warn(e);
        state.cameraOn = false;
        $('camera-toggle').checked = false;
        const msg = e.name === 'NotAllowedError' ? 'Permissão negada' : (e.message || 'Erro ao ligar câmera');
        updateStatusCard('camera', 'warning', 'Câmera', msg);
        toast('Não foi possível acessar sua câmera: ' + msg, 'error');
      }
    }
    applyTrackState();
    updateEnterButton();
  }

  async function handleMicToggle(checked) {
    if (state.micOn === checked && state.stream && state.stream.getAudioTracks().length) {
      applyTrackState();
      return;
    }
    state.micOn = checked;

    if (checked && (!state.stream || state.stream.getAudioTracks().length === 0)) {
      try {
        const micStream = await requestMediaStream({
          video: false,
          audio: true,
          audioDeviceId: state.micDeviceId || undefined
        });
        if (state.stream) {
          state.stream.getAudioTracks().forEach(t => { try { t.stop(); } catch (_) {} });
          micStream.getAudioTracks().forEach(tr => state.stream.addTrack(tr));
        } else {
          cleanupStreamOnly();
          state.stream = micStream;
          attachStream(state.stream);
        }
        setupAudioAnalyser();
        updateStatusCard('mic', 'ok', 'Microfone', 'Conectado e funcionando');
      } catch (e) {
        console.warn(e);
        state.micOn = false;
        $('mic-toggle').checked = false;
        const msg = e.name === 'NotAllowedError' ? 'Permissão negada' : (e.message || 'Erro ao ligar microfone');
        updateStatusCard('mic', 'warning', 'Microfone', msg);
        toast('Não foi possível acessar seu microfone: ' + msg, 'error');
        resetAudioMeterBars();
      }
    } else if (!checked) {
      resetAudioMeterBars();
    }
    applyTrackState();
    updateEnterButton();
  }

  async function handleCameraChange(newDeviceId) {
    if (!newDeviceId) return;
    if (newDeviceId === state.cameraDeviceId) return;
    state.cameraDeviceId = newDeviceId;
    try {
      const ns = await requestMediaStream({
        video: true,
        audio: state.stream && state.stream.getAudioTracks().length > 0 ? true : false,
        videoDeviceId: newDeviceId,
        audioDeviceId: state.micDeviceId || undefined
      });
      cleanupAudio();
      cleanupStreamOnly();
      state.stream = ns;
      attachStream(ns);
      applyTrackState();
      setupAudioAnalyser();
      toast('Câmera alterada com sucesso', 'success');
    } catch (e) {
      console.warn('Troca de câmera falhou:', e);
      toast('Não foi possível trocar de câmera: ' + (e.message || 'Erro desconhecido'), 'error');
    }
  }

  async function handleMicChange(newDeviceId) {
    if (!newDeviceId) return;
    if (newDeviceId === state.micDeviceId) return;
    state.micDeviceId = newDeviceId;
    try {
      const ns = await requestMediaStream({
        video: state.stream && state.stream.getVideoTracks().length > 0 ? true : false,
        audio: true,
        videoDeviceId: state.cameraDeviceId || undefined,
        audioDeviceId: newDeviceId
      });
      cleanupAudio();
      cleanupStreamOnly();
      state.stream = ns;
      attachStream(ns);
      applyTrackState();
      setupAudioAnalyser();
      toast('Microfone alterado com sucesso', 'success');
    } catch (e) {
      console.warn('Troca de microfone falhou:', e);
      toast('Não foi possível trocar de microfone: ' + (e.message || 'Erro desconhecido'), 'error');
    }
  }

  async function handleAudioOutputChange(deviceId) {
    const video = $('localVideo');
    if (typeof video.setSinkId !== 'function') return;
    state.audioOutputDeviceId = deviceId || '';
    try {
      await video.setSinkId(deviceId || '');
      toast('Saída de áudio alterada', 'success');
    } catch (e) {
      console.warn('Troca de saída de áudio falhou:', e);
      toast('Não foi possível alterar saída de áudio', 'error');
    }
  }

  function handleAudioOnlyCheck(checked) {
    if (checked) {
      $('devices-off-check').checked = false;
      state.cameraOn = false;
      $('camera-toggle').checked = false;
      applyTrackState();
      toast('Modo só áudio ativado: câmera desligada ao entrar', 'info');
    }
  }

  function handleDevicesOffCheck(checked) {
    if (checked) {
      $('audio-only-check').checked = false;
      state.cameraOn = false;
      state.micOn = false;
      $('camera-toggle').checked = false;
      $('mic-toggle').checked = false;
      applyTrackState();
      resetAudioMeterBars();
      toast('Modo silencioso ativado: câmera e microfone desligados ao entrar', 'info');
    }
  }

  async function handleMicTestClick() {
    if (state.testRecording) return;
    if (state.testPlaying) return;

    if (!state.stream || state.stream.getAudioTracks().length === 0) {
      toast('Nenhum microfone ativo para o teste', 'warning');
      return;
    }

    if (!(window.MediaRecorder)) {
      toast('Navegador não suporta gravação (MediaRecorder)', 'warning');
      return;
    }

    const btn = $('mic-test-btn');
    const btnText = $('mic-test-btn-text');
    state.testRecording = true;
    btn.classList.add('recording');
    btnText.textContent = 'Gravando... (3s)';
    state.recordedChunks = [];

    try {
      const audioOnly = new MediaStream(state.stream.getAudioTracks());
      const mr = new MediaRecorder(audioOnly);
      state.mediaRecorder = mr;

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) state.recordedChunks.push(e.data);
      };

      let stopTimer = null;
      mr.onstop = () => {
        if (stopTimer) clearTimeout(stopTimer);
        state.testRecording = false;
        btn.classList.remove('recording');
        btn.classList.add('playing');
        btnText.textContent = 'Tocando gravação...';
        state.testPlaying = true;

        try {
          const blob = new Blob(state.recordedChunks, { type: mr.mimeType || 'audio/webm' });
          const url = URL.createObjectURL(blob);
          const audio = new Audio();
          audio.src = url;
          if (state.audioOutputDeviceId && typeof audio.setSinkId === 'function') {
            try { audio.setSinkId(state.audioOutputDeviceId); } catch (_) {}
          }
          audio.onended = () => {
            state.testPlaying = false;
            btn.classList.remove('playing');
            btnText.textContent = 'Iniciar teste do microfone';
            setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) {} }, 1000);
          };
          audio.onerror = () => {
            state.testPlaying = false;
            btn.classList.remove('playing');
            btnText.textContent = 'Iniciar teste do microfone';
            toast('Erro ao reproduzir gravação', 'error');
          };
          const p = audio.play();
          if (p && typeof p.catch === 'function') {
            p.catch(err => {
              console.warn('Play falhou:', err);
              state.testPlaying = false;
              btn.classList.remove('playing');
              btnText.textContent = 'Iniciar teste do microfone';
              toast('Reprodução bloqueada pelo navegador. Clique para tentar novamente.', 'warning');
            });
          }
        } catch (e) {
          state.testPlaying = false;
          btn.classList.remove('playing');
          btnText.textContent = 'Iniciar teste do microfone';
          toast('Erro no teste do microfone: ' + (e.message || ''), 'error');
        }
        state.mediaRecorder = null;
      };

      mr.onerror = () => {
        state.testRecording = false;
        state.testPlaying = false;
        btn.classList.remove('recording', 'playing');
        btnText.textContent = 'Iniciar teste do microfone';
        toast('Erro ao gravar microfone', 'error');
        state.mediaRecorder = null;
      };

      mr.start(100);

      stopTimer = setTimeout(() => {
        try { if (mr.state !== 'inactive') mr.stop(); } catch (_) {}
      }, 3000);

    } catch (e) {
      console.warn('Mic test falhou:', e);
      state.testRecording = false;
      btn.classList.remove('recording');
      btnText.textContent = 'Iniciar teste do microfone';
      toast('Não foi possível iniciar teste do microfone: ' + (e.message || ''), 'error');
    }
  }

  function goBack() {
    cleanupStreams();
    if (history.length > 1) {
      history.back();
    } else {
      window.location.href = 'assembleia.html';
    }
  }

  function savePreferencesAndEnter() {
    const audioOnly = $('audio-only-check').checked;
    const devicesOff = $('devices-off-check').checked;

    let finalCameraOn = state.cameraOn;
    let finalMicOn = state.micOn;

    if (devicesOff) {
      finalCameraOn = false;
      finalMicOn = false;
    } else if (audioOnly) {
      finalCameraOn = false;
    }

    try {
      sessionStorage.setItem('prep_camera_on', finalCameraOn ? '1' : '0');
      sessionStorage.setItem('prep_mic_on', finalMicOn ? '1' : '0');
      sessionStorage.setItem('prep_camera_dev', state.cameraDeviceId || '');
      sessionStorage.setItem('prep_mic_dev', state.micDeviceId || '');
      sessionStorage.setItem('prep_audio_only', audioOnly ? '1' : '0');
      sessionStorage.setItem('prep_devices_off', devicesOff ? '1' : '0');
    } catch (_) {}

    cleanupStreams();
    window.location.href = `assembleia-sala.html?id=${encodeURIComponent(state.assemblyId)}`;
  }

  async function loadData() {
    const qp = U && U.getQueryParam ? U.getQueryParam('id') : (new URLSearchParams(window.location.search).get('id'));
    if (!qp) {
      showError('ID da assembleia não informado', 'O link está incompleto. Volte e selecione uma assembleia válida.');
      return;
    }
    state.assemblyId = qp;

    const user = A && A.getCurrentUser ? A.getCurrentUser() : null;
    state.user = user;

    if (!user) {
      showError('Usuário não autenticado', 'Você precisa estar logado para acessar esta página.');
      return;
    }

    let assembly = null;
    try {
      if (API && API.loadAssemblyDetail) {
        assembly = await API.loadAssemblyDetail(qp);
      } else {
        const all = await supabaseFetch(`/assemblies?id=eq.${encodeURIComponent(qp)}`).catch(() => []);
        assembly = Array.isArray(all) && all.length ? all[0] : null;
      }
    } catch (e) {
      console.warn('loadAssemblyDetail falhou:', e);
    }

    if (!assembly) {
      try {
        const all2 = await supabaseFetch(`/scheduled_assemblies?id=eq.${encodeURIComponent(qp)}`).catch(() => []);
        assembly = Array.isArray(all2) && all2.length ? all2[0] : null;
      } catch (_) {}
    }

    if (!assembly) {
      showError('Assembleia não encontrada', 'A assembleia que você tentou acessar não existe ou foi removida.');
      return;
    }
    state.assembly = assembly;

    if (isAssemblyClosed(assembly)) {
      showError('Assembleia encerrada',
        `Esta assembleia está com status "${assembly.status || 'encerrada'}". Não é mais possível entrar.`);
      return;
    }

    const scheduledStart = getAssemblyStartDateTime(assembly);
    if (scheduledStart && Date.now() < scheduledStart.getTime()) {
      const dateText = scheduledStart.toLocaleDateString('pt-BR');
      const timeText = scheduledStart.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      showError(
        'Assembleia ainda não iniciada',
        `A preparação de entrada será liberada somente em ${dateText}, a partir das ${timeText}.`
      );
      return;
    }

    const assemblyCep = getAssemblyCep(assembly);
    state.userCep = A && A.getUserCep ? await A.getUserCep(user) : null;

    if (A && A.checkAssemblyAccess) {
      const result = await A.checkAssemblyAccess(user, assemblyCep);
      if (!result.allowed) {
        let msg = 'Você não tem permissão para acessar esta assembleia.';
        if (result.reason === 'not_authenticated') msg = 'Você precisa estar logado.';
        else if (result.reason === 'cep_mismatch') msg = 'Esta assembleia pertence a outro condomínio.';
        else if (result.reason === 'user_cep_not_found') msg = 'Não foi possível verificar seu condomínio.';
        showError('Acesso bloqueado', msg);
        return;
      }
    }

    populateAssemblyInfo();
    showMain();
    await initialMediaSetup();
    checkPermissionsAPI();
  }

  function bindEvents() {
    $('btn-back').addEventListener('click', goBack);
    $('btn-back-footer').addEventListener('click', goBack);

    $('camera-toggle').addEventListener('change', (e) => handleCameraToggle(e.target.checked));
    $('mic-toggle').addEventListener('change', (e) => handleMicToggle(e.target.checked));

    $('camera-select').addEventListener('change', (e) => handleCameraChange(e.target.value));
    $('mic-select').addEventListener('change', (e) => handleMicChange(e.target.value));
    $('audio-output-select').addEventListener('change', (e) => handleAudioOutputChange(e.target.value));

    $('audio-only-check').addEventListener('change', (e) => handleAudioOnlyCheck(e.target.checked));
    $('devices-off-check').addEventListener('change', (e) => handleDevicesOffCheck(e.target.checked));

    $('mic-test-btn').addEventListener('click', handleMicTestClick);
    $('btn-enter').addEventListener('click', savePreferencesAndEnter);

    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', enumerateAndPopulate);
    }

    window.addEventListener('beforeunload', cleanupStreams);
    window.addEventListener('pagehide', cleanupStreams);
  }

  async function init() {
    try {
      bindEvents();
      await loadData();
    } catch (e) {
      console.error('Erro na inicialização da prep page:', e);
      showError('Erro inesperado', e.message || 'Ocorreu um erro ao carregar a página.');
    }
  }

  window.AssemblyPrep = {
    init,
    state,
    cleanupStreams
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
