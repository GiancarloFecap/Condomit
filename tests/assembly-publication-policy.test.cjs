'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const sql = readFileSync(require('node:path').join(__dirname, '../supabase/migrations/065_assembly_publishing_and_auto_speakers.sql'),'utf8');

test('exige revisão aprovada e assinatura posterior para liberar detalhes', () => {
  assert.match(sql, /d\.status\s*=\s*'aprovada'/);
  assert.match(sql, /s\.signed_at\s*>=\s*d\.approved_at/);
  assert.match(sql, /meeting_status NOT IN/);
});

test('inclui política restritiva de leitura para gravações, ata, votos e storage', () => {
  for (const table of ['assembly_recordings','assembly_minutes_drafts','assembly_transcripts','assembly_votes','assembly_poll_options']) {
    assert.match(sql,new RegExp(table));
  }
  assert.match(sql,/AS RESTRICTIVE FOR SELECT TO PUBLIC/);
  assert.match(sql,/condomit-assembly-recordings/);
  assert.match(sql,/condomit-assembly-documents/);
});

test('identificação automática não substitui atribuição revisada', () => {
  assert.match(sql,/assignment_source\s*<>\s*'reviewed'/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.condomit_auto_identify_deepgram_065\(BIGINT\) TO service_role/);
});
