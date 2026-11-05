'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const originalLoad = Module._load;
Module._load = function load(request, ...rest) {
  if (request === '@supabase/supabase-js') return { createClient: () => ({}) };
  return originalLoad.call(this, request, ...rest);
};
const core = require(path.join(__dirname, '../netlify/functions/lib/assembly-deepgram'));
Module._load = originalLoad;

const base = {
  id: 7, assembly_id: 20, status: 'concluido',
  recording_url: 'storage://condomit-assembly-recordings/20/valid-video.mp4',
  transcription_status: 'pendente', transcription_model: null, transcription_attempts: 0
};

test('recusa leitura de vídeo fora do diretório privado e travessias', () => {
  assert.equal(core.storagePath(base), '20/valid-video.mp4');
  assert.throws(() => core.storagePath({ ...base, recording_url: 'storage://condomit-assembly-recordings/21/video.mp4' }));
  assert.throws(() => core.storagePath({ ...base, recording_url: 'storage://condomit-assembly-recordings/20/../video.mp4' }));
});

test('aceita apenas gravações concluídas e não repete trabalhos já concluídos', () => {
  assert.equal(core.shouldProcess(base), true);
  assert.equal(core.shouldProcess({ ...base, status: 'gravando' }), false);
  assert.equal(core.shouldProcess({ ...base, transcription_status: 'concluido', transcription_model: core.MODEL }), false);
  assert.equal(core.shouldProcess({ ...base, transcription_status: 'falhou', transcription_model: core.MODEL, transcription_attempts: 5 }), false);
  assert.equal(core.shouldProcess({ ...base, transcription_status: 'enfileirado', transcription_model: core.MODEL, transcription_attempts: 1, transcription_started_at: new Date().toISOString() }), false);
});

test('mantém falas e tempos originais retornados pelo Deepgram', () => {
  const rows = core.parseSegments({ results: { utterances: [
    { start: 1.12, end: 3.81, speaker: 0, confidence: .94, transcript: 'Bom dia. Todos conseguem me ouvir?' },
    { start: 4.1, end: 6.25, speaker: 1, confidence: .87, transcript: 'Sim, podemos começar.' }
  ] } });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.text), ['Bom dia. Todos conseguem me ouvir?', 'Sim, podemos começar.']);
  assert.deepEqual(rows.map(row => row.speaker), [0, 1]);
  assert.deepEqual(rows.map(row => [row.start, row.end]), [[1.12, 3.81], [4.1, 6.25]]);
});

test('separa fala longa sem cortar conteúdo e não inventa identidade de participante', () => {
  const sentence = Array.from({ length: 820 }, () => 'assembleia condomínio').join(' ');
  const rows = core.parseSegments({ results: { utterances: [{ start: 0, end: 120, speaker: null, transcript: sentence }] } });
  assert.ok(rows.length > 1);
  assert.equal(rows.map(row => row.text).join(' '), sentence);
  assert.ok(rows.every(row => row.text.length <= 3900 && row.speaker === null));
});

test('usa fallback de palavras quando utterances não está disponível', () => {
  const rows = core.parseSegments({ results: { channels: [{ alternatives: [{ words: [
    { start: 0, end: .2, punctuated_word: 'Bom', speaker: 0 },
    { start: .3, end: .8, punctuated_word: 'dia.', speaker: 0 }
  ] }] }] } });
  assert.equal(rows[0].text, 'Bom dia.');
});

test('envia mídia assinada ao Deepgram com callback autenticado e pt-BR', async () => {
  process.env.DEEPGRAM_API_KEY = 'test-api-key';
  process.env.SUPABASE_URL = 'https://unit-test.supabase.co';
  process.env.URL = 'https://condomit.com.br';
  const updates = [];
  const admin = {
    storage: { from: bucket => {
      assert.equal(bucket, 'condomit-assembly-recordings');
      return { createSignedUrl: async (file, seconds) => {
        assert.equal(file, '20/valid-video.mp4');
        assert.equal(seconds, 7200);
        return { data: { signedUrl: 'https://unit-test.supabase.co/storage/v1/object/sign/video?token=test-signed' }, error: null };
      } };
    } },
    from: table => ({ update: values => {
      const query = { eq: () => query, then: resolve => { updates.push([table, values]); return Promise.resolve({ error: null }).then(resolve); } };
      return query;
    } })
  };
  let called = false;
  const fakeFetch = async (url, options) => {
    called = true;
    assert.equal(url.host, 'api.deepgram.com');
    assert.equal(url.searchParams.get('model'), 'nova-3');
    assert.equal(url.searchParams.get('language'), 'pt-BR');
    assert.equal(url.searchParams.get('diarize_model'), 'latest');
    assert.equal(url.searchParams.get('callback'), 'https://condomit.com.br/.netlify/functions/assembly-deepgram-callback');
    assert.equal(url.searchParams.getAll('extra').length, 2);
    assert.match(options.headers.Authorization, /^Token test-api-key$/);
    assert.match(JSON.parse(options.body).url, /token=test-signed$/);
    return { ok: true, json: async () => ({ request_id: 'job-123' }) };
  };
  assert.equal(await core.sendToDeepgram(admin, base, 'f'.repeat(64), fakeFetch), 'job-123');
  assert.ok(called);
  assert.equal(updates.length, 2);
  delete process.env.DEEPGRAM_API_KEY;
});

test('callback autenticado grava transcrição apenas via transação do banco', async () => {
  const token = 'a'.repeat(64);
  let commits = 0;
  const admin = {
    from: table => {
      assert.equal(table, 'assembly_deepgram_jobs');
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({
        data: { recording_id: 7, callback_token_hash: core.secretHash(token), request_id: 'req-123', completed_at: null }, error: null
      }) }) }) };
    },
    rpc: async (name, args) => {
      if (name === 'condomit_auto_identify_deepgram_065') return { data: 1, error: null };
      commits++;
      assert.equal(name, 'condomit_finish_deepgram_063');
      assert.equal(args.target_recording_id, 7);
      assert.equal(args.callback_request_id, 'req-123');
      assert.equal(args.transcript_segments[0].text, 'Votação aprovada.');
      return { data: 'ok', error: null };
    }
  };
  const before = core.adminClient;
  core.adminClient = () => admin;
  const filename = require.resolve('../netlify/functions/assembly-deepgram-callback');
  delete require.cache[filename];
  const { handler } = require(filename);
  core.adminClient = before;
  const response = await handler({ httpMethod: 'POST', body: JSON.stringify({
    metadata: { extra: { recording_id: '7', callback_secret: token }, request_id: 'req-123', duration: 5.2 },
    results: { utterances: [{ start: 1, end: 3, speaker: 0, transcript: 'Votação aprovada.' }] }
  }) });
  assert.equal(response.statusCode, 204);
  assert.equal(commits, 1);
});

test('callback rejeita segredo inválido sem alterar dados', async () => {
  const filename = require.resolve('../netlify/functions/assembly-deepgram-callback');
  const { handler } = require(filename);
  const response = await handler({ httpMethod: 'POST', body: JSON.stringify({
    metadata: { extra: { recording_id: 7, callback_secret: 'invalid' } }, results: {}
  }) });
  assert.equal(response.statusCode, 403);
});


test('junta utterances da mesma voz mesmo quando há pausas breves no meio da frase', () => {
  const input = {
    results: { utterances: [
      {start: 1, end: 2, speaker: 0, transcript: 'Foi apresentada uma proposta'},
      {start: 3, end: 4, speaker: 0, transcript: 'no valor de oito mil'},
      {start: 5, end: 6, speaker: 0, transcript: 'e quinhentos reais.'},
      {start: 7, end: 9, speaker: 1, transcript: 'Gostaria de comentar.'}
    ] }
  };
  const rows = core.parseSegments(input);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].text, 'Foi apresentada uma proposta no valor de oito mil e quinhentos reais.');
  assert.equal(rows[0].start, 1);
  assert.equal(rows[0].end, 6);
  assert.equal(rows[1].speaker, 1);
});
