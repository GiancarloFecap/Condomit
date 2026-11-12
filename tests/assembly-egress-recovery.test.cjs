'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const helper = require('../netlify/functions/lib/assembly-egress-recovery');

const backupUrl = 'https://storage.us-phoenix-1.oraclecloud.com/p/secret/record.mp4?X-Amz-Signature=signed';

test('aceita enums numéricos e literais do LiveKit, inclusive FAILED e COMPLETE', () => {
  assert.equal(helper.normalizeStatus(3), 'EGRESS_COMPLETE');
  assert.equal(helper.normalizeStatus('EGRESS_COMPLETE'), 'EGRESS_COMPLETE');
  assert.equal(helper.completed('EGRESS_COMPLETE'), true);
  assert.equal(helper.failed('EGRESS_FAILED'), true);
  assert.equal(helper.failed(6), true);
  assert.equal(helper.completed(2), false);
});

test('a recuperação só é autorizada quando o LiveKit confirma backupStorageUsed', () => {
  assert.deepEqual(helper.backupDetails({ backupStorageUsed: false, fileResults: [{ filename:'record.mp4', location:backupUrl }] }), { used:false, location:null, manifest:null });
  assert.equal(helper.backupDetails({ backupStorageUsed: true, fileResults: [{ filename:'record.mp4', location:backupUrl }] }).location, backupUrl);
  assert.equal(helper.backupDetails({ backupStorageUsed: true, manifestLocation:'https://x.amazonAWS.com/data.json' }).manifest, 'https://x.amazonaws.com/data.json');
});

test('não aceita URL maliciosa ou HTTP no downloader de backups', () => {
  for (const url of ['http://storage.us-phoenix-1.oraclecloud.com/b', 'https://localhost/a.mp4', 'https://127.0.0.1/a.mp4', 'https://bad.amazonAWS.com.example.org/a.mp4', 'https://user:password@x.amazonaws.com/a.mp4']) {
    assert.equal(helper.trustedBackupUrl(url), null);
  }
});

test('logs não armazenam URL assinada ou credenciais', () => {
  const result = helper.safeError('upload failed https://a.oraclecloud.com/a?X-Amz-Signature=SECRET password=SECRET Authorization: Token secrettoken');
  assert.doesNotMatch(result, /X-Amz-Signature|secrettoken|password=SECRET/);
});

test('restaura MP4 em blocos TUS sem reter vídeo completo, preservando nome do banco', async () => {
  const before = {data:[], error:null};
  const after = {data:[{name:'abc.mp4', metadata:{size:2048}}],error:null};
  let listings=0; let sent=0;
  const admin = { storage:{from(bucket){assert.equal(bucket, helper.BUCKET); return {list: async()=>++listings===1?before:after};}} };
  const oldUrl=process.env.SUPABASE_URL, oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL='https://myproject.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY='not-a-real-secret-but-long-enough-for-test';
  const fetcher = async(url, opts={}) => {
    const address=String(url);
    if (address===backupUrl) return new Response(Buffer.alloc(2048, 1), {status:200, headers:{'content-length':'2048'}});
    if (address.endsWith('/upload/resumable') && opts.method==='POST') {
      assert.match(opts.headers['Upload-Metadata'], /objectName/);
      return new Response('', {status:201,headers:{location:'/storage/v1/upload/resumable/uploads/123'}});
    }
    if (address.endsWith('/uploads/123') && opts.method==='PATCH') {
      sent += opts.body.length;
      return new Response(null, {status:204,headers:{'Upload-Offset':String(sent)}});
    }
    throw new Error(`Unexpected fetch: ${address}`);
  };
  try {
    const result=await helper.restoreBackup(admin,
      {id:12, assembly_id:153, recording_url:'storage://condomit-assembly-recordings/153/abc.mp4'},
      {backup_location:backupUrl}, fetcher);
    assert.equal(result.restored,true);
    assert.equal(result.bytes,2048);
    assert.equal(sent,2048);
  } finally {
    if (oldUrl===undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL=oldUrl;
    if (oldKey===undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;
  }
});

test('encerramento automático não pode ignorar gravação ativa na migração 070', () => {
  const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/070_assembly_egress_recovery.sql'),'utf8');
  assert.match(sql,/has_unfinished_egress/);
  assert.match(sql,/NOT p\.has_unfinished_egress/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/REVOKE ALL ON TABLE public\.assembly_egress_diagnostics FROM PUBLIC, anon, authenticated/);
});

test('cliente não considera assembleia encerrada antes da confirmação do MP4', () => {
  const fn=fs.readFileSync(path.join(__dirname,'../netlify/functions/assembly-action.js'),'utf8');
  const page=fs.readFileSync(path.join(__dirname,'../scripts/assembleia.js'),'utf8');
  assert.match(fn,/recording_end_requested_at/);
  assert.match(fn,/recording_finalization: 'aguardando_mp4'/);
  assert.match(page,/if \(finalized\.pending\)/);
});

test('sala LiveKit possui intervalo para reconexão após queda do síndico', () => {
  const source=fs.readFileSync(path.join(__dirname,'../netlify/functions/livekit-token.js'),'utf8');
  assert.match(source,/departureTimeout: 180/);
});
