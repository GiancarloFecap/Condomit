'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function(request, ...rest) {
  if (request === '@supabase/supabase-js') return { createClient: () => ({}) };
  return originalLoad.call(this, request, ...rest);
};
const { parseSegments } = require('../netlify/functions/lib/assembly-deepgram.js');
Module._load = originalLoad;

test('não atribui a fala inteira ao primeiro participante quando a mudança ocorre dentro da utterance', () => {
  const segments = parseSegments({results: {utterances: [{
    start: 1.0, end: 3.9, speaker: 0, transcript: 'O orçamento está aprovado? Ainda não, gostaria de explicar.',
    words: [
      {start: 1.0, end: 1.2, speaker: 0, punctuated_word: 'O'},
      {start: 1.2, end: 1.65, speaker: 0, punctuated_word: 'orçamento'},
      {start: 1.7, end: 1.95, speaker: 0, punctuated_word: 'está'},
      {start: 2, end: 2.25, speaker: 0, punctuated_word: 'aprovado?'},
      {start: 2.33, end: 2.56, speaker: 1, punctuated_word: 'Ainda'},
      {start: 2.56, end: 2.7, speaker: 1, punctuated_word: 'não,'},
      {start: 2.72, end: 3.1, speaker: 1, punctuated_word: 'gostaria'},
      {start: 3.12, end: 3.23, speaker: 1, punctuated_word: 'de'},
      {start: 3.23, end: 3.9, speaker: 1, punctuated_word: 'explicar.'}
    ]
  }]}});
  assert.deepEqual(segments.map(row=>row.speaker), [0,1]);
  assert.deepEqual(segments.map(row=>row.text), ['O orçamento está aprovado?', 'Ainda não, gostaria de explicar.']);
  assert.equal(segments[0].end, 2.25);
  assert.equal(segments[1].start, 2.33);
});

test('palavra sem diarização na troca de voz não é atribuída automaticamente ao primeiro falante', () => {
  const segments = parseSegments({results: {utterances: [{speaker:0, transcript: 'Sim, mas eu discordo.', words: [
    {start:0,end:.2,speaker:0,punctuated_word:'Sim,'},
    {start:.25,end:.5,punctuated_word:'mas'},
    {start:.52,end:.75,speaker:1,punctuated_word:'eu'},
    {start:.8,end:1.3,speaker:1,punctuated_word:'discordo.'}
  ]}]}});
  assert.deepEqual(segments.map(row=>row.speaker), [0,null,1]);
  assert.equal(segments[0].text, 'Sim,');
  assert.equal(segments[1].text, 'mas');
  assert.equal(segments[2].text, 'eu discordo.');
});

test('concatena frases da mesma voz sem puxar a primeira palavra de outra', () => {
  const segments = parseSegments({results: {utterances: [
    {start:0,end:2,speaker:0,words:[{start:0,end:1,speaker:0,punctuated_word:'Concordo'},{start:1,end:2,speaker:1,punctuated_word:'Entretanto,'}]},
    {start:2.1,end:4,speaker:1,words:[{start:2.1,end:2.7,speaker:1,punctuated_word:'precisamos'},{start:2.8,end:4,speaker:1,punctuated_word:'votar.'}]}
  ]}});
  assert.deepEqual(segments.map(row=>row.speaker),[0,1]);
  assert.equal(segments[0].text,'Concordo');
  assert.equal(segments[1].text,'Entretanto, precisamos votar.');
});

test('fallback de palavras também interrompe no momento exato da troca de usuário', () => {
  const segments = parseSegments({results:{channels:[{alternatives:[{words:[
    {start:0,end:.4,punctuated_word:'Primeiro.',speaker:0},
    {start:.5,end:.9,punctuated_word:'Segundo.',speaker:1}
  ]}]}]}});
  assert.deepEqual(segments.map(row=>row.text), ['Primeiro.','Segundo.']);
  assert.deepEqual(segments.map(row=>row.speaker),[0,1]);
});
