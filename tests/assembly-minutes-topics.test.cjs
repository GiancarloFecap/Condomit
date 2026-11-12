'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {buildTopics,removeHesitations,speakerPrefix} = require('../scripts/assembly/minutes-topics');
const narrative = require('../scripts/assembly/minutes-narrative');
const make = (id,text,voice,name,role,start) => ({
  id,transcript:text,participant_name:name,participant_role:role,participant_email:`${name.toLowerCase()}@exemplo.com`,
  participant_identity:`__deepgram_speaker__:${voice}`,recording_id:2,
  spoken_at:new Date(Date.UTC(2026,10,5,10,0,start)).toISOString(),start_seconds:start,end_seconds:start+2
});
const rows=[
  make(1,'Ééé, sobre a reforma da piscina, estamos com problemas.',0,'Maria','moradora',0),
  make(2,'A piscina precisa de reforma com orçamento de 25000 reais.',0,'Maria','moradora',3),
  make(3,'O elevador social precisa de manutenção.',1,'João','sindico',7),
  make(4,'A reforma da piscina deveria ser submetida a votação.',2,'Felipe','morador',12)
];
test('infere pauta quando ausente e anexa votação ao assunto da piscina',()=>{
  const topics=buildTopics({rows,agenda:[],polls:[{id:99,title:'Reforma da piscina',description:''}]});
  const pool=topics.find(t=>/piscina/i.test(t.title));
  assert.ok(pool);
  assert.equal(pool.registered,false);
  assert.deepEqual(pool.polls.map(p=>p.id),[99]);
  assert.ok(pool.contributions.some(p=>p.name==='Maria'));
  assert.ok(pool.contributions.some(p=>p.name==='Felipe'));
  const elevators=topics.find(t=>/elevadores/i.test(t.title));
  assert.ok(elevators);
  assert.equal(elevators.polls.length,0);
});
test('quando pauta está cadastrada, associa falas ao seu cadastro e não duplica',()=>{
  const topics=buildTopics({rows,agenda:[{id:21,title:'Reforma da piscina'},{id:22,title:'Manutenção dos elevadores'}],polls:[{id:99,title:'Reforma da piscina'}]});
  assert.equal(topics.length,2);
  assert.equal(topics[0].id,'agenda-21');
  assert.equal(topics[0].polls[0].id,99);
});
test('inclui nome e cargo sem inventar a identidade',()=>{
  assert.equal(speakerPrefix({name:'João',role:'sindico'}),'O síndico João');
  assert.equal(speakerPrefix({name:'Maria',role:'moradora'}),'A moradora Maria');
  assert.equal(speakerPrefix({name:'Maria',role:''}),'O participante Maria');
  assert.equal(speakerPrefix({name:'',role:'morador'}),'O participante ainda não identificado');
});
test('remove hesitações sem apagar quantias ou frases substantivas',()=>{
  assert.equal(removeHesitations('Ééé, ou seja, a piscina custou 25000 reais, né.'),'a piscina custou 25000 reais.');
  const x=narrative.paragraphForGroup({text:'Ééé, a manutenção do elevador tem orçamento de 8500 reais.',participant_name:'João',participant_role:'sindico',participant_email:'j@exemplo.com'});
  assert.match(x,/^O síndico João /);
  assert.match(x,/R\$ 8\.500,00/);
  assert.doesNotMatch(x,/ééé|ou seja|falante 1|\d{2}:\d{2}/i);
});
test('ATA nova não exige títulos históricos; remove-os de uma ata antiga',()=>{
  const body='Abertura.\n\nMANIFESTAÇÕES DOS PARTICIPANTES\n\nO síndico João relatou os problemas de manutenção dos elevadores e discutiu a proposta de substituição dos componentes.\n\nDELIBERAÇÕES E VOTAÇÕES\n\nA votação da matéria contou com dois votos favoráveis.\n\nEncerramento.';
  const stripped=narrative.stripLegacyHeadings(body);
  assert.ok(narrative.hasNarrative(stripped));
  assert.doesNotMatch(stripped,/MANIFESTAÇÕES DOS PARTICIPANTES|DELIBERAÇÕES E VOTAÇÕES/);
  const file=fs.readFileSync(path.join(__dirname,'../scripts/assembly/assembly-summary.js'),'utf8');
  assert.match(file,/buildFormalTopicParagraphs\(\)/);
  assert.match(file,/stripLegacyHeadings\(rawDisplayText\)/);
  assert.doesNotMatch(file,/paragraphs\.push\('MANIFESTAÇÕES DOS PARTICIPANTES'\)/);
});
test('SQL da v0.76.4 substitui regra que obrigava os dois cabeçalhos',()=>{
  const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/068_assembly_minutes_topics_without_fixed_headings.sql'),'utf8');
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.condomit_check_official_minutes_speech_067/);
  assert.match(sql,/NEW\.status IS DISTINCT FROM 'aprovada'/);
  assert.match(sql,/Há manifestações atribuídas/);
});
