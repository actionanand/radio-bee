import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, copyFileSync, chmodSync, rmSync, constants } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Adapted from office-orbit/scripts/generate-keystore.mjs: OpenSSL key, self-signed
// certificate and PKCS12 export. Keep Radio Bee's signing identity and safety checks.
const outputFile = 'release-keystore.jks';
const alias = 'radiobee';

function resolvePassword(args) {
  let value;
  for (let i = 0; i < args.length; i++) {
    const option = args[i];
    if (option !== '--password' && !option.startsWith('--password=')) {
      throw new Error('Unsupported option. Use --password <value> or KEYSTORE_PASSWORD.');
    }
    if (value !== undefined) throw new Error('Specify --password only once.');
    value = option === '--password' ? args[++i] : option.slice('--password='.length);
    if (!value || value.startsWith('--')) throw new Error('--password requires a non-empty value.');
  }
  return value ?? process.env.KEYSTORE_PASSWORD ?? process.env.ANDROID_KEYSTORE_PASSWORD;
}

if (existsSync(outputFile)) {
  throw new Error('Keystore already exists. Refusing to overwrite your signing identity.');
}

const password = resolvePassword(process.argv.slice(2));
if (!password || password.length < 10 || /[\r\n\0]/.test(password)) {
  throw new Error('Provide a password of at least 10 characters without line breaks using --password or KEYSTORE_PASSWORD.');
}

function runOpenSSL(args, env = {}) {
  return execFileSync('openssl', args, {
    env: { ...process.env, ...env },
    stdio: 'pipe',
  });
}

const workingDirectory = mkdtempSync(path.join(tmpdir(), 'radiobee-keygen-'));
const keyFile = path.join(workingDirectory, 'radio-bee-key.pem');
const certFile = path.join(workingDirectory, 'radio-bee-cert.pem');
const pkcs12File = path.join(workingDirectory, outputFile);
let createdOutput = false;
let stage = 'Checking OpenSSL';
try {
  runOpenSSL(['version']);
  stage = 'Generating RSA private key';
  runOpenSSL(['genrsa', '-out', keyFile, '3072']);
  chmodSync(keyFile, 0o600);
  stage = 'Generating signing certificate';
  runOpenSSL([
    'req', '-new', '-x509', '-key', keyFile, '-out', certFile, '-days', '10000',
    '-subj', '/CN=RadioBee/OU=Mobile/O=RadioBee/C=IN',
  ]);
  stage = 'Creating PKCS12 keystore';
  runOpenSSL([
    'pkcs12', '-export', '-in', certFile, '-inkey', keyFile, '-out', pkcs12File,
    '-name', alias, '-passout', 'env:OPENSSL_PASS',
  ], { OPENSSL_PASS: password });
  stage = 'Copying keystore into project';
  copyFileSync(pkcs12File, outputFile, constants.COPYFILE_EXCL);
  createdOutput = true;
  chmodSync(outputFile, 0o600);
  console.log(`Created ${outputFile} (PKCS12), alias ${alias}. Back it up securely.`);
  console.log(`Encode: base64 -w 0 ${outputFile} > keystore.b64.txt`);
} catch (error) {
  if (createdOutput) rmSync(outputFile, { force: true });
  if (error.code === 'ENOENT' && stage === 'Checking OpenSSL') {
    throw new Error('OpenSSL not found. In WSL2 install it with: sudo apt-get install openssl');
  }
  const diagnostic = String(error.stderr || error.stdout || '')
    .replaceAll(password, '[REDACTED]')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ')
    .trim()
    .slice(0, 1200);
  throw new Error(`${stage} failed${diagnostic ? ': ' + diagnostic : ' (' + (error.code || 'unknown') + ')'}.`);
} finally {
  // Private key and cert are ephemeral, never placed in the project directory.
  rmSync(workingDirectory, { recursive: true, force: true });
}
