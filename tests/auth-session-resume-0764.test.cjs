'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(base,f),'utf8');
test('sem lembrar de mim, landing não retoma conta automaticamente',()=>{
 const s=read('scripts/session-resume.js');
 assert.match(s,/options\.redirect === true/);
 assert.match(s,/localStorage\.getItem\('condomitRememberMe'\) === '1'/);
 assert.match(s,/rememberRequired:true/);
});
test('sessão autenticada renova token e repete uma requisição com 401 apenas uma vez',()=>{
 const s=read('scripts/supabase-client.js');
 assert.match(s,/response\.status === 401 && accessToken/);
 assert.match(s,/refreshSupabaseAccessToken\(\)/);
 assert.match(s,/refreshed !== accessToken/);
});
test('páginas que usam cliente Supabase carregam auth responsável pelo refresh',()=>{
 for (const html of fs.readdirSync(path.join(base,'pages')).filter(n=>n.endsWith('.html'))) {
  const content=read('pages/'+html);
  if (content.includes('supabase-client.js')) assert.match(content,/supabase-auth\.js/,html);
 }
});
