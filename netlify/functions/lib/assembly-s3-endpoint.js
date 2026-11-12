'use strict';
function normalizeS3Endpoint(value) {
  const raw = String(value || '').trim();
  const address = new URL(raw);
  if (address.protocol !== 'https:' || address.username || address.password) throw new Error('Endpoint S3 inválido. Utilize HTTPS sem credenciais na URL.');
  const match = /^([a-z0-9-]+)\.supabase\.co$/i.exec(address.hostname);
  if (match && address.pathname.replace(/\/$/, '') === '/storage/v1/s3') {
    address.hostname = `${match[1]}.storage.supabase.co`;
  }
  return address.toString().replace(/\/$/, '');
}
module.exports = { normalizeS3Endpoint };
