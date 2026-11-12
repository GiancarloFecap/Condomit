'use strict';

const { createClient } = require('@supabase/supabase-js');
const { groupRows, recognizedName, clean } = require('../../scripts/assembly/minutes-speech');
const { fallbackParagraphs } = require('../../scripts/assembly/minutes-narrative');

const send = (statusCode, value) => ({
  statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  body: JSON.stringify(value)
});
const cep = value => String(value || '').replace(/\D/g, '');

function promptFor(rows, agenda) {
  const conversations = groupRows(rows).filter(group => clean(group.text).length > 2);
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
- Preserve o conteúdo substantivo de cada intervenção e não elimine propostas, críticas, valores, resultados e responsabilidades. Se houver diversos participantes, registre a contribuição de cada um sem confundir os autores.
- Registre valores monetários somente se informados e mantenha o número exato.
- Não confunda a palavra "vamos votar" com uma votação efetivamente realizada.
- Cada parágrafo terá 1 a 3 frases, em discurso indireto, com até 1000 caracteres. Não omita uma manifestação substantiva apenas para reduzir o número de parágrafos.
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
    .filter(x => x.length >= 30 && !/\d{1,2}:\d{2}|falante\s*\d+\s*declarou/i.test(x));
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
    const {data:videos,error:videosError} = await admin.from('assembly_recordings')
      .select('id').eq('assembly_id',id).eq('status','concluido')
      .eq('transcription_model','deepgram:nova-3');
    if (videosError) throw videosError;
    const ids = (videos || []).map(row => row.id);
    if (!ids.length) return send(409,{error:'Ainda não há uma gravação processada pelo Deepgram para elaborar a síntese.'});
    const transcriptRows = [];
    for (let offset = 0; offset < 10000; offset += 1000) {
      const page = await admin.from('assembly_transcripts')
        .select('id,recording_id,participant_email,participant_name,participant_identity,spoken_at,start_seconds,end_seconds,transcript')
        .eq('assembly_id',id).eq('transcript_source','recording_video_deepgram').in('recording_id',ids)
        .order('spoken_at',{ascending:true}).order('id',{ascending:true})
        .range(offset, offset+999);
      if (page.error) throw page.error;
      transcriptRows.push(...(page.data || []));
      if (!page.data || page.data.length < 1000) break;
    }
    const agenda = await admin.from('assembly_agenda_items').select('title')
      .eq('assembly_id',id).order('display_order',{ascending:true}).limit(50);
    if (agenda.error) throw agenda.error;
    if (!transcriptRows.length) return send(409,{error:'Ainda não há falas transcritas para incluir na ata. Aguarde o processamento ou confira a gravação.'});
    const localParagraphs = fallbackParagraphs(transcriptRows);
    if (!localParagraphs.length) return send(409,{error:'A transcrição não contém manifestações úteis para a ata. Confira a gravação.'});
    let paragraphs = localParagraphs;
    let method = 'regras_locais_discurso_indireto';
    let warning = 'Resumo provisório construído com regras locais. Revise as frases e a atribuição das falas com a gravação antes de aprovar.';
    const prompt = promptFor(transcriptRows, agenda.data);
    if (prompt.length <= 55000) {
      try {
        const summary = await summarizeText(prompt);
        if (summary?.paragraphs?.length) {
          paragraphs = summary.paragraphs;
          method = summary.method;
          warning = 'Síntese por IA: confira nomes, valores, manifestações e decisões com a gravação.';
          // Assegurar que nenhum falante identificado desapareça do documento final.
          const generated = paragraphs.join(' ').toLocaleLowerCase('pt-BR');
          for (const group of groupRows(transcriptRows)) {
            const name = recognizedName(group);
            if (!name || generated.includes(name.toLocaleLowerCase('pt-BR'))) continue;
            const missing = fallbackParagraphs([{
              id: group.source_ids[0], recording_id: group.recordingId,
              start_seconds: group.start_seconds, end_seconds: group.end_seconds,
              spoken_at: group.spoken_at, participant_name: group.participant_name,
              participant_email: group.participant_email,
              participant_identity: `__deepgram_speaker__:${group.speakerIndex ?? 0}`,
              transcript: group.text
            }]);
            if (missing[0] && !paragraphs.includes(missing[0])) paragraphs.push(missing[0]);
          }
        }
      } catch (summaryError) {
        console.warn('[ASSEMBLY INDIRECT MINUTES] Resumo por IA indisponível; usando regras locais:', String(summaryError.message || summaryError).slice(0,150));
      }
    } else {
      warning = 'As falas desta assembleia ultrapassam o limite de síntese por IA; foi utilizada uma redação provisória local de todas as manifestações. Revise antes de aprovar.';
    }
    return send(200,{paragraphs,method,requires_review:true,source_count:transcriptRows.length,warning});
  } catch(error) {
    console.error('[ASSEMBLY INDIRECT MINUTES]',String(error?.message||error).slice(0,220));
    return send(502,{error:'Não foi possível gerar o resumo em discurso indireto. Revise a gravação ou tente novamente.'});
  }
}
exports.handler = handler;
exports.promptFor = promptFor;
exports.parseModelResult = parseModelResult;
