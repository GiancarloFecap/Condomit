let transcriberPromise = null;

const normalizeMessage = (event, onStatus) => {
  if (typeof onStatus !== 'function') return;
  const progress = Number(event?.progress);
  if (Number.isFinite(progress)) onStatus(`Baixando modelo local de voz: ${Math.round(progress)}%`);
  else if (event?.status === 'ready') onStatus('Modelo de reconhecimento local pronto.');
};

async function initializeTranscriber(onStatus) {
  const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');
  if (env) {
    env.allowLocalModels = false;
    env.useBrowserCache = true;
  }
  const progress_callback = (event) => normalizeMessage(event, onStatus);
  onStatus?.('Preparando o modelo local leve de reconhecimento de voz.');
  return pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
    progress_callback,
    device: 'wasm',
    dtype: 'q8'
  });
}

export function getLocalWhisper(onStatus) {
  if (!transcriberPromise) {
    transcriberPromise = initializeTranscriber(onStatus).catch((error) => {
      transcriberPromise = null;
      throw error;
    });
  }
  return transcriberPromise;
}
