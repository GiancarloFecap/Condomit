import { state } from './state.js?v=0711';

// Condomit v0.71.1
// A transcrição textual não é mais feita diretamente do microfone.
// Ela é gerada somente após a gravação ser finalizada, usando o áudio
// contido no próprio vídeo. Este módulo mantém apenas o indicador de estado
// da sala e o registro técnico de atividade de fala.

let speechStartedAt = 0;
let speechSavePromise = Promise.resolve();

function statusElement() {
  return document.getElementById('call-transcription-status');
}

function setStatus(status, label, detail = '') {
  const element = statusElement();
  if (!element) return;
  element.dataset.status = status;
  const text = element.querySelector('span');
  if (text) text.textContent = label;
  element.title = detail ? `${label}. ${detail}` : label;
}

function localIdentity() {
  return String(state.room?.localParticipant?.identity || state.tokenInfo?.identity || '').trim();
}

function queueSpeechActivity(startedAt, endedAt) {
  const start = Number(startedAt || 0);
  const end = Number(endedAt || 0);
  if (!start || !end || end - start < 700 || typeof window.supabaseFetch !== 'function') return;

  speechSavePromise = speechSavePromise.catch(() => {}).then(async () => {
    try {
      await window.supabaseFetch('/rpc/condomit_log_assembly_speech_activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_assembly_id: Number(state.assemblyId),
          participant_identity_value: localIdentity() || null,
          started_at_value: new Date(start).toISOString(),
          ended_at_value: new Date(end).toISOString()
        })
      });
    } catch (error) {
      console.warn('[ASSEMBLY SPEECH ACTIVITY] Não foi possível registrar atividade de fala:', error);
    }
  });
}

function syncSpeechActivityFromIdentities(identities) {
  const ownIdentity = localIdentity();
  if (!ownIdentity) return;
  const speaking = Array.isArray(identities) && identities.includes(ownIdentity);

  if (speaking && !speechStartedAt) speechStartedAt = Date.now();
  if (!speaking && speechStartedAt) {
    const start = speechStartedAt;
    speechStartedAt = 0;
    queueSpeechActivity(start, Date.now());
  }
}

export async function flushAssemblySpeechActivity() {
  if (speechStartedAt) {
    const start = speechStartedAt;
    speechStartedAt = 0;
    queueSpeechActivity(start, Date.now());
  }
  try { await speechSavePromise; } catch (_) {}
}

export function startAssemblyTranscription() {
  setStatus(
    'active',
    'Transcrição pela gravação',
    'O texto da Ata será produzido a partir do vídeo finalizado. Ruídos e trechos com fala paralela não são inseridos como declaração oficial.'
  );
  return true;
}

export async function stopAssemblyTranscription() {
  await flushAssemblySpeechActivity();
  setStatus('paused', 'Transcrição da gravação finalizada');
}

export function syncAssemblyTranscriptionWithMicrophone() {
  // A transcrição não depende mais de iniciar/parar SpeechRecognition com o
  // microfone. O estado permanece informativo enquanto a gravação está ativa.
  if (state.connected) startAssemblyTranscription();
}

window.addEventListener('condomit:assembly-active-speakers', (event) => {
  syncSpeechActivityFromIdentities(event?.detail?.identities || []);
});
