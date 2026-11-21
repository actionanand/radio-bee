import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, copyFileSync, chmodSync, rmSync, constants } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Compatible with Office Orbit's "npm run generate-keystore -- --password <value>".
// Prefer the environment variable in normal use: CLI secrets can appear in shell
// history, process listings and npm output. Never forward a password as a keytool arg.
function passwordFromArguments(args) {
  let value;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--password' || arg.startsWith('--password=')) {
      if (value !== undefined) throw new Error('Specify --password only once.');
      if (arg === '--password') {
        value = args[++i];
        if (!value || value.startsWith('--')) throw new Error('--password requires a non-empty value.');
      } else {
        value = arg.slice('--password='.length);
        if (!value) throw new Error('--password requires a non-empty value.');
      }
    } else {
      // Do not interpolate an unknown argument: it might contain a secret.
      throw new Error('Unsupported keystore generator option. Use --password <value> or KEYSTORE_PASSWORD.');
    }
  }
  return value;
}

const output = 'release-keystore.jks';
if (existsSync(output)) throw new Error('Keystore already exists. Refusing to overwrite your signing identity.');

const password =
  passwordFromArguments(process.argv.slice(2)) ??
  (process.env.KEYSTORE_PASSWORD || process.env.ANDROID_KEYSTORE_PASSWORD);

if (!password || password.length < 12 || /[\r\n\0]/.test(password)) {
  throw new Error('Provide a password of at least 12 characters without line breaks using --password or KEYSTORE_PASSWORD.');
}

const temporary = mkdtempSync(path.join(tmpdir(), 'radiobee-keystore-'));
let createdOutput = false;
try {
  // Java generates PKCS12 directly; no unencrypted private-key PEM intermediate.
  // The secret is passed to keytool via its environment, never its argv.
  execFileSync(
    'keytool',
    [
      '-genkeypair',
      '-keystore',
      path.join(temporary, output),
      '-storetype',
      'PKCS12',
      '-storepass:env',
      'KEYSTORE_PASSWORD',
      '-keypass:env',
      'KEYSTORE_PASSWORD',
      '-alias',
      'radiobee',
      '-keyalg',
      'RSA',
      '-keysize',
      '3072',
      '-validity',
      '10000',
      '-dname',
      'CN=RadioBee,OU=Mobile,O=RadioBee,C=IN',
    ],
    { stdio: 'pipe', env: { ...process.env, KEYSTORE_PASSWORD: password } },
  );
  copyFileSync(path.join(temporary, output), output, constants.COPYFILE_EXCL);
  createdOutput = true;
  chmodSync(output, 0o600);
  console.log('Created release-keystore.jks (PKCS12), alias radiobee. Back it up securely.');
} catch {
  if (createdOutput) rmSync(output, { force: true });
  throw new Error('Keystore generation failed. Check Java keytool and password policy; no credentials were logged.');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
