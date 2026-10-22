'use strict';
const { adminClient, enqueueTranscription } = require('./lib/assembly-gemini-transcription');
const digits = value => String(value || '').replace(/\D/g, '');
const reply = (statusCode, data) => ({ statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(data) });

exports.handler = async event => {
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Método não permitido.' });
  try {
    const jwt = String(event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
    if (!jwt) return reply(401, { error: 'Sessão necessária.' });
    const id = Number(JSON.parse(event.body || '{}').recording_id);
    if (!Number.isSafeInteger(id) || id <= 0) return reply(400, { error: 'Gravação inválida.' });
    const admin = adminClient();
    const { data: auth, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !auth?.user?.email) return reply(401, { error: 'Sessão expirada.' });
    const email = auth.user.email.toLowerCase();
    const { data: record, error: recordError } = await admin.from('assembly_recordings').select('id,assembly_id,status,transcription_status,transcription_error,transcription_attempts').eq('id', id).maybeSingle();
    if (recordError) throw recordError;
    if (!record) return reply(404, { error: 'Gravação não encontrada.' });
    const [{data: assembly}, {data: links}, {data: profile}] = await Promise.all([
      admin.from('scheduled_assemblies').select('cep').eq('id', record.assembly_id).maybeSingle(),
      admin.from('user_condominiums').select('condominium_id').eq('user_email', email),
      admin.from('users').select('condominium').eq('email', email).maybeSingle()
    ]);
    let condo = profile?.condominium;
    if (typeof condo === 'string') { try { condo = JSON.parse(condo); } catch { condo = {}; } }
    if (!assembly || ![...(links || []).map(item => item.condominium_id), condo?.cep, condo?.condominium_id].some(value => digits(value) && digits(value) === digits(assembly.cep))) {
      return reply(403, { error: 'Acesso não autorizado à gravação.' });
    }
    if (record.status !== 'concluido') return reply(409, { error: 'O vídeo ainda não foi concluído.' });
    if (record.transcription_status === 'concluido') return reply(200, { status: 'concluido' });
    if (!process.env.GEMINI_API_KEY) {
      const message = 'GEMINI_API_KEY ausente nas variáveis de ambiente da Netlify.';
      await admin.from('assembly_recordings').update({ transcription_status: 'falhou', transcription_error: message }).eq('id', id).in('transcription_status', ['pendente', 'falhou']);
      return reply(503, { error: message });
    }
    try {
      const queued = await enqueueTranscription(id);
      return reply(200, { queued, status: queued ? 'enfileirado' : record.transcription_status });
    } catch (error) {
      return reply(503, { error: String(error.message).slice(0, 300) });
    }
  } catch (error) {
    console.error('[ASSEMBLY GEMINI KICK]', String(error?.message || error).slice(0, 180));
    return reply(500, { error: 'Não foi possível solicitar a transcrição.' });
  }
};
