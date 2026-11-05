'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const original = Module._load;
Module._load = function(name, ...rest) {
  if (name === '@supabase/supabase-js') return { createClient: () => ({}) };
  return original.call(this, name, ...rest);
};
const { promptFor, parseModelResult, handler } = require('../netlify/functions/assembly-minutes-indirect');
Module._load = original;

const sample = [{ id:1, recording_id:8, start_seconds:0, end_seconds:4,
  spoken_at:'2026-11-05T12:48:37Z', participant_name:'Maria Oliveira',
  participant_email:'maria@example.com',participant_identity:'__deepgram_speaker__:0',
  transcript:'Quero falar sobre a manutenção dos elevadores, estamos com problemas.' }];

test('prompt exige síntese em terceira pessoa e proíbe transcrição literal', () => {
  const prompt = promptFor(sample,[{title:'Elevadores'}]);
  assert.match(prompt,/DISCURSO INDIRETO/);
  assert.match(prompt,/Maria Oliveira:/);
  assert.match(prompt,/Não copie frases literalmente/);
  assert.match(prompt,/manutenção dos elevadores/);
});

test('extrai parágrafos estruturados, sem horário ou falante genérico', () => {
  const json = {candidates:[{content:{parts:[{text:JSON.stringify({paragrafos:[
    'Maria Oliveira relatou problemas recorrentes nos elevadores e solicitou avaliação da manutenção.',
    'Às 09:48:37, Falante 1 declarou que havia uma proposta de obra.'
  ]})}]}}]};
  const result = parseModelResult(json);
  assert.equal(result.length,1);
  assert.match(result[0],/^Maria Oliveira relatou/);
});

test('sem sessão não retorna nenhum dado da assembleia', async () => {
  const result = await handler({httpMethod:'POST',headers:{},body:JSON.stringify({assembly_id:20})});
  assert.equal(result.statusCode,400);
});
