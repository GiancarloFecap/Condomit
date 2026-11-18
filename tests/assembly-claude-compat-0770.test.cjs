'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {requestClaudeMinutes,modelName} = require('../netlify/functions/lib/assembly-claude-minutes');
const goodPayload = {stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({assuntos:[{id:'t',paragrafos:['O morador João explicou os problemas na piscina.']}]})}]};
for (const model of ['claude-sonnet-5','claude-sonnet-5-5']) {
  test(`Claude ${model} usa payload compatível (sem temperature/top_p/top_k)`,async()=>{
    let input;
    const fetcher = async (url,opts) => {
      assert.equal(url,'https://api.anthropic.com/v1/messages');
      input=JSON.parse(opts.body);
      assert.equal(opts.headers['x-api-key'],'secret');
      return {ok:true,json:async()=>goodPayload};
    };
    const result=await requestClaudeMinutes('ATA',{apiKey:'secret',model,fetcher});
    assert.equal(input.model,model);
    assert.equal(Object.hasOwn(input,'temperature'),false);
    assert.equal(Object.hasOwn(input,'top_p'),false);
    assert.equal(Object.hasOwn(input,'top_k'),false);
    assert.equal(input.max_tokens,7500);
    assert.equal(result.assuntos[0].id,'t');
  });
}
test('o modelo padrão é um ID oficial e válido',()=>{ assert.equal(modelName(), 'claude-sonnet-5-5'); });
test('400 por amostragem informa a incompatibilidade e não expõe o texto da API',async()=>{
  const fetcher=async()=>({ok:false,status:400,headers:{get:()=> 'req-test'},json:async()=>({error:{type:'invalid_request_error',message:'temperature: not supported for this model, SECRET'},request_id:'req-test'})});
  const previous=console.error; console.error=()=>{};
  try { await assert.rejects(requestClaudeMinutes('dados',{apiKey:'key',fetcher}),err=>err.message.includes('parâmetros de amostragem')&&!err.message.includes('SECRET')); } finally { console.error=previous; }
});
test('400 por nome de modelo orienta a conferir somente a variável pertinente',async()=>{
  const fetcher=async()=>({ok:false,status:400,json:async()=>({error:{type:'invalid_request_error',message:'model: claude-unknown not found'}})});
  const previous=console.error; console.error=()=>{};
  try { await assert.rejects(requestClaudeMinutes('ATA',{apiKey:'key',fetcher}),/CLAUDE_MINUTES_MODEL/); } finally { console.error=previous; }
});
test('erros de créditos são distintos de erros de modelo',async()=>{
  const fetcher=async()=>({ok:false,status:400,json:async()=>({error:{type:'invalid_request_error',message:'insufficient credits on your account'}})});
  const previous=console.error; console.error=()=>{};
  try { await assert.rejects(requestClaudeMinutes('ATA',{apiKey:'key',fetcher}),/Créditos/); } finally { console.error=previous; }
});
