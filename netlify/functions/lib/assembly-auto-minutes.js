'use strict';

const {createHash,createHmac,timingSafeEqual} = require('node:crypto');
const {createClient} = require('@supabase/supabase-js');
const {buildTopics} = require('../../../scripts/assembly/minutes-topics');
const {recognizedName} = require('../../../scripts/assembly/minutes-speech');
const {summarizeClaude} = require('../assembly-minutes-indirect');

const TABLE = 'assembly_auto_minutes_jobs';
const SOURCE = 'recording_video_deepgram';

function adminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL ou chave de serviço ausente.');
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
function workerToken() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error('Chave do servidor ausente para autenticar o processamento interno.');
  return createHmac('sha256',key).update('condomit-auto-minutes-v073').digest('hex');
}
function isWorkerToken(value) {
  const found = String(value || '');
  if (!/^[a-f0-9]{64}$/.test(found)) return false;
  const a=Buffer.from(workerToken(),'hex'),b=Buffer.from(found,'hex');
  return timingSafeEqual(a,b);
}
function chunksOfText(value, limit=6800) {
  const source=String(value || '');
  const result=[];
  for (let cursor=0;cursor<source.length;cursor+=limit) result.push(source.slice(cursor,cursor+limit));
  return result;
}
function speaker(row) {
  const name = recognizedName(row);
  const id = String(row.participant_identity || '');
  const match = id.match(/__deepgram_speaker__:(\d+)/);
  return {name:name || null,role:name ? String(row.participant_role || '') : '',
    participant_email:name ? row.participant_email : null,
    voice:match ? `Falante ${Number(match[1])+1} (não identificado)` : 'Voz não identificada'};
}
function buildRawClaudeTopics(rows,agenda=[],polls=[]) {
  const outlines=buildTopics({rows,agenda,polls});
  const byId=new Map(rows.map(row=>[String(row.id),row]));
  const allocated=new Set();
  const topics=outlines.map(topic=>{
    const used=new Set();
    const contributions=[];
    for(const piece of topic.contributions || []) for(const sourceId of piece.source_ids || []) {
      const id=String(sourceId);
      if(used.has(id)) continue;
      used.add(id);allocated.add(id);
      const row=byId.get(id);
      if(!row || !String(row.transcript||'').trim()) continue;
      const who=speaker(row);
      for(const [index,text] of chunksOfText(row.transcript).entries()) {
        contributions.push({...who,text,source_ids:[id],segment_part:index+1,
          start_seconds:row.start_seconds,end_seconds:row.end_seconds,
          recording_id:row.recording_id});
      }
    }
    return {...topic,contributions};
  });
  const missing=rows.filter(row=>!allocated.has(String(row.id)) && String(row.transcript||'').trim());
  if(missing.length) {
    let misc=topics.find(item=>item.id==='outros-assuntos');
    if(!misc) {misc={id:'outros-assuntos',title:'Outros assuntos discutidos',registered:false,contributions:[],polls:[]};topics.push(misc);}
    for(const row of missing) {
      const who=speaker(row);
      for(const [index,text] of chunksOfText(row.transcript).entries())
        misc.contributions.push({...who,text,source_ids:[String(row.id)],segment_part:index+1,
          start_seconds:row.start_seconds,end_seconds:row.end_seconds,recording_id:row.recording_id});
    }
  }
  return topics;
}
function verifyRawCoverage(rows,topics) {
  const seen=new Map();
  for(const topic of topics) for(const contribution of topic.contributions || []) {
    const id=String(contribution.source_ids?.[0] || '');
    seen.set(id,(seen.get(id)||'')+String(contribution.text||''));
  }
  for(const row of rows) {
    const actual=String(row.transcript || '');
    if(!actual.trim()) continue;
    const assembled=seen.get(String(row.id)) || '';
    if(assembled !== actual && !topics.some(t => t.contributions?.some(p=>String(p.source_ids?.[0])===String(row.id))
      && t.contributions.filter(p=>String(p.source_ids?.[0])===String(row.id)).map(p=>p.text).join('')===actual)) {
      throw new Error(`O trecho Deepgram ${row.id} não foi preservado integralmente no material enviado ao Claude.`);
    }
  }
  return true;
}
function sourceHash(rows) {
  return createHash('sha256').update(JSON.stringify(rows.map(row=>[row.id,row.recording_id,row.participant_email,row.participant_name,row.participant_role,row.participant_identity,row.transcript]))).digest('hex');
}
function formalOpening({meeting,attendees=[],condominium=null}) {
  // Em assembleias efetivamente iniciadas, prevalecem a data e a hora reais.
  const actual=meeting.started_at && !Number.isNaN(Date.parse(meeting.started_at))
    ? new Date(meeting.started_at) : null;
  const actualParts=actual ? new Intl.DateTimeFormat('en-CA',{
    timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(actual) : [];
  const actualDate=actualParts.length ? `${actualParts.find(x=>x.type==='year')?.value}-${actualParts.find(x=>x.type==='month')?.value}-${actualParts.find(x=>x.type==='day')?.value}` : '';
  const date=actualDate || String(meeting.date || '').slice(0,10);
  const parsed=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const ordinals=['','primeiro','segundo','terceiro','quarto','quinto','sexto','sétimo','oitavo','nono','décimo',
    'décimo primeiro','décimo segundo','décimo terceiro','décimo quarto','décimo quinto','décimo sexto','décimo sétimo',
    'décimo oitavo','décimo nono','vigésimo','vigésimo primeiro','vigésimo segundo','vigésimo terceiro',
    'vigésimo quarto','vigésimo quinto','vigésimo sexto','vigésimo sétimo','vigésimo oitavo','vigésimo nono','trigésimo','trigésimo primeiro'];
  const months=['','janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const day=parsed?Number(parsed[3]):0, month=parsed?Number(parsed[2]):0;
  const dateText=(parsed&&ordinals[day]&&months[month])
    ? `Ao ${ordinals[day]} dia do mês de ${months[month]} de ${parsed[1]}`
    : 'Em data registrada no sistema';
  const localClock=String(meeting.start_time||'').match(/^(\d{1,2}):(\d{2})/);
  const actualClock=actual?new Intl.DateTimeFormat('pt-BR',{
    timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).format(actual):'';
  const time=actualClock || (localClock?`${localClock[1].padStart(2,'0')}:${localClock[2]}`:'');
  const clock=time?`, às ${time.replace(':','h')}`:'';
  const condo=condominium||{};
  const clean=value=>String(value||'').replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim();
  const name=clean(condo.condominium_name)||'condomínio';
  const street=[clean(condo.address),clean(condo.address_number)].filter(Boolean).join(', ');
  const locale=[clean(condo.city),clean(condo.state)].filter(Boolean).join('/');
  const cep=clean(condo.cep||meeting.cep);
  const streetParts=[street,clean(condo.complement),clean(condo.neighborhood),locale,cep?`CEP ${cep}`:''].filter(Boolean);
  const location=streetParts.length?`, situado em ${streetParts.join(' – ')}`:'';
  const seen=new Set();
  const participants=[];
  for(const row of attendees) {
    const participant=clean(row.participant_name||row.user_email);
    if(!participant)continue;
    const email=clean(row.user_email).toLowerCase();
    const identity=email||participant.toLowerCase();
    if(seen.has(identity))continue;
    seen.add(identity);
    const role=clean(row.participant_role).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const roleText=(role.startsWith('sind')||role==='admin')?'Síndico':role==='morador'?'Morador':role==='moradora'?'Moradora':role==='porteiro'?'Porteiro':clean(row.participant_role)||'Participante';
    participants.push({email,name:participant,role:roleText});
  }
  const chair=participants.find(person=>person.email&&person.email===clean(meeting.created_by).toLowerCase())
    ||participants.find(person=>person.role==='Síndico');
  const president=chair?`, sob a presidência de ${chair.name}`:'';
  const otherParticipants=participants.filter(person=>!chair || !((chair.email && person.email===chair.email) || person.name.toLocaleLowerCase('pt-BR')===chair.name.toLocaleLowerCase('pt-BR')));
  const attendance=otherParticipants.length
    ? `, com a presença ${otherParticipants.length===1?'do participante':'dos participantes'} ${otherParticipants.map(x=>x.name).join(', ')}`:'';
  const kind=/extraordin/i.test(String(meeting.assembly_type||''))?'Assembleia Geral Extraordinária':'Assembleia Geral Ordinária';
  const title=clean(meeting.title)||'Assembleia';
  return `${dateText}${clock}, nas dependências do ${name}${location}, realizou-se a ${kind} intitulada “${title}”${president}${attendance}, conforme registro eletrônico de frequência mantido pelo Condomit.`;
}
function describePoll(poll,options=[],votes=[]) {
  const pollOpts=options.filter(opt=>String(opt.poll_id)===String(poll.id));
  const counts=pollOpts.map(opt=>({text:String(opt.option_text||opt.text||'Opção'),count:votes.filter(v=>String(v.poll_id)===String(poll.id)&&String(v.option_id)===String(opt.id)).length}));
  const total=votes.filter(v=>String(v.poll_id)===String(poll.id)).length;
  const result=counts.map(opt=>`${opt.text}: ${opt.count} voto${opt.count===1?'':'s'}`).join('; ');
  return `Quanto à votação sobre ${String(poll.title||'a matéria').trim()}, foram registrados ${total} voto${total===1?'':'s'}${result?`, distribuídos da seguinte forma: ${result}`:''}.`;
}
function normalizeAgendaTitle(value) {
  const title=String(value||'').replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').replace(/^[\s:;,.-]+|[\s:;,.-]+$/g,'').trim().slice(0,130);
  return title && !/[<>]/.test(title) ? title : '';
}
function agendaParagraph(topics,narrative) {
  const generated=new Map(narrative.map(item=>[item.id,item]));
  const registered=topics.filter(t=>t.registered).length;
  const seen=new Set();
  const titles=[];
  for(const topic of topics) {
    const generatedTitle=generated.get(topic.id)?.inferred_title;
    const title=normalizeAgendaTitle(topic.registered?topic.title:(generatedTitle||topic.title));
    if(!title || seen.has(title.toLocaleLowerCase('pt-BR'))) continue;
    seen.add(title.toLocaleLowerCase('pt-BR'));
    titles.push(title);
  }
  if(!titles.length) return '';
  const prefix=registered===topics.length
    ? 'A pauta do dia compreendeu os seguintes assuntos previamente cadastrados'
    : registered>0
      ? 'A pauta do dia compreendeu'
      : 'A pauta do dia compreendeu';
  return `${prefix}: ${titles.join('; ')}.`;
}
function composeDraft({meeting,attendees=[],topics=[],narrative=[],options=[],votes=[],condominium=null}) {
  const paragraphs=[formalOpening({meeting,attendees,condominium})];
  const agendaText=agendaParagraph(topics,narrative);
  if(agendaText) paragraphs.push(agendaText);
  const generated=new Map(narrative.map(item=>[item.id,item]));
  for(const topic of topics) {
    const entry=generated.get(topic.id);
    if(!entry) throw new Error(`A pauta ${topic.id} ficou sem resposta do Claude.`);
    if(entry.paragraphs?.length) paragraphs.push(...entry.paragraphs.map(x=>String(x).trim()).filter(Boolean));
    for(const poll of topic.polls || []) paragraphs.push(describePoll(poll,options,votes));
  }
  paragraphs.push('Concluídos os assuntos tratados, e nada mais havendo a consignar, foi encerrada a assembleia. Para constar, lavrou-se a presente ata, que será submetida à revisão, aprovação e assinatura do síndico.');
  const result=paragraphs.join('\n\n');
  if(result.length>100000) throw new Error('A ATA ultrapassou o limite do campo de minuta. Divida o processamento por partes.');
  if(result.length<50) throw new Error('O Claude não produziu uma ATA aproveitável.');
  return result;
}
async function allRows(admin,table,columns,id,extra = query=>query) {
  const result=[];
  for(let offset=0;offset<100000;offset+=1000) {
    const query=extra(admin.from(table).select(columns).eq('assembly_id',id));
    const {data,error}=await query.range(offset,offset+999);
    if(error) throw error;
    result.push(...(data||[]));
    if(!data||data.length<1000) return result;
  }
  throw new Error(`Limite de paginação atingido em ${table}; nenhuma fala será descartada.`);
}
async function prepareAssembly(admin,assemblyId) {
  const {data:meeting,error:meetingError}=await admin.from('scheduled_assemblies')
    .select('id,cep,title,date,start_time,started_at,created_by,status,assembly_type').eq('id',assemblyId).maybeSingle();
  if(meetingError) throw meetingError;
  if(!meeting || meeting.status!=='encerrada') throw new Error('A assembleia precisa estar encerrada para gerar sua ATA.');
  const recordings=await allRows(admin,'assembly_recordings','id,status,transcription_status,transcription_model',assemblyId);
  if(!recordings.length || recordings.some(row=>row.status!=='concluido'||row.transcription_status!=='concluido'
    || !String(row.transcription_model||'').startsWith('deepgram:'))) throw new Error('Ainda há vídeos sem conclusão ou transcrição Deepgram.');
  const ids=recordings.map(row=>row.id);
  for(const recordingId of ids) {
    const fresh=await admin.rpc('condomit_auto_identify_deepgram_075',{target_recording_id:recordingId});
    if(fresh.error) throw new Error(`Não foi possível atualizar as identidades antes da ATA: ${fresh.error.message}`);
  }
  const rows=await allRows(admin,'assembly_transcripts',
    'id,recording_id,participant_email,participant_name,participant_role,participant_identity,spoken_at,start_seconds,end_seconds,transcript',assemblyId,
    q=>q.eq('transcript_source',SOURCE).in('recording_id',ids).order('spoken_at',{ascending:true}).order('id',{ascending:true}));
  if(!rows.length) throw new Error('Deepgram ainda não retornou falas completas.');
  const [agendaResult,pollsResult,votesResult,attendeesResult]=await Promise.all([
    allRows(admin,'assembly_agenda_items','id,title,description,display_order',assemblyId,q=>q.order('display_order',{ascending:true})),
    allRows(admin,'assembly_polls','id,title,description,status',assemblyId),
    allRows(admin,'assembly_votes','poll_id,option_id',assemblyId),
    allRows(admin,'assembly_attendance','participant_name,participant_role,user_email',assemblyId)
  ]);
  const pollIds=pollsResult.map(p=>p.id);
  let options=[];
  if(pollIds.length) {
    for(let idx=0;idx<pollIds.length;idx+=100) {
      const {data,error}=await admin.from('assembly_poll_options').select('id,poll_id,option_text').in('poll_id',pollIds.slice(idx,idx+100));
      if(error) throw error;
      options.push(...data);
    }
  }
  const {data:condominium,error:condoError}=await admin.from('condominiums')
    .select('cep,condominium_name,address,address_number,complement,neighborhood,city,state')
    .eq('cep',meeting.cep).maybeSingle();
  if(condoError) throw condoError;
  const topics=buildRawClaudeTopics(rows,agendaResult,pollsResult);
  verifyRawCoverage(rows,topics);
  return {meeting,rows,topics,options,votes:votesResult,attendees:attendeesResult,condominium,source_hash:sourceHash(rows)};
}
async function generateAutoMinutes(admin,assemblyId,onProgress=async()=>{}) {
  const source=await prepareAssembly(admin,assemblyId);
  const narrative=await summarizeClaude(source.topics,fetch,onProgress);
  const body=composeDraft({...source,narrative});
  return {body,source_hash:source.source_hash,source_count:source.rows.length,
    unidentified_speakers:source.rows.filter(row=>!recognizedName(row)).length};
}
module.exports={TABLE,adminClient,workerToken,isWorkerToken,chunksOfText,speaker,buildRawClaudeTopics,verifyRawCoverage,sourceHash,formalOpening,normalizeAgendaTitle,agendaParagraph,composeDraft,prepareAssembly,generateAutoMinutes};
