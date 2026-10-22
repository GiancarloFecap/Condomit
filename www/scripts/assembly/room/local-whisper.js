let transcriberPromise = null;
let workerInstance = null;
let nextJobId = 0;
let statusCallback = null;
const pendingJobs = new Map();

function failWorker(reason) {
  const error = reason instanceof Error ? reason : new Error(String(reason || 'Falha ao executar o reconhecimento de voz.'));
  for (const job of pendingJobs.values()) job.reject(error);
  pendingJobs.clear();
  workerInstance?.terminate();
  workerInstance = null;
  transcriberPromise = null;
  return error;
}

function initializeTranscriber() {
  return new Promise((resolve, reject) => {
    let ready = false;
    let worker;
    try {
      worker = new Worker(new URL('./local-whisper-worker.js?v=083', import.meta.url), { type: 'module' });
    } catch (error) {
      reject(error);
      return;
    }
    workerInstance = worker;
    worker.onmessage = ({ data }) => {
      if (data?.type === 'status') {
        statusCallback?.(String(data.message || 'Preparando reconhecimento de voz.'));
        return;
      }
      if (data?.type === 'ready') {
        ready = true;
        resolve((audio, options = {}) => {
          if (workerInstance !== worker) return Promise.reject(new Error('O reconhecimento de voz foi reiniciado.'));
          const id = ++nextJobId;
          const copy = new Float32Array(audio);
          return new Promise((resolveJob, rejectJob) => {
            pendingJobs.set(id, { resolve: resolveJob, reject: rejectJob });
            try {
              worker.postMessage({ type: 'transcribe', id, audio: copy, options }, [copy.buffer]);
            } catch (error) {
              pendingJobs.delete(id);
              rejectJob(error);
            }
          });
        });
        return;
      }
      if (data?.type === 'result' || (data?.type === 'error' && data.id != null)) {
        const job = pendingJobs.get(data.id);
        if (!job) return;
        pendingJobs.delete(data.id);
        if (data.type === 'result') job.resolve({ text: String(data.text || '') });
        else job.reject(new Error(String(data.message || 'Falha no reconhecimento de voz.')));
        return;
      }
      if (data?.type === 'error') {
        const error = failWorker(data.message);
        if (!ready) reject(error);
      }
    };
    worker.onerror = event => {
      event.preventDefault?.();
      const error = failWorker(event.message || 'O processo de reconhecimento de voz parou inesperadamente.');
      if (!ready) reject(error);
    };
    worker.onmessageerror = () => {
      const error = failWorker('Não foi possível receber a resposta do reconhecimento de voz.');
      if (!ready) reject(error);
    };
    try {
      worker.postMessage({ type: 'initialize' });
    } catch (error) {
      failWorker(error);
      reject(error);
    }
  });
}

export function getLocalWhisper(onStatus) {
  if (typeof onStatus === 'function') statusCallback = onStatus;
  if (!transcriberPromise) transcriberPromise = initializeTranscriber();
  return transcriberPromise;
}
