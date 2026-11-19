'use strict';

const {adminClient,isWorkerToken,TABLE,generateAutoMinutes} = require('./lib/assembly-auto-minutes');

const reply=(code,data)=>({statusCode:code,body:JSON.stringify(data),headers:{'Content-Type':'application/json'}});

async function claim(admin,assemblyId) {
  const {data:row,error}=await admin.from(TABLE)
    .select('status,attempts,locked_until,next_retry_at').eq('assembly_id',assemblyId).maybeSingle();
  if(error) throw error;
  if(!row||row.status==='concluido'||row.status==='bloqueado'||Number(row.attempts||0)>=5) return null;
  const now=Date.now();
  if(row.status==='processando' && Date.parse(row.locked_until||0)>now) return null;
  if(row.status==='falhou' && Date.parse(row.next_retry_at||0)>now) return null;
  const attempts=Number(row.attempts||0)+1;
  const {data:updated,error:claimError}=await admin.from(TABLE).update({
    status:'processando',attempts,locked_until:new Date(now+17*60*1000).toISOString(),
    next_retry_at:null,last_error:null,progress_completed:0,progress_total:0,progress_stage:'preparando',updated_at:new Date(now).toISOString()
  }).eq('assembly_id',assemblyId).eq('status',row.status).eq('attempts',row.attempts)
    .select('assembly_id,status,attempts').maybeSingle();
  if(claimError) throw claimError;
  return updated || null;
}
async function runAuto(admin,assemblyId,generate=generateAutoMinutes) {
  const owned=await claim(admin,assemblyId);
  if(!owned) return {skipped:true};
  try {
    const {data:existing,error:draftError}=await admin.from('assembly_minutes_drafts')
      .select('assembly_id,body,status,saved_by').eq('assembly_id',assemblyId).maybeSingle();
    if(draftError) throw draftError;
    const signature=await admin.from('assembly_minutes_signatures').select('assembly_id').eq('assembly_id',assemblyId).maybeSingle();
    if(signature.error) throw signature.error;
    if(existing?.status==='aprovada' || signature.data) {
      await admin.from(TABLE).update({status:'bloqueado',locked_until:null,
        last_error:'ATA já aprovada ou assinada: a IA não altera documentos oficiais.'})
        .eq('assembly_id',assemblyId).eq('status','processando').eq('attempts',owned.attempts);
      return {blocked:true};
    }
    const onProgress=async({completed,total})=>{
      const {error}=await admin.from(TABLE).update({progress_stage:'redigindo',
        progress_completed:completed,progress_total:total,updated_at:new Date().toISOString()})
        .eq('assembly_id',assemblyId).eq('status','processando').eq('attempts',owned.attempts);
      if(error) throw error;
    };
    const output=await generate(admin,assemblyId,onProgress);
    const {data:lock,error:lockError}=await admin.from(TABLE).select('status,attempts')
      .eq('assembly_id',assemblyId).maybeSingle();
    if(lockError) throw lockError;
    if(lock?.status!=='processando'||Number(lock.attempts)!==Number(owned.attempts))
      return {skipped:true,reason:'A identificação mudou durante a redação; uma nova ATA será gerada.'};
    await admin.from(TABLE).update({progress_stage:'salvando',updated_at:new Date().toISOString()})
      .eq('assembly_id',assemblyId).eq('status','processando').eq('attempts',owned.attempts);
    const {data:meeting,error:meetingError}=await admin.from('scheduled_assemblies')
      .select('cep,status').eq('id',assemblyId).maybeSingle();
    if(meetingError||!meeting||meeting.status!=='encerrada') throw new Error('Assembleia não está encerrada no momento de salvar.');
    // Revalida assinatura após a chamada externa: ela pode ter sido adicionada enquanto o Claude redigia.
    const signatureBeforeSave=await admin.from('assembly_minutes_signatures').select('assembly_id')
      .eq('assembly_id',assemblyId).maybeSingle();
    if(signatureBeforeSave.error) throw signatureBeforeSave.error;
    if(signatureBeforeSave.data) throw new Error('A ATA foi assinada durante a geração e não poderá ser substituída.');
    // Não substitui revisões humanas; gera a minuta e guarda uma cópia auditável no job.
    const already=await admin.from('assembly_minutes_drafts').select('body,status,saved_by').eq('assembly_id',assemblyId).maybeSingle();
    if(already.error) throw already.error;
    let saved=false;
    if(!already.data || (already.data.status==='rascunho' && already.data.saved_by==='sistema:claude')) {
      const draft={assembly_id:assemblyId,cep:meeting.cep,body:output.body,status:'rascunho',
        saved_by:'sistema:claude',observacoes_revisao:output.unidentified_speakers
          ? [{motivo:'Existem falas sem identificação segura; confira os participantes antes de aprovar.',quantidade:output.unidentified_speakers}]:[]};
      if(!already.data) {
        const {error}=await admin.from('assembly_minutes_drafts').upsert(draft,{onConflict:'assembly_id',ignoreDuplicates:true});
        if(error) throw error;
      } else {
        const {error}=await admin.from('assembly_minutes_drafts').update({body:draft.body,
          observacoes_revisao:draft.observacoes_revisao,updated_at:new Date().toISOString()})
          .eq('assembly_id',assemblyId).eq('status','rascunho').eq('saved_by','sistema:claude');
        if(error) throw error;
      }
      const checked=await admin.from('assembly_minutes_drafts').select('saved_by,body').eq('assembly_id',assemblyId).maybeSingle();
      if(checked.error) throw checked.error;
      saved=checked.data?.saved_by==='sistema:claude' && checked.data?.body===output.body;
    }
    const {error:doneError}=await admin.from(TABLE).update({status:'concluido',generated_body:output.body,
      source_hash:output.source_hash,source_count:output.source_count,saved_to_draft:saved,
      finished_at:new Date().toISOString(),locked_until:null,last_error:null,progress_stage:'concluido',updated_at:new Date().toISOString()})
      .eq('assembly_id',assemblyId).eq('status','processando').eq('attempts',owned.attempts);
    if(doneError) throw doneError;
    return {generated:true,saved};
  } catch(error) {
    const message=String(error?.message||error).slice(0,500);
    const delay=Math.min(60,3*Math.pow(2,Math.max(0,owned.attempts-1)));
    const {error:failedError}=await admin.from(TABLE).update({status:'falhou',last_error:message,
      locked_until:null,progress_stage:'falhou',next_retry_at:new Date(Date.now()+delay*60*1000).toISOString(),updated_at:new Date().toISOString()})
      .eq('assembly_id',assemblyId).eq('status','processando').eq('attempts',owned.attempts);
    if(failedError) console.error('[AUTO ATA STATUS]',String(failedError.message||'').slice(0,120));
    throw error;
  }
}
exports.handler=async event=>{
  if(event.httpMethod!=='POST') return reply(405,{error:'Método não permitido.'});
  try {
    if(!isWorkerToken(event.headers?.['x-condomit-auto-token'] || event.headers?.['X-Condomit-Auto-Token'])) return reply(403,{error:'Proibido.'});
    const body=JSON.parse(event.body||'{}'),id=Number(body.assembly_id);
    if(!Number.isSafeInteger(id)||id<=0) return reply(400,{error:'Assembleia inválida.'});
    const result=await runAuto(adminClient(),id);
    return reply(200,{ok:true,...result});
  } catch(error) {
    console.error('[AUTO ATA BACKGROUND]',String(error?.message||error).slice(0,260));
    return reply(500,{ok:false});
  }
};
exports.claim=claim;
exports.runAuto=runAuto;
