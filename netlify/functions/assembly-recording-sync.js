'use strict';
const { createClient } = require('@supabase/supabase-js');
const { reconcileRecording, reconcileAssembly, client, stopAssemblyEgress } = require('./lib/assembly-recording-state');
const { triggerRecovery, TABLE } = require('./lib/assembly-egress-recovery');

exports.handler = async () => {
  try {
    const admin = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data, error } = await admin.from('assembly_recordings')
      .select('id,assembly_id,status,egress_id,recording_url,started_at,created_at,ended_at,file_size_bytes')
      .in('status', ['pendente', 'gravando', 'falhou'])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    const api = client();
    const ids = [...new Set((data || []).filter(row => row.egress_id).map(row => row.assembly_id))];
    if (ids.length) {
      const { data: assemblies, error: assemblyError } = await admin.from('scheduled_assemblies').select('id,status').in('id', ids);
      if (assemblyError) throw assemblyError;
      for (const assembly of assemblies || []) {
        if (['encerrada', 'cancelada'].includes(assembly.status)) {
          try { await stopAssemblyEgress(admin, assembly.id, api, { maxWaitMs: 1200 }); }
          catch (error) { console.warn('[ASSEMBLY RECORDING AUTO STOP]', { assembly: assembly.id, message: String(error?.message || error) }); }
        }
      }
    }
    let updated = 0;
    for (const record of data || []) {
      try {
        const next = await reconcileRecording(admin, record.assembly_id, record, api);
        if (next.status !== record.status) updated++;
      } catch (error) {
        console.warn('[ASSEMBLY RECORDING SYNC]', { recording: record.id, message: String(error?.message || error) });
      }
    }
    // Mesmo se o webhook falhar, tenta recuperar backups registrados nas execuções anteriores.
    const { data: recoverable, error: recoveryQueryError } = await admin.from(TABLE)
      .select('recording_id,recovery_status,recovery_attempts,last_recovery_at')
      .eq('backup_storage_used', true)
      .in('recovery_status', ['pendente', 'falhou', 'processando'])
      .lt('recovery_attempts', 5).limit(8);
    if (!recoveryQueryError) {
      for (const item of recoverable || []) {
        const sinceAttempt = Date.now() - new Date(item.last_recovery_at || 0).getTime();
        if (sinceAttempt > (item.recovery_status === 'processando' ? 17 : 3) * 60_000)
          await triggerRecovery(item.recording_id);
      }
    }
    // Completa finalizações solicitadas mesmo que o síndico tenha fechado o navegador.
    const { data: pendingEndings, error: endingsError } = await admin.from('scheduled_assemblies')
      .select('id,status').eq('status', 'em_andamento')
      .not('recording_end_requested_at', 'is', null).limit(20);
    if (endingsError) console.warn('[ASSEMBLY ENDING]', { code: endingsError.code });
    for (const assembly of pendingEndings || []) {
      try {
        await stopAssemblyEgress(admin, assembly.id, api, { maxWaitMs: 900 });
        await reconcileAssembly(admin, assembly.id, { limit: 20 });
        const { data: rows, error: statusError } = await admin.from('assembly_recordings')
          .select('id,status').eq('assembly_id', assembly.id).limit(20);
        if (statusError) throw statusError;
        if (!rows?.length || rows.some(row => ['pendente', 'gravando'].includes(row.status))) continue;
        const { error: endError } = await admin.from('scheduled_assemblies').update({
          status: 'encerrada', ended_at: new Date().toISOString(), updated_at: new Date().toISOString()
        }).eq('id', assembly.id).eq('status', 'em_andamento').not('recording_end_requested_at', 'is', null);
        if (endError) throw endError;
        console.info('[ASSEMBLY ENDING] Finalização concluída após resultado terminal do Egress', { assembly: assembly.id });
      } catch (error) { console.warn('[ASSEMBLY ENDING]', { assembly: assembly.id, message: String(error?.message || error) }); }
    }
    console.info('[ASSEMBLY RECORDING SYNC]', { examined: data?.length || 0, updated });
    return { statusCode: 200, body: JSON.stringify({ ok: true, examined: data?.length || 0, updated }) };
  } catch (error) {
    console.error('[ASSEMBLY RECORDING SYNC]', error);
    return { statusCode: 500, body: JSON.stringify({ ok: false }) };
  }
};
