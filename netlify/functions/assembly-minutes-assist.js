'use strict';
const {createClient} = require('@supabase/supabase-js');
const response = (statusCode, value) => ({statusCode,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS'},body:JSON.stringify(value)});
const cep = value => String(value || '').replace(/\D/g,'');
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return response(200,{});
  if (event.httpMethod !== 'POST') return response(405,{error:'Método não permitido.'});
  try {
    const token = String(event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i,'');
    const id = Number(JSON.parse(event.body || '{}').assembly_id);
    if (!token || !Number.isSafeInteger(id) || id < 1) return response(400,{error:'Sessão ou assembleia inválida.'});
    const supabase = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data: auth, error: authErr} = await supabase.auth.getUser(token);
    if (authErr || !auth?.user?.email) return response(401,{error:'Usuário não autenticado.'});
    const email = auth.user.email.toLowerCase();
    const [{data:assembly}, {data:links}, {data:user}] = await Promise.all([
      supabase.from('scheduled_assemblies').select('id,cep,status,created_by').eq('id',id).maybeSingle(),
      supabase.from('user_condominiums').select('condominium_id').eq('user_email',email),
      supabase.from('users').select('email,user_type,condominium').eq('email',email).maybeSingle()
    ]);
    if (!assembly || !user || !['sindico','síndico','admin'].includes(String(user.user_type||'').toLowerCase())) return response(403,{error:'Apenas o síndico pode solicitar sugestões para esta assembleia.'});
    const memberships = (links || []).map(row => cep(row.condominium_id));
    let userCondo = user.condominium;
    if (typeof userCondo === 'string') {try { userCondo=JSON.parse(userCondo); }catch(_){userCondo=null;}}
    memberships.push(cep(userCondo?.cep),cep(userCondo?.condominium_id));
    if (!memberships.includes(cep(assembly.cep))) return response(403,{error:'A assembleia não pertence ao condomínio do usuário.'});
    const {data: transcripts, error: transcriptError} = await supabase.from('assembly_transcripts').select('id,transcript,participant_name,spoken_at,confidence').eq('assembly_id',id).order('spoken_at',{ascending:true}).limit(180);
    if (transcriptError) throw transcriptError;
    const items = (transcripts || []).filter(item=>String(item.transcript||'').trim().length>8).map(item=>({id:item.id,name:String(item.participant_name||'Participante').slice(0,90),text:String(item.transcript).slice(0,450),confidence:item.confidence}));
    if (!items.length) return response(200,{warning:'Não foram encontradas transcrições úteis para revisão. Consulte a gravação original.',suggestions:[]});
    const stopwords = new Set('para como seja ainda muito menos mais sobre desta deste daquele aquela falou disse vamos temos somos vocês deles delas neste nessa nesse entre nosso nossa vocês foi foram aqui agora então isso aquilo apenas mesma mesmo onde porque quando também todos todas essas esses pelo pela pelos pelas está estão será serão essa esse isso uma uns umas com sem aos nas nos por que não sim hoje gente pessoal obrigado obrigada'.split(' '));
    const scoreText = (value) => {
      const words = String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z]{4,}/g) || [];
      return words.filter(word => !stopwords.has(word));
    };
    const pool = items.map(item => {
      const text = String(item.text || '').replace(/\s+/g,' ').trim();
      const words = scoreText(text);
      const unique = [...new Set(words)];
      const signals = /or[çc]ament|reforma|manuten[çc][aã]o|prazo|proposta|seguran[çc]a|aprova|despesa|receita|prestador|reserva|cot[ae]|servi[çc]o|obra|condom[ií]ni|assembleia|contrato|pauta/i.test(text) ? 3 : 0;
      return {id:item.id, name:item.name,text,words:unique,score:unique.length+signals};
    }).filter(item=>item.words.length>=3 && item.text.length>=25);
    pool.sort((a,b)=>b.score-a.score);
    const selected = [];
    for (const item of pool) {
      if (selected.length >= 8) break;
      const duplicate = selected.some(other => {
        const intersection = item.words.filter(word => other.words.includes(word)).length;
        return intersection / Math.max(1,Math.min(item.words.length,other.words.length)) >= 0.7;
      });
      if (!duplicate) selected.push(item);
    }
    selected.sort((a,b) => items.findIndex(x=>String(x.id)===String(a.id)) - items.findIndex(x=>String(x.id)===String(b.id)));
    const suggestions = selected.map(item=>({
      text:`Trecho para conferência (${item.name}): “${item.text}”`,
      sources:[String(item.id)]
    }));
    return response(200,{
      method:'extractive_local_rules',
      warning:`Seleção objetiva de ${suggestions.length} trecho(s) entre ${items.length} transcrições, sem API paga de IA. São falas extraídas dos registros, não deliberações nem uma ata pronta. Confira as fontes e os resultados das votações antes de redigir ou aprovar.`,
      suggestions
    });
  } catch(error){ console.error('[MINUTES AI]',error);return response(500,{error:'Falha ao gerar sugestões para a ata. Tente novamente após conferir a transcrição.'}); }
};
