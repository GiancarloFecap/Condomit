// Condomit v0.72.5
// Transcrição pós-reunião feita exclusivamente a partir do áudio do vídeo já salvo na Ata.
// O processamento roda no navegador com Whisper/Transformers.js, sem API GPT.
//
// Trechos com associação segura a um falante continuam sendo salvos como
// transcrição oficial. Quando o reconhecimento textual existe, mas a associação
// de falante não é segura o bastante, a Condomit preserva uma versão presumida
// claramente identificada e manda o usuário conferir a gravação audiovisual.
// Sons não verbais continuam sendo descartados.

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


function resolveLikelySpeaker(start, end, timeline, participantDirectory) {
  const safeStart = Math.max(0, Number(start) || 0);
  const safeEnd = Math.max(safeStart + 0.08, Number(end) || safeStart + 0.3);
  const paddedStart = Math.max(0, safeStart - 0.35);
  const paddedEnd = safeEnd + 0.35;
  const scores = new Map();

  for (const segment of Array.isArray(timeline) ? timeline : []) {
    const overlap = overlapSeconds(
      paddedStart,
      paddedEnd,
      Number(segment?.start) || 0,
      Number(segment?.end) || 0
    );
    if (!overlap) continue;

    const identities = Array.from(new Set(
      (Array.isArray(segment?.identities) ? segment.identities : [])
        .map((value) => cleanText(value))
        .filter(Boolean)
    ));
    if (!identities.length) continue;

    // Quando há mais de um falante simultâneo, divide o peso entre eles em vez
    // de fingir certeza. Isso serve apenas para escolher uma referência técnica
    // para persistir o trecho presumido; a Ata não atribui essa fala à pessoa.
    const weight = overlap / identities.length;
    identities.forEach((identity) => {
      scores.set(identity, (scores.get(identity) || 0) + weight);
    });
  }

  let winner = '';
  let winnerScore = 0;
  for (const [identity, score] of scores.entries()) {
    const email = normalizeEmail(participantDirectory?.[identity]?.email);
    if (!email) continue;
    if (score > winnerScore) {
      winner = identity;
      winnerScore = score;
    }
  }

  if (winner) return winner;

  // Sem linha do tempo útil, usa apenas um e-mail válido do diretório para
  // satisfazer a persistência. A interface trata o trecho como conteúdo geral
  // presumido da gravação e nunca o exibe como declaração desse participante.
  return Object.keys(participantDirectory || {}).find((identity) =>
    normalizeEmail(participantDirectory?.[identity]?.email)
  ) || '';
}

function buildInferredEntries(output, startedAt, timeline, participantDirectory, confidentEntries) {
  const chunks = Array.isArray(output?.chunks) ? output.chunks : [];
  if (!chunks.length) return [];

  const confidentWindows = (Array.isArray(confidentEntries) ? confidentEntries : [])
    .map((entry) => ({
      text: cleanText(entry?.transcript).toLowerCase(),
      at: new Date(entry?.spoken_at || 0).getTime()
    }))
    .filter((item) => item.text);

  const baseTime = startedAt instanceof Date ? startedAt : new Date(startedAt || Date.now());
  const inferred = [];

  for (const chunk of chunks) {
    const text = cleanText(chunk?.text);
    if (!text || text.length < 2 || isNonSpeechOnly(text)) continue;

    const ts = Array.isArray(chunk?.timestamp) ? chunk.timestamp : [];
    const start = Number(ts[0]);
    const end = Number(ts[1]);
    if (!Number.isFinite(start)) continue;
    const safeEnd = Number.isFinite(end) && end > start ? end : start + 0.6;

    // Se este mesmo trecho já tem associação suficientemente segura a um
    // participante, ele pertence à transcrição oficial, não à parte presumida.
    if (resolveCleanSpeaker(start, safeEnd, timeline)) continue;

    // Se o trecho já foi aproveitado com segurança, ele não precisa aparecer
    // novamente como presunção.
    const normalizedText = text.toLowerCase();
    const absoluteTime = baseTime.getTime() + Math.max(0, start) * 1000;
    const alreadyConfident = confidentWindows.some((item) => {
      const nearTime = Number.isFinite(item.at) && Math.abs(item.at - absoluteTime) <= 4500;
      const similarText = item.text.includes(normalizedText) || normalizedText.includes(item.text);
      return nearTime && similarText;
    });
    if (alreadyConfident) continue;

    const identity = resolveLikelySpeaker(start, safeEnd, timeline, participantDirectory || {});
    if (!identity) continue;
    const person = participantDirectory?.[identity] || {};
    const email = normalizeEmail(person?.email);
    if (!email) continue;

    inferred.push({
      participant_identity: `__condomit_inferred__:${identity}`,
      participant_email: email,
      participant_name: cleanText(person?.name || email),
      participant_role: cleanText(person?.role || 'morador').toLowerCase(),
      transcript: text,
      spoken_at: new Date(absoluteTime).toISOString(),
      inferred: true
    });
  }

  // Junta fragmentos próximos para produzir uma leitura compreensível sem
  // transformar pequenos tokens do Whisper em dezenas de parágrafos da Ata.
  const merged = [];
  for (const entry of inferred) {
    const last = merged[merged.length - 1];
    const lastTime = last ? new Date(last.spoken_at).getTime() : 0;
    const currentTime = new Date(entry.spoken_at).getTime();
    if (
      last &&
      Number.isFinite(lastTime) && Number.isFinite(currentTime) &&
      currentTime - lastTime <= 9000 &&
      String(last.transcript || '').length + String(entry.transcript || '').length < 700
    ) {
      last.transcript = joinTranscriptTokens(last.transcript, entry.transcript);
      continue;
    }
    merged.push({ ...entry });
  }

  return merged.slice(0, 30);
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


function compactEntriesForPayload(entries) {
  const source = Array.isArray(entries) ? entries.filter(Boolean) : [];
  if (!source.length) return [];

  const merged = [];
  for (const entry of source) {
    const text = cleanText(entry?.transcript);
    if (!text) continue;
    const last = merged[merged.length - 1];
    const sameSpeaker = last
      && last.participant_email === entry.participant_email
      && last.participant_identity === entry.participant_identity;
    const lastTime = last ? new Date(last.spoken_at).getTime() : 0;
    const currentTime = new Date(entry.spoken_at).getTime();
    const closeEnough = sameSpeaker && Number.isFinite(lastTime) && Number.isFinite(currentTime) && (currentTime - lastTime) <= 12000;
    const underTextLimit = sameSpeaker && (String(last.transcript || '').length + text.length + 1) <= 360;

    if (closeEnough && underTextLimit) {
      last.transcript = joinTranscriptTokens(last.transcript, text);
      continue;
    }

    merged.push({ ...entry, transcript: text });
  }

  const limited = [];
  let estimatedBytes = 0;
  for (const entry of merged) {
    const clone = { ...entry, transcript: cleanText(entry.transcript).slice(0, 420) };
    const itemSize = new TextEncoder().encode(JSON.stringify(clone)).length;
    if (limited.length >= 140) break;
    if (estimatedBytes + itemSize > 220000 && limited.length >= 1) break;
    limited.push(clone);
    estimatedBytes += itemSize;
  }
  return limited;
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

  // A linha do tempo continua sendo usada para distinguir transcrição segura
  // de conteúdo presumido. Se ela estiver incompleta, ainda tentamos recuperar
  // o conteúdo textual da gravação, mas ele será marcado como estimativa.
  const cleanTimeline = (Array.isArray(speakerTimeline) ? speakerTimeline : [])
    .filter((segment) => Number(segment?.end) > Number(segment?.start));

  statusText('Preparando o vídeo salvo na Ata para transcrição…');
  const objectUrl = URL.createObjectURL(blob);

  try {
    const transcriber = await getTranscriber();
    statusText('Transcrevendo o áudio do vídeo da Ata e removendo falas paralelas…');

    const output = await transcriber(objectUrl, {
      language: 'portuguese',
      task: 'transcribe',
      return_timestamps: 'word',
      chunk_length_s: 30,
      stride_length_s: 5
    });

    const rawConfidentEntries = buildEntries(
      output,
      startedAt,
      cleanTimeline,
      participantDirectory || {}
    );
    const confidentEntries = compactEntriesForPayload(rawConfidentEntries);
    const inferredEntries = compactEntriesForPayload(buildInferredEntries(
      output,
      startedAt,
      cleanTimeline,
      participantDirectory || {},
      confidentEntries
    ));
    const entries = compactEntriesForPayload([...confidentEntries, ...inferredEntries]);

    statusText(inferredEntries.length
      ? 'Salvando transcrição e conteúdo presumido na Ata…'
      : 'Salvando transcrição na Ata…');
    await persistEntries(assemblyId, entries);

    statusText(
      entries.length
        ? (inferredEntries.length
          ? `Gravação salva. Foram registrados ${confidentEntries.length} trecho${confidentEntries.length === 1 ? '' : 's'} reconhecido${confidentEntries.length === 1 ? '' : 's'} e ${inferredEntries.length} trecho${inferredEntries.length === 1 ? '' : 's'} presumido${inferredEntries.length === 1 ? '' : 's'} para conferência na gravação.`
          : `Gravação e transcrição salvas na Ata (${entries.length} trecho${entries.length === 1 ? '' : 's'}).`)
        : 'Gravação salva. O reconhecimento não produziu texto utilizável; consulte a gravação audiovisual da Ata.'
    );
    return entries;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
