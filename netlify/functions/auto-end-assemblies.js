const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

exports.handler = async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[auto-end-assemblies] Variáveis do Supabase ausentes.');
    return { statusCode: 500, body: 'Supabase não configurado' };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data, error } = await supabase.rpc('condomit_close_stale_assemblies');

  if (error) {
    console.error('[auto-end-assemblies]', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  const endedIds = (Array.isArray(data) ? data : [])
    .map((row) => row?.assembly_id ?? row)
    .filter(Boolean);

  console.log('[auto-end-assemblies] Assembleias encerradas:', endedIds);
  return { statusCode: 200, body: JSON.stringify({ ok: true, ended: endedIds }) };
};
