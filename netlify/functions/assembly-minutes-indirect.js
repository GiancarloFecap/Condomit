'use strict';

const { createClient } = require('@supabase/supabase-js');
const { groupRows, recognizedName, clean } = require('../../scripts/assembly/minutes-speech');

const send = (statusCode, value) => ({
  statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  body: JSON.stringify(value)
});
const cep = value => String(value || '').replace(/\D/g, '');

function promptFor(rows, agenda) {
  const conversations = groupRows(rows).filter(group => clean(group.text).length > 2).slice(0, 250);
  const transcript = conversations.map(group => {
    const name = recognizedName(group) || 'Participante não identificado';
    return `${name}: ${clean(group.text).slice(0, 5000)}`;
  }).join('\n');
  return `Você é responsável por redigir apenas a SÍNTESE das manifestações de uma assembleia condominial brasileira.
Produza um resumo em português do Brasil e em DISCURSO INDIRETO (terceira pessoa), com linguagem formal, concisa e clara.
Exemplos do estilo: "A moradora Maria apresentou preocupações sobre a manutenção dos elevadores e solicitou esclarecimentos sobre os custos previstos." e "O síndico esclareceu que a proposta seria submetida à votação.".
Regras inegociáveis:
- Não copie frases literalmente, não use aspas e NÃO reproduza a transcrição palavra por palavra.
- Não inclua horas, minutos, marcadores de fala ou expressões "Falante 1 declarou".
- Atribua declarações somente aos nomes fornecidos. Se desconhecidos, use "Um participante".
- Não invente nomes, fatos, votos, decisões, valores ou compromissos. Distingua proposta, discussão e deliberação.
- Agrupe falas fragmentadas por assunto. Remova hesitações, repetições, cumprimentos e material secundário.
- Registre valores monetários somente se informados e mantenha o número exato.
- Não confunda a palavra "vamos votar" com uma votação efetivamente realizada.
- Cada parágrafo terá 1 a 3 frases, em discurso indireto, com até 1000 caracteres.
- Responda APENAS com JSON válido: {"paragrafos":["parágrafo 1", "parágrafo 2"]}.
PAUTAS (contexto, não são deliberações): ${JSON.stringify((agenda || []).map(x => clean(x.title || '')).filter(Boolean).slice(0, 40))}
TRANSCRIÇÃO PARA SÍNTESE:
${transcript}`;
}

function parseModelResult(response) {
  const text = response?.candidates?.[0]?.content?.parts?.map(x => x.text || '').join('') || '';
  const raw = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  const data = JSON.parse(raw);
  if (!Array.isArray(data?.paragrafos)) throw new Error('Modelo não retornou parágrafos válidos.');
  const paragraphs = data.paragrafos.filter(x => typeof x === 'string')
    .map(x => clean(x).replace(/[“”"«»]/g, ''))
    .filter(x => x.length >= 30 && x.length <= 1000 && !/\d{1,2}:\d{2}|falante\s*\d+\s*declarou/i.test(x)).slice(0, 25);
  if (!paragraphs.length) throw new Error('Nenhuma síntese válida foi produzida.');
  return paragraphs;
}

async function callGemini(prompt, fetcher = fetch) {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;
  const model = String(process.env.MINUTES_SUMMARY_GEMINI_MODEL || 'gemini-2.5-flash').trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw new Error('Modelo de IA configurado incorretamente.');
  const result = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'Content-Type':'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ contents: [{ role:'user',parts:[{text:prompt}]}],
      generationConfig: { temperature:0.15, responseMimeType:'application/json',maxOutputTokens:3500 } }),
    signal: AbortSignal.timeout(26000)
  });
  if (!result.ok) throw new Error(`Serviço de redação da ata indisponível (HTTP ${result.status}).`);
  return parseModelResult(await result.json());
}

async function callOpenAI(prompt, fetcher = fetch) {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) return null;
  const model = String(process.env.MINUTES_SUMMARY_OPENAI_MODEL || 'gpt-4.1-mini').trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw new Error('Modelo de IA configurado incorretamente.');
  const result = await fetcher('https://api.openai.com/v1/chat/completions', {
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},
    body:JSON.stringify({ model, temperature:0.15, max_completion_tokens:3500,
      response_format:{type:'json_object'}, messages:[{role:'user',content:prompt}] }),
    signal:AbortSignal.timeout(26000)
  });
  if (!result.ok) throw new Error(`Serviço alternativo de redação indisponível (HTTP ${result.status}).`);
  const data=await result.json();
  return parseModelResult({candidates:[{content:{parts:[{text:data?.choices?.[0]?.message?.content||''}]}}]});
}

async function summarizeText(prompt) {
  let lastError = null;
  if (process.env.GEMINI_API_KEY) {
    try { return { paragraphs:await callGemini(prompt),method:'gemini_indirect_speech' }; }
    catch (err) { lastError = err; }
  }
  if (process.env.OPENAI_API_KEY) {
    try { return { paragraphs:await callOpenAI(prompt),method:'openai_indirect_speech' }; }
    catch (err) { lastError = err; }
  }
  if (lastError) throw lastError;
  return null;
}

async function handler(event) {
  if (event.httpMethod !== 'POST') return send(405, { error:'Método não permitido.' });
  try {
    const token = String(event.headers?.authorization || event.headers?.Authorization || '').replace(/^Bearer\s+/i,'').trim();
    const id = Number(JSON.parse(event.body || '{}').assembly_id);
    if (!token || !Number.isSafeInteger(id) || id <= 0) return send(400,{error:'Sessão ou assembleia inválida.'});
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) return send(503,{error:'Serviço de assembleias não configurado.'});
    const admin = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:authData,error:authError} = await admin.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user?.email) return send(401,{error:'Sessão expirada.'});
    const email = user.email.toLowerCase();
    const [{data:account}, {data:links}, {data:meeting}] = await Promise.all([
      admin.from('users').select('email,user_type,condominium').ilike('email', email).maybeSingle(),
      admin.from('user_condominiums').select('condominium_id').ilike('user_email', email),
      admin.from('scheduled_assemblies').select('id,cep,status').eq('id',id).maybeSingle()
    ]);
    if (!account || !meeting || !['sindico','síndico','admin'].includes(String(account.user_type||'').toLowerCase())) {
      return send(403,{error:'Somente o síndico responsável pode gerar a minuta.'});
    }
    let condo = account.condominium;
    if (typeof condo === 'string') { try { condo=JSON.parse(condo); } catch (_) { condo={}; } }
    const allowed = [...(links || []).map(x => cep(x.condominium_id)), cep(condo?.cep), cep(condo?.condominium_id)]
      .some(x => x.length === 8 && x === cep(meeting.cep));
    if (!allowed) return send(403,{error:'Assembleia de outro condomínio.'});
    if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) return send(503,{error:'Configure GEMINI_API_KEY ou OPENAI_API_KEY na Netlify para gerar a síntese narrativa em português. Deepgram continua responsável pela transcrição.'});
    const {data:videos,error:videosError} = await admin.from('assembly_recordings')
      .select('id').eq('assembly_id',id).eq('status','concluido')
      .eq('transcription_status','concluido').eq('transcription_model','deepgram:nova-3');
    if (videosError) throw videosError;
    const ids = (videos || []).map(row => row.id);
    if (!ids.length) return send(409,{error:'Aguarde a transcrição Deepgram da gravação para elaborar a síntese.'});
    const [transcripts, agenda] = await Promise.all([
      admin.from('assembly_transcripts').select('id,recording_id,participant_email,participant_name,participant_identity,spoken_at,start_seconds,end_seconds,transcript')
        .eq('assembly_id',id).eq('transcript_source','recording_video_deepgram').in('recording_id',ids)
        .order('spoken_at',{ascending:true}).limit(1200),
      admin.from('assembly_agenda_items').select('title').eq('assembly_id',id).order('display_order',{ascending:true}).limit(50)
    ]);
    if (transcripts.error || agenda.error) throw transcripts.error || agenda.error;
    if (!(transcripts.data || []).length) return send(409,{error:'A transcrição ainda não possui falas utilizáveis.'});
    if (transcripts.data.length >= 1200) return send(413,{error:'Esta transcrição é extensa demais para uma síntese única. Gere uma versão por partes para evitar omissões.'});
    const text = promptFor(transcripts.data,agenda.data);
    if (text.length > 80000) return send(413,{error:'Esta transcrição é extensa demais para uma síntese única. Faça a revisão por blocos para evitar omissões.'});
    const summary = await summarizeText(text);
    return send(200,{paragraphs:summary.paragraphs,method:summary.method,requires_review:true});
  } catch(error) {
    console.error('[ASSEMBLY INDIRECT MINUTES]',String(error?.message||error).slice(0,220));
    return send(502,{error:'Não foi possível gerar o resumo em discurso indireto. Revise a gravação ou tente novamente.'});
  }
}
exports.handler = handler;
exports.promptFor = promptFor;
exports.parseModelResult = parseModelResult;
