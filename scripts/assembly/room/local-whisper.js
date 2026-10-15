let transcriberPromise = null;

const normalizeMessage = (event, onStatus) => {
  if (typeof onStatus !== 'function') return;
  const progress = Number(event?.progress);
  if (Number.isFinite(progress)) onStatus(`Baixando modelo local de voz: ${Math.round(progress)}%`);
  else if (event?.status === 'ready') onStatus('Modelo de reconhecimento local pronto.');
};

async function initializeTranscriber(onStatus) {
  const { pipeline, env } = await import('https://esm.sh/@huggingface/transformers@4.2.0?bundle');
  if (env) {
    env.allowLocalModels = false;
    env.useBrowserCache = true;
  }
  const progress_callback = (event) => normalizeMessage(event, onStatus);
  try {
    if (!navigator?.gpu) {
      onStatus?.('Preparando modelo Whisper leve para este dispositivo.');
      return await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', { progress_callback });
    }
    return await pipeline('automatic-speech-recognition', 'Xenova/whisper-base', {
      device: 'webgpu',
      progress_callback
    });
  } catch (error) {
    console.warn('[Condomit Whisper] Modelo base indisponível; usando tiny.', error);
    onStatus?.('Usando o modelo local leve de transcrição.');
    return pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', { progress_callback });
  }
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
