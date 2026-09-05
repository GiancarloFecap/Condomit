// Condomit v0.71.1
// Transcrição pós-reunião feita a partir do áudio contido no vídeo gravado.
// O processamento roda no navegador com Whisper/Transformers.js, sem API GPT.
//
// Para evitar que conversas paralelas virem texto oficial, cada palavra só é
// aceita quando a linha do tempo do LiveKit indica um único participante como
// falante ativo naquele instante. Sons não verbais e trechos sem falante
// inequívoco são descartados.

let transcriberPromise = null;

function statusText(text, detail = '') {
  const label = document.getElementById('recording-status');
  if (!label) return;
  label.hidden = false;
  label.textContent = text;
  label.title = detail || '';
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeEmail(value) {
  return cleanText(value).toLowerCase();
}

function isNonSpeechOnly(text) {
  const normalized = cleanText(text)
    .toLowerCase()
    .replace(/[()[\]{}♪♫♬*_.!,;:!?—–-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return true;
  const nonSpeech = [
    'música', 'musica', 'music',
    'aplausos', 'applause', 'applause applause',
    'risos', 'riso', 'laughter',
    'ruído', 'ruido', 'noise',
    'silêncio', 'silencio', 'silence',
    'inaudível', 'inaudivel', 'inaudible',
    'som ambiente', 'background noise'
  ];
  return nonSpeech.includes(normalized);
}

function overlapSeconds(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

function resolveCleanSpeaker(start, end, timeline) {
  const safeStart = Math.max(0, Number(start) || 0);
  const safeEnd = Math.max(safeStart + 0.08, Number(end) || safeStart + 0.3);
  const paddedStart = Math.max(0, safeStart - 0.18);
  const paddedEnd = safeEnd + 0.18;
  const total = Math.max(0.08, paddedEnd - paddedStart);

  const singleSpeaker = new Map();
  let overlapWithMultipleSpeakers = 0;
  let covered = 0;

  for (const segment of Array.isArray(timeline) ? timeline : []) {
    const overlap = overlapSeconds(
      paddedStart,
      paddedEnd,
      Number(segment?.start) || 0,
      Number(segment?.end) || 0
    );
    if (!overlap) continue;
    covered += overlap;

    const identities = Array.from(new Set(
      (Array.isArray(segment?.identities) ? segment.identities : [])
        .map((value) => cleanText(value))
        .filter(Boolean)
    ));

    if (identities.length > 1) {
      overlapWithMultipleSpeakers += overlap;
      continue;
    }
    if (identities.length === 1) {
      singleSpeaker.set(
        identities[0],
        (singleSpeaker.get(identities[0]) || 0) + overlap
      );
    }
  }

  // Se houve conversa paralela em parte material deste trecho, ele não entra
  // na Ata. É preferível omitir um trecho ambíguo a atribuí-lo incorretamente.
  if (overlapWithMultipleSpeakers / total > 0.15) return null;

  let winner = null;
  let winnerOverlap = 0;
  for (const [identity, seconds] of singleSpeaker.entries()) {
    if (seconds > winnerOverlap) {
      winner = identity;
      winnerOverlap = seconds;
    }
  }

  // Exige cobertura suficiente de um único falante.
  if (!winner || winnerOverlap / total < 0.42) return null;
  if (covered / total < 0.35) return null;
  return winner;
}

function joinTranscriptTokens(current, token) {
  const next = cleanText(token);
  if (!next) return current;
  if (!current) return next;
  if (/^[,.;:!?%)\]}]/.test(next)) return `${current}${next}`;
  if (/^['’]/.test(next)) return `${current}${next}`;
  return `${current} ${next}`;
}

function buildEntries(output, startedAt, timeline, participantDirectory) {
  const chunks = Array.isArray(output?.chunks) ? output.chunks : [];
  if (!chunks.length) return [];

  const words = [];
  for (const chunk of chunks) {
    const text = cleanText(chunk?.text);
    if (!text || isNonSpeechOnly(text)) continue;
    const ts = Array.isArray(chunk?.timestamp) ? chunk.timestamp : [];
    const start = Number(ts[0]);
    const end = Number(ts[1]);
    if (!Number.isFinite(start)) continue;
    const safeEnd = Number.isFinite(end) && end > start ? end : start + 0.45;
    const identity = resolveCleanSpeaker(start, safeEnd, timeline);
    if (!identity) continue;
    const person = participantDirectory?.[identity] || {};
    const email = normalizeEmail(person?.email);
    if (!email) continue;
    words.push({
      identity,
      email,
      name: cleanText(person?.name || email),
      role: cleanText(person?.role || 'morador').toLowerCase(),
      text,
      start,
      end: safeEnd
    });
  }

  const groups = [];
  for (const word of words) {
    const last = groups[groups.length - 1];
    if (
      last &&
      last.identity === word.identity &&
      word.start - last.end <= 1.4
    ) {
      last.text = joinTranscriptTokens(last.text, word.text);
      last.end = Math.max(last.end, word.end);
      continue;
    }
    groups.push({ ...word });
  }

  const baseTime = startedAt instanceof Date ? startedAt : new Date(startedAt || Date.now());
  return groups
    .map((group) => ({
      participant_identity: group.identity,
      participant_email: group.email,
      participant_name: group.name,
      participant_role: group.role,
      transcript: cleanText(group.text),
      spoken_at: new Date(baseTime.getTime() + Math.max(0, group.start) * 1000).toISOString()
    }))
    .filter((entry) => entry.transcript && entry.transcript.length >= 2);
}

async function loadTransformers() {
  // esm.sh já é permitido pela CSP da Condomit. A biblioteca e o modelo são
  // baixados/cached pelo navegador; não há consumo de créditos de API.
  return await import('https://esm.sh/@huggingface/transformers@4.2.0?bundle');
}

async function createTranscriber() {
  const { pipeline, env } = await loadTransformers();
  if (env) {
    env.allowLocalModels = false;
    env.useBrowserCache = true;
  }

  const progress = (event) => {
    const progressValue = Number(event?.progress);
    if (Number.isFinite(progressValue)) {
      statusText(`Preparando transcrição da gravação… ${Math.round(progressValue)}%`);
    } else if (event?.status === 'ready') {
      statusText('Modelo de transcrição pronto. Processando a gravação…');
    }
  };

  const preferredOptions = {
    progress_callback: progress
  };
  if (navigator?.gpu) preferredOptions.device = 'webgpu';

  try {
    // Base é mais preciso que tiny e ainda é viável em navegador moderno.
    return await pipeline(
      'automatic-speech-recognition',
      'Xenova/whisper-base',
      preferredOptions
    );
  } catch (baseError) {
    console.warn('[Recorded transcription] Whisper base indisponível, usando tiny.', baseError);
    statusText('Usando modelo de transcrição compatível com este dispositivo…');
    return await pipeline(
      'automatic-speech-recognition',
      'Xenova/whisper-tiny',
      { progress_callback: progress }
    );
  }
}

async function getTranscriber() {
  if (!transcriberPromise) {
    transcriberPromise = createTranscriber().catch((error) => {
      transcriberPromise = null;
      throw error;
    });
  }
  return transcriberPromise;
}

async function persistEntries(assemblyId, entries) {
  if (!entries.length) {
    // Limpa uma transcrição automática anterior caso a nova análise conclua
    // que não houve fala inequívoca.
    await window.supabaseFetch('/rpc/condomit_replace_recording_transcripts_042', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_assembly_id: Number(assemblyId),
        transcript_entries: []
      })
    });
    return;
  }

  await window.supabaseFetch('/rpc/condomit_replace_recording_transcripts_042', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      target_assembly_id: Number(assemblyId),
      transcript_entries: entries
    })
  });
}

export async function transcribeRecordedAssembly({
  blob,
  assemblyId,
  startedAt,
  speakerTimeline,
  participantDirectory
}) {
  if (!blob?.size || !assemblyId) return [];

  // Sem timeline não é seguro atribuir falas; não inventamos autor.
  const cleanTimeline = (Array.isArray(speakerTimeline) ? speakerTimeline : [])
    .filter((segment) => Number(segment?.end) > Number(segment?.start));

  if (!cleanTimeline.length) {
    throw new Error('Não há linha do tempo de falantes suficiente para gerar uma transcrição confiável.');
  }

  statusText('Preparando o vídeo para transcrição…');
  const objectUrl = URL.createObjectURL(blob);

  try {
    const transcriber = await getTranscriber();
    statusText('Transcrevendo o áudio da gravação e removendo falas paralelas…');

    const output = await transcriber(objectUrl, {
      language: 'portuguese',
      task: 'transcribe',
      return_timestamps: 'word',
      chunk_length_s: 30,
      stride_length_s: 5
    });

    const entries = buildEntries(
      output,
      startedAt,
      cleanTimeline,
      participantDirectory || {}
    );

    statusText('Salvando transcrição na Ata…');
    await persistEntries(assemblyId, entries);

    statusText(
      entries.length
        ? `Gravação e transcrição salvas na Ata (${entries.length} trecho${entries.length === 1 ? '' : 's'}).`
        : 'Gravação salva. Nenhuma fala inequívoca foi adicionada à Ata.'
    );
    return entries;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
