const { createClient } = require('@supabase/supabase-js');
const { stopAssemblyEgress, hasConnectedAssemblyParticipants } = require('./lib/assembly-recording-state');

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

  // Antes da RPC, solicita STOP dos Egress elegíveis que ficaram sem participantes.
  // O banco impede o encerramento enquanto os arquivos ainda estiverem pendentes.
  const { data: active, error: candidatesError } = await supabase.from('scheduled_assemblies')
    .select('id,cep,livekit_room_name,date,start_time,status,last_presence_check_at')
    .eq('status', 'em_andamento').order('created_at', { ascending: true }).limit(50);
  if (candidatesError) return { statusCode: 500, body: JSON.stringify({ error: candidatesError.message }) };
  const now = Date.now();
  for (const item of active || []) {
    const planned = new Date(`${item.date}T${String(item.start_time || '00:00').slice(0, 5)}:00-03:00`).getTime();
    if (!Number.isFinite(planned) || now - planned < 30 * 60_000) continue;
    if (item.last_presence_check_at && now - new Date(item.last_presence_check_at).getTime() < 30 * 60_000) continue;
    try {
      if (await hasConnectedAssemblyParticipants(item)) continue;
      await stopAssemblyEgress(supabase, item.id, undefined, { maxWaitMs: 1200 });
      const { error: updateError } = await supabase.from('scheduled_assemblies').update({
        recording_end_requested_at: new Date().toISOString(),
        recording_end_requested_by: 'encerramento_automatico'
      }).eq('id', item.id).eq('status','em_andamento').is('recording_end_requested_at', null);
      if (updateError) throw updateError;
    } catch (error) {
      console.warn('[auto-end-assemblies] Egress protegido: finalização adiada', { assemblyId: item.id, message: String(error?.message || error) });
    }
  }

  const { data, error } = await supabase.rpc('condomit_close_stale_assemblies');

  if (error) {
    console.error('[auto-end-assemblies]', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  const endedIds = (Array.isArray(data) ? data : [])
    .map((row) => row?.assembly_id ?? row)
    .filter(Boolean);

  for (const id of endedIds) {
    try { await stopAssemblyEgress(supabase, Number(id), undefined, { maxWaitMs: 1200 }); }
    catch (error) { console.error('[auto-end-assemblies] Finalização de gravação:', { assemblyId: id, message: String(error?.message || error) }); }
  }
  console.log('[auto-end-assemblies] Assembleias encerradas:', endedIds);
  return { statusCode: 200, body: JSON.stringify({ ok: true, ended: endedIds }) };
};
