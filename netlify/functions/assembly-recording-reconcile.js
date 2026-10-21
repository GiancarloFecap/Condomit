'use strict';
const { createClient } = require('@supabase/supabase-js');
const { reconcileAssembly } = require('./lib/assembly-recording-state');

const reply = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) });
const norm = value => String(value || '').replace(/\D/g, '');

exports.handler = async event => {
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Método não permitido.' });
  try {
    const jwt = String(event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
    if (!jwt) return reply(401, { error: 'Autenticação necessária.' });
    const assemblyId = Number(JSON.parse(event.body || '{}').assembly_id);
    if (!Number.isSafeInteger(assemblyId) || assemblyId <= 0) return reply(400, { error: 'Assembleia inválida.' });
    const admin = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !user?.email) return reply(401, { error: 'Sessão inválida.' });
    const email = user.email.toLowerCase();
    const [{ data: assembly }, { data: profile }, { data: links }] = await Promise.all([
      admin.from('scheduled_assemblies').select('id,cep').eq('id', assemblyId).maybeSingle(),
      admin.from('users').select('condominium').eq('email', email).maybeSingle(),
      admin.from('user_condominiums').select('condominium_id').eq('user_email', email)
    ]);
    if (!assembly) return reply(404, { error: 'Assembleia não encontrada.' });
    let condo = profile?.condominium;
    if (typeof condo === 'string') { try { condo = JSON.parse(condo); } catch (_) { condo = {}; } }
    if (![...(links || []).map(item => item.condominium_id), condo?.cep, condo?.condominium_id].some(value => norm(value) === norm(assembly.cep))) return reply(403, { error: 'Você não pertence a este condomínio.' });
    const before = await admin.from('assembly_recordings').select('id,status').eq('assembly_id', assemblyId).limit(20);
    if (before.error) throw before.error;
    const recordings = await reconcileAssembly(admin, assemblyId, { limit: 20 });
    const updated = recordings.filter(row => (before.data || []).some(previous => previous.id === row.recording_id && previous.status !== row.status)).length;
    return reply(200, { ok: true, updated, recordings });
  } catch (error) {
    console.error('[ASSEMBLY RECORDING RECONCILE]', error);
    return reply(500, { error: 'Não foi possível conferir o estado da gravação.' });
  }
};
