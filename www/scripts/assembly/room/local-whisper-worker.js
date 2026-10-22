let transcriberPromise = null;

function sendStatus(event) {
  const progress = Number(event?.progress);
  const message = Number.isFinite(progress)
    ? `Baixando modelo local de voz: ${Math.round(progress)}%`
    : event?.status === 'ready'
      ? 'Modelo de reconhecimento local pronto.'
      : '';
  if (message) self.postMessage({ type: 'status', message });
}

async function initialize() {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      self.postMessage({ type: 'status', message: 'Preparando o modelo local leve de reconhecimento de voz.' });
      const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');
      if (env) {
        env.allowLocalModels = false;
        env.useBrowserCache = true;
        if (env.backends?.onnx?.wasm) env.backends.onnx.wasm.numThreads = 1;
      }
      return pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
        progress_callback: sendStatus,
        device: 'wasm',
        dtype: 'q8'
      });
    })().catch(error => {
      transcriberPromise = null;
      throw error;
    });
  }
  return transcriberPromise;
}

self.onmessage = async ({ data }) => {
  if (data?.type === 'initialize') {
    try {
      await initialize();
      self.postMessage({ type: 'ready' });
    } catch (error) {
      self.postMessage({ type: 'error', message: String(error?.message || error) });
    }
    return;
  }
  if (data?.type !== 'transcribe') return;
  try {
    const transcriber = await initialize();
    const result = await transcriber(data.audio, data.options || {});
    self.postMessage({ type: 'result', id: data.id, text: result?.text || (typeof result === 'string' ? result : '') });
  } catch (error) {
    self.postMessage({ type: 'error', id: data.id, message: String(error?.message || error) });
  }
};
