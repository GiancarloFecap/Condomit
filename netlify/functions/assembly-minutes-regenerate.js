'use strict';

const {adminClient,TABLE} = require('./lib/assembly-auto-minutes');
const reply=(statusCode,body)=>({statusCode,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify(body)});
const cep=value=>String(value||'').replace(/\D/g,'');

async function requestNewMinutes(admin,{assemblyId,email,now=new Date()}) {
  const normalized=String(email||'').trim().toLowerCase();
  const [{data:account,error:accountError},{data:links,error:linksError},{data:meeting,error:meetingError}]=await Promise.all([
    admin.from('users').select('email,user_type,condominium').ilike('email',normalized).maybeSingle(),
    admin.from('user_condominiums').select('condominium_id').ilike('user_email',normalized),
    admin.from('scheduled_assemblies').select('id,cep,status').eq('id',assemblyId).maybeSingle()
  ]);
  if(accountError||linksError||meetingError) throw accountError||linksError||meetingError;
  if(!account || !['sindico','síndico','admin'].includes(String(account.user_type||'').toLowerCase()))
    return {statusCode:403,error:'Somente o síndico pode gerar outra ATA.'};
  if(!meeting || meeting.status!=='encerrada')
    return {statusCode:409,error:'A assembleia ainda não foi encerrada.'};
  let condominium=account.condominium;
  if(typeof condominium==='string') {try{condominium=JSON.parse(condominium);}catch{condominium={};}}
  const target=cep(meeting.cep);
  const authorized=target.length===8&&[...(links||[]).map(x=>x.condominium_id),condominium?.cep,condominium?.condominium_id]
    .some(value=>cep(value)===target);
  if(!authorized) return {statusCode:403,error:'Síndico não vinculado ao condomínio da assembleia.'};
  const [draft,signature,videos,current]=await Promise.all([
    admin.from('assembly_minutes_drafts').select('status').eq('assembly_id',assemblyId).maybeSingle(),
    admin.from('assembly_minutes_signatures').select('assembly_id').eq('assembly_id',assemblyId).maybeSingle(),
    admin.from('assembly_recordings').select('id,status,transcription_status,transcription_model').eq('assembly_id',assemblyId),
    admin.from(TABLE).select('status,manual_request_at,locked_until').eq('assembly_id',assemblyId).maybeSingle()
  ]);
  for(const response of [draft,signature,videos,current]) if(response.error) throw response.error;
  if(draft.data?.status==='aprovada'||signature.data)
    return {statusCode:409,error:'Reabra a ATA aprovada e retire a assinatura antes de solicitar uma nova redação.'};
  if(!videos.data?.length || videos.data.some(item=>item.status!=='concluido'||item.transcription_status!=='concluido'
     ||!String(item.transcription_model||'').startsWith('deepgram:')))
    return {statusCode:409,error:'A transcrição Deepgram precisa estar concluída antes de gerar outra ATA.'};
  const currentJob=current.data;
  if(['pendente','processando'].includes(currentJob?.status))
    return {statusCode:409,error:'A geração já está em andamento. Aguarde sua conclusão.'};
  const latest=Date.parse(currentJob?.manual_request_at||0);
  if(Number.isFinite(latest) && latest>0 && now.getTime()-latest<30000)
    return {statusCode:429,error:'Uma nova ATA já foi solicitada. Aguarde antes de solicitar novamente.'};
  const {error}=await admin.from(TABLE).upsert({assembly_id:assemblyId,status:'pendente',attempts:0,
    manual_request_at:now.toISOString(),locked_until:null,next_retry_at:null,last_error:null,
    generated_body:null,saved_to_draft:false,finished_at:null,source_hash:null,source_count:0,
    progress_completed:0,progress_total:0,progress_stage:'aguardando',updated_at:now.toISOString()},
    {onConflict:'assembly_id'});
  if(error) throw error;
  return {statusCode:200,queued:true};
}
exports.handler=async event=>{
  if(event.httpMethod!=='POST') return reply(405,{error:'Método não permitido.'});
  try {
    const body=JSON.parse(event.body||'{}'),id=Number(body.assembly_id);
    if(!Number.isSafeInteger(id)||id<=0) return reply(400,{error:'Assembleia inválida.'});
    const token=String(event.headers?.authorization||event.headers?.Authorization||'').replace(/^Bearer\s+/i,'').trim();
    if(!token) return reply(401,{error:'Sessão necessária.'});
    const admin=adminClient();
    const {data,error}=await admin.auth.getUser(token);
    if(error||!data?.user?.email) return reply(401,{error:'Sessão inválida.'});
    const result=await requestNewMinutes(admin,{assemblyId:id,email:data.user.email});
    return reply(result.statusCode,result.statusCode===200?{queued:true}:{error:result.error});
  }catch(error){console.error('[ATA REGENERATE]',String(error?.message||error).slice(0,240));return reply(500,{error:'Não foi possível solicitar uma nova ATA.'});}
};
exports.requestNewMinutes=requestNewMinutes;
