'use strict';
const {createClient} = require('@supabase/supabase-js');
const reply=(statusCode,obj)=>({statusCode,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},body:JSON.stringify(obj)});
const norm=v=>String(v||'').replace(/\D/g,'');
exports.handler=async event=>{
  if(event.httpMethod!=='POST')return reply(405,{error:'Método não permitido.'});
  try {
    const jwt=String(event.headers.authorization||event.headers.Authorization||'').replace(/^Bearer\s+/i,'');
    if(!jwt)return reply(401,{error:'Autenticação necessária.'});
    const assemblyId=Number(JSON.parse(event.body||'{}').assembly_id);
    if(!Number.isSafeInteger(assemblyId)||assemblyId<=0)return reply(400,{error:'Assembleia inválida.'});
    const admin=createClient(process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user},error:authError}=await admin.auth.getUser(jwt);
    if(authError||!user?.email)return reply(401,{error:'Sessão inválida.'});
    const email=user.email.toLowerCase();
    const [{data:assembly},{data:profile},{data:links}]=await Promise.all([
      admin.from('scheduled_assemblies').select('id,cep,status,ended_at').eq('id',assemblyId).maybeSingle(),
      admin.from('users').select('condominium').eq('email',email).maybeSingle(),
      admin.from('user_condominiums').select('condominium_id').eq('user_email',email)
    ]);
    if(!assembly)return reply(404,{error:'Assembleia não encontrada.'});
    let condo=profile?.condominium;
    if(typeof condo==='string'){try{condo=JSON.parse(condo);}catch(_){condo={};}}
    if(![...(links||[]).map(x=>x.condominium_id),condo?.cep,condo?.condominium_id].some(x=>norm(x)===norm(assembly.cep)))return reply(403,{error:'Você não pertence a este condomínio.'});
    const {data:records,error:recordError}=await admin.from('assembly_recordings')
      .select('id,status,recording_url,started_at')
      .eq('assembly_id',assemblyId).in('status',['gravando','pendente','falhou']).limit(50);
    if(recordError)throw recordError;
    const {data:files,error:listError}=await admin.storage.from('condomit-assembly-recordings').list(String(assemblyId),{limit:100});
    if(listError)throw listError;
    let updated=0;
    for(const row of records){
      const match=String(row.recording_url||'').match(/^storage:\/\/condomit-assembly-recordings\/([^/]+)\/(.+)$/);
      if(!match||Number(match[1])!==assemblyId)continue;
      const expected=match[2];
      const file=(files||[]).find(x=>x.name===expected);
      const size=Number(file?.metadata?.size||file?.metadata?.contentLength||0);
      if(!file || size<=8192)continue;
      // A lista de objetos finalizados não implica o fim da sessão ativa.
      if (assembly.status === 'em_andamento' && ['pendente','gravando'].includes(row.status)) continue;
      const {error:updateError}=await admin.from('assembly_recordings')
        .update({status:'concluido',file_size_bytes:size,ended_at:file.updated_at||new Date().toISOString()})
        .eq('id',row.id).in('status',['gravando','pendente','falhou']);
      if(!updateError)updated++;
    }
    // Se o webhook terminou sem criar uma linha, vincular somente vídeos comprovados
    // no bucket da assembleia e somente após o encerramento da reunião.
    if (assembly.status === 'encerrada') {
      const {data:allRows,error:allError}=await admin.from('assembly_recordings')
        .select('id,recording_url').eq('assembly_id',assemblyId).limit(500);
      if(allError)throw allError;
      const existing=new Set((allRows||[]).map(row=>String(row.recording_url||'')));
      for(const file of files||[]) {
        if(!/\.(mp4|webm)$/i.test(String(file.name||'')))continue;
        const size=Number(file.metadata?.size||file.metadata?.contentLength||0);
        if(!Number.isFinite(size)||size<=8192)continue;
        const url=`storage://condomit-assembly-recordings/${assemblyId}/${file.name}`;
        if(existing.has(url))continue;
        const timestamp=file.created_at||file.updated_at||new Date().toISOString();
        const {error:insertError}=await admin.from('assembly_recordings').insert({
          assembly_id:assemblyId,cep:assembly.cep,recording_url:url,
          recording_type:'room_composite',status:'concluido',
          file_size_bytes:size,started_at:timestamp,ended_at:file.updated_at||timestamp,
          started_by:email
        });
        if(insertError){console.error('[ASSEMBLY RECONCILE] Arquivo não vinculado:',insertError);continue;}
        existing.add(url); updated++;
      }
    }
    return reply(200,{ok:true,updated});
  }catch(error){console.error('[ASSEMBLY RECORDING RECONCILE]',error);return reply(500,{error:'Não foi possível conferir o Storage da gravação.'});}
};
