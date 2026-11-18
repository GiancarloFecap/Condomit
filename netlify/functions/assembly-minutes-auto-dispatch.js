'use strict';

const {adminClient,workerToken,TABLE} = require('./lib/assembly-auto-minutes');

const reply=(code,data)=>({statusCode:code,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});

async function readyAssemblies(admin) {
  const {data:meetings,error}=await admin.from('scheduled_assemblies')
    .select('id,status,ended_at').eq('status','encerrada')
    .order('ended_at',{ascending:false}).limit(75);
  if(error) throw error;
  if(!meetings?.length) return [];
  const ids=meetings.map(row=>row.id);
  const [recordingsResult,jobsResult,signaturesResult]=await Promise.all([
    admin.from('assembly_recordings').select('assembly_id,id,status,transcription_status,transcription_model').in('assembly_id',ids),
    admin.from(TABLE).select('assembly_id,status,attempts,locked_until,next_retry_at').in('assembly_id',ids),
    admin.from('assembly_minutes_signatures').select('assembly_id').in('assembly_id',ids)
  ]);
  for(const item of [recordingsResult,jobsResult,signaturesResult]) if(item.error) throw item.error;
  const byMeeting=new Map();
  for(const video of recordingsResult.data||[]) {
    if(!byMeeting.has(video.assembly_id)) byMeeting.set(video.assembly_id,[]);
    byMeeting.get(video.assembly_id).push(video);
  }
  const signed=new Set((signaturesResult.data||[]).map(x=>Number(x.assembly_id)));
  const now=Date.now();
  const jobs=new Map((jobsResult.data||[]).map(job=>[Number(job.assembly_id),job]));
  return meetings.filter(meeting=>{
    if(signed.has(Number(meeting.id))) return false;
    const videos=byMeeting.get(meeting.id)||[];
    if(!videos.length||videos.some(v=>v.status!=='concluido'||v.transcription_status!=='concluido'
      || !String(v.transcription_model||'').startsWith('deepgram:'))) return false;
    const job=jobs.get(meeting.id);
    if(!job) return true;
    if(job.status==='concluido' || job.status==='bloqueado') return false;
    if(Number(job.attempts||0)>=5) return false;
    if(job.status==='processando' && Date.parse(job.locked_until||0)>now) return false;
    if(job.status==='falhou' && Date.parse(job.next_retry_at||0)>now) return false;
    return true;
  }).slice(0,4);
}

async function dispatchAuto(admin,fetcher=fetch) {
  if(!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada no servidor.');
  const meetings=await readyAssemblies(admin);
  const domain=String(process.env.URL || '').trim();
  if(!/^https:\/\/[^/]+/.test(domain)) throw new Error('URL de produção da Netlify não configurada para disparar o processamento.');
  const endpoint=new URL('/.netlify/functions/assembly-minutes-auto-background',domain).href;
  const results=[];
  for(const meeting of meetings) {
    const {error}=await admin.from(TABLE).upsert({assembly_id:meeting.id,status:'pendente'},
      {onConflict:'assembly_id',ignoreDuplicates:true});
    if(error) throw error;
    const response=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/json',
      'x-condomit-auto-token':workerToken()},body:JSON.stringify({assembly_id:meeting.id}),signal:AbortSignal.timeout(9000)});
    results.push({id:meeting.id,accepted:response.status===202||response.ok});
    if(!response.ok && response.status!==202) console.warn('[AUTO ATA] Processo não aceito:',meeting.id,response.status);
  }
  return results;
}
exports.handler=async()=>{
  try {const admin=adminClient();const results=await dispatchAuto(admin);return reply(200,{ok:true,results});}
  catch(error){console.error('[AUTO ATA DISPATCH]',String(error?.message||error).slice(0,200));return reply(500,{ok:false});}
};
exports.readyAssemblies=readyAssemblies;
exports.dispatchAuto=dispatchAuto;
