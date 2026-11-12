'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const describe = require('../netlify/functions/lib/assembly-upload-progress').describeUpload;
const browser = require('../scripts/assembly/upload-progress');
const {normalizeS3Endpoint} = require('../netlify/functions/lib/assembly-s3-endpoint');

test('LiveKit Egress não informa bytes transferidos e por isso não mostra percentuais inventados', () => {
    for (const remote of ['EGRESS_STARTING','EGRESS_ACTIVE','EGRESS_ENDING','EGRESS_COMPLETE']) {
        const state = describe({status:'gravando'}, remote, false);
        assert.equal(state.percent, null);
        assert.equal(browser.view({status:'gravando',verification:{upload_progress:state}}).percent, null);
    }
});
test('apenas arquivo validado no Storage é exibido como 100%', () => {
    const record={status:'concluido',file_size_bytes:2097152};
    assert.equal(describe(record,'EGRESS_COMPLETE',false).percent,null);
    assert.equal(describe(record,'EGRESS_COMPLETE',true).percent,100);
    assert.equal(browser.view({status:'concluido'}).percent,100);
});
test('progressão exata em bytes de recuperação, sem 100% antes do arquivo', () => {
    const recovery={recovery_status:'processando',recovery_uploaded_bytes:5242880,recovery_total_bytes:10485760};
    const progress=describe({status:'falhou'},'EGRESS_FAILED',false,recovery);
    assert.equal(progress.stage,'recuperando');
    assert.equal(progress.percent,50);
    assert.equal(progress.uploaded_bytes,5242880);
    assert.equal(describe({status:'falhou'},'EGRESS_FAILED',false,{...recovery,recovery_uploaded_bytes:10485760}).percent,99);
});
test('falha no Egress nunca pode ser considerada upload concluído', () => {
    const progress=describe({status:'falhou'},'EGRESS_FAILED',false);
    assert.equal(progress.stage,'falhou');
    assert.equal(progress.percent,null);
});
test('hostname de API do Supabase é substituído pelo hostname direto do Storage', () => {
    assert.equal(normalizeS3Endpoint('https://abc.supabase.co/storage/v1/s3'),'https://abc.storage.supabase.co/storage/v1/s3');
    assert.equal(normalizeS3Endpoint('https://abc.storage.supabase.co/storage/v1/s3'),'https://abc.storage.supabase.co/storage/v1/s3');
    assert.equal(normalizeS3Endpoint('https://s3.other-cloud.com/bucket'),'https://s3.other-cloud.com/bucket');
});
test('migração bloqueia fechamento SQL sem MP4 válido e registra bytes de recuperação', () => {
    const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/071_assembly_finalization_and_upload_progress.sql'),'utf8');
    assert.match(sql,/prevent_unverified_assembly_end_071/);
    assert.match(sql,/storage\.objects/);
    assert.match(sql,/r\.status\s*<>\s*'concluido'/);
    assert.match(sql,/recovery_uploaded_bytes/);
    assert.match(sql,/has_incomplete/);
});
test('bloqueia segunda finalização na interface e mostra as gravações não concluídas', () => {
    const source=fs.readFileSync(path.join(__dirname,'../scripts/assembleia.js'),'utf8');
    const summary=fs.readFileSync(path.join(__dirname,'../scripts/assembly/assembly-summary.js'),'utf8');
    assert.match(source,/pendingAssemblyFinalizations\.has\(key\)/);
    assert.match(source,/disabled aria-disabled/);
    assert.match(source,/refreshAssemblyUploadProgress/);
    assert.match(summary,/renderRecordingUploadStatuses/);
    assert.match(summary,/\.assembly-upload-progress/);
});
