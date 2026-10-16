// Whisper roda no dispositivo. Nenhum áudio é enviado a uma API paga.
let transcriberPromise = null;
const CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

function progressReport(event, status) {
  if (!status) return;
  if (event?.status === 'progress' && Number.isFinite(Number(event.progress))) {
    status(`Preparando Whisper: ${Math.round(Number(event.progress))}%`);
  } else if (event?.status === 'ready') status('Modelo Whisper pronto para transcrição.');
}

async function loadPipeline() {
  try { return await import(CDN); }
  catch (error) {
    console.warn('[Condomit Whisper] CDN primária indisponível; tentando fonte alternativa.', error);
    return import('https://esm.sh/@huggingface/transformers@3.8.1?bundle');
  }
}

async function makePipeline(status) {
  const { pipeline, env } = await loadPipeline();
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  // Tiny multilingue: executável em dispositivos modestos e suporta português.
  const common = {progress_callback: event => progressReport(event, status)};
  if (navigator.gpu) {
    try {
      status?.('Carregando Whisper com aceleração WebGPU…');
      return await pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny', {...common, device:'webgpu', dtype:'fp32'});
    } catch (error) { console.warn('[Condomit Whisper] WebGPU indisponível, tentando CPU.', error); }
  }
  status?.('Carregando Whisper na CPU…');
  return pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {...common, device:'wasm'});
}

export function getLocalWhisper(onStatus) {
  if (!transcriberPromise) {
    transcriberPromise = makePipeline(onStatus).catch(error => {
      transcriberPromise = null;
      throw error;
    });
  }
  return transcriberPromise;
}
