import { state } from './state.js?v=079';

 
 
 
 
 

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
    'Transcrição Gemini após a gravação',
    'O vídeo da assembleia será transcrito pelo Gemini no servidor após a gravação ser concluída. O reconhecimento de voz não será executado neste navegador.'
  );
  return true;
}

export async function stopAssemblyTranscription() {
  await flushAssemblySpeechActivity();
  setStatus('paused', 'Gravação aguardando transcrição Gemini');
}

export function syncAssemblyTranscriptionWithMicrophone() {
   
   
  if (state.connected) startAssemblyTranscription();
}

window.addEventListener('condomit:assembly-active-speakers', (event) => {
  syncSpeechActivityFromIdentities(event?.detail?.identities || []);
});
