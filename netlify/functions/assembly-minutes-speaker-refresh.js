'use strict';

const {adminClient,TABLE} = require('./lib/assembly-auto-minutes');
const reply=(statusCode,data)=>({statusCode,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify(data)});
const digits=value=>String(value||'').replace(/\D/g,'');

async function refreshSpeakerMinutes(admin,{assemblyId,recordingId,email}) {
  const {data:account,error:accountError}=await admin.from('users')
    .select('email,user_type,condominium').ilike('email',email).maybeSingle();
  if(accountError) throw accountError;
  if(!['sindico','síndico','admin'].includes(String(account?.user_type||'').toLowerCase()))
    return {statusCode:403,error:'A correção da ATA é restrita ao síndico.'};

  const [{data:assembly,error:meetingError},{data:recording,error:recordingError},{data:links,error:linksError}]=await Promise.all([
    admin.from('scheduled_assemblies').select('id,cep,status').eq('id',assemblyId).maybeSingle(),
    admin.from('assembly_recordings').select('id,assembly_id').eq('id',recordingId).maybeSingle(),
    admin.from('user_condominiums').select('condominium_id').ilike('user_email',email)
  ]);
  if(meetingError||recordingError||linksError) throw meetingError||recordingError||linksError;
  if(!assembly||recording?.assembly_id!==assemblyId||assembly.status!=='encerrada')
    return {statusCode:409,error:'Assembleia ou gravação não elegível para nova ATA.'};
  let condominium=account.condominium;
  if(typeof condominium==='string'){try{condominium=JSON.parse(condominium);}catch{condominium={};}}
  const candidates=[...(links||[]).map(x=>x.condominium_id),condominium?.cep,condominium?.condominium_id];
  const target=digits(assembly.cep);
  if(target.length!==8||!candidates.some(x=>digits(x)===target))
    return {statusCode:403,error:'Usuário não vinculado ao condomínio desta assembleia.'};
  const [draft,signed]=await Promise.all([
    admin.from('assembly_minutes_drafts').select('status').eq('assembly_id',assemblyId).maybeSingle(),
    admin.from('assembly_minutes_signatures').select('assembly_id').eq('assembly_id',assemblyId).maybeSingle()
  ]);
  if(draft.error||signed.error) throw draft.error||signed.error;
  if(draft.data?.status==='aprovada'||signed.data)
    return {statusCode:409,error:'Reabra a ATA para revisão antes de corrigir a autoria publicada.'};

  // Reenvio só após atribuição manual recente; evita chamadas repetidas que gastem créditos.
  const recent=await admin.from('assembly_deepgram_speakers')
    .select('speaker_index,updated_at').eq('recording_id',recordingId).eq('assignment_source','reviewed')
    .gte('updated_at',new Date(Date.now()-120000).toISOString()).limit(1);
  if(recent.error) throw recent.error;
  if(!recent.data?.length) return {statusCode:409,error:'Corrija primeiro a identificação de uma voz nesta gravação.'};
  const latest=recent.data.map(row=>Date.parse(row.updated_at||0)).reduce((a,b)=>Math.max(a,b),0);
  const current=await admin.from(TABLE).select('status,updated_at').eq('assembly_id',assemblyId).maybeSingle();
  if(current.error) throw current.error;
  if(current.data && Date.parse(current.data.updated_at||0)>=latest)
    return {statusCode:200,queued:true,already_queued:true};

  const {error}=await admin.from(TABLE).upsert({assembly_id:assemblyId,status:'pendente',attempts:0,
    locked_until:null,next_retry_at:null,last_error:null,generated_body:null,saved_to_draft:false,
    finished_at:null,source_hash:null,source_count:0,
    progress_completed:0,progress_total:0,progress_stage:'aguardando',updated_at:new Date().toISOString()},
    {onConflict:'assembly_id'});
  if(error) throw error;
  return {statusCode:200,queued:true};
}

exports.handler=async event=>{
  if(event.httpMethod!=='POST') return reply(405,{error:'Método não permitido.'});
  try{
    const body=JSON.parse(event.body||'{}');
    const assemblyId=Number(body.assembly_id),recordingId=Number(body.recording_id);
    if(!Number.isSafeInteger(assemblyId)||assemblyId<=0||!Number.isSafeInteger(recordingId)||recordingId<=0)
      return reply(400,{error:'Assembleia e gravação são obrigatórias.'});
    const token=String(event.headers?.authorization||event.headers?.Authorization||'').replace(/^Bearer\s+/i,'').trim();
    if(!token) return reply(401,{error:'Sessão necessária.'});
    const admin=adminClient();
    const {data,error}=await admin.auth.getUser(token);
    if(error||!data?.user?.email) return reply(401,{error:'Sessão inválida.'});
    const result=await refreshSpeakerMinutes(admin,{assemblyId,recordingId,email:data.user.email.toLowerCase()});
    return reply(result.statusCode,result.statusCode===200?{queued:true}:{error:result.error});
  }catch(error){console.error('[ATA SPEAKER REFRESH]',String(error?.message||error).slice(0,200));return reply(500,{error:'Não foi possível reprocessar a ATA.'});}
};
exports.refreshSpeakerMinutes=refreshSpeakerMinutes;
