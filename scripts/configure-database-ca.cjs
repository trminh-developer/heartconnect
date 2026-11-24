// Validate the provider CA against the actual database before updating hosting.
// Usage: node scripts/configure-database-ca.cjs <ca.pem> [--apply]
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { Client } = require('../backend/node_modules/pg');
const dotenv = require('../backend/node_modules/dotenv');

async function main() {
  if (!process.argv[2]) throw new Error('Provide the path to the CA certificate downloaded from Aiven.');
  const ca = fs.readFileSync(path.resolve(process.argv[2]), 'utf8');
  const certificate = new crypto.X509Certificate(ca);
  if (!certificate.ca || Date.parse(certificate.validFrom) > Date.now() || Date.parse(certificate.validTo) <= Date.now()) {
    throw new Error('The file must contain a currently valid CA certificate.');
  }
  const root = path.resolve(__dirname, '..');
  const local = dotenv.parse(fs.readFileSync(path.join(root, 'backend/.env.local')));
  const url = new URL(local.DATABASE_URL || local.POSTGRES_URL);
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat']) url.searchParams.delete(key);
  const client = new Client({ connectionString: url.toString(), ssl: { ca, rejectUnauthorized: true }, connectionTimeoutMillis: 15000 });
  try { await client.connect(); await client.query('SELECT 1'); }
  finally { await client.end(); }
  console.log(JSON.stringify({ databaseTlsVerified: true, caFingerprint: certificate.fingerprint256, validTo: certificate.validTo }));
  if (!process.argv.includes('--apply')) return;

  const project = JSON.parse(fs.readFileSync(path.join(root, 'backend/.vercel/project.json'))).projectId;
  if (project !== 'prj_MjZh72tyHtyh0D2VtaUOP5fHlxLE') throw new Error('Unexpected backend project.');
  const input = path.join(root, 'dist-test/database-ca-env-input.json');
  fs.mkdirSync(path.dirname(input), { recursive: true });
  fs.writeFileSync(input, JSON.stringify({ key: 'DATABASE_SSL_CA', value: ca, type: 'encrypted', target: ['production', 'preview'] }));
  const cli = path.join(process.env.APPDATA, 'npm/node_modules/vercel/dist/vc.js');
  const result = spawnSync(process.execPath, [cli, 'api', `/v10/projects/${project}/env?upsert=true`, '--method', 'POST', '--input', input, '--silent'], {
    cwd: path.join(root, 'backend'), encoding: 'utf8', windowsHide: true,
  });
  if (result.status !== 0) throw new Error('Failed to update DATABASE_SSL_CA: ' + result.stderr);
  console.log(JSON.stringify({ configured: 'DATABASE_SSL_CA', project: 'heartconnect-api', targets: ['production', 'preview'], redeployRequired: true }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
