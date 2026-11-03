import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, copyFileSync, chmodSync, rmSync, constants } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

if (process.argv.length > 2)
  throw new Error('Use KEYSTORE_PASSWORD environment input; password arguments are prohibited.');
const output = 'release-keystore.jks';
if (existsSync(output)) throw new Error('Keystore already exists. Refusing to overwrite your signing identity.');
const password = process.env.KEYSTORE_PASSWORD;
if (!password || password.length < 12 || /[\r\n\0]/.test(password))
  throw new Error(
    'Set KEYSTORE_PASSWORD through a secret manager or secure shell prompt (at least 12 characters, no line breaks).',
  );
const temporary = mkdtempSync(path.join(tmpdir(), 'radiobee-keystore-'));
try {
  // Java generates PKCS12 directly; no unencrypted private-key PEM intermediate.
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
    { stdio: 'pipe' },
  );
  copyFileSync(path.join(temporary, output), output, constants.COPYFILE_EXCL);
  chmodSync(output, 0o600);
  console.log('Created release-keystore.jks (PKCS12), alias radiobee. Back it up securely.');
} catch {
  throw new Error('Keystore generation failed. Check Java keytool and password policy; no credentials were logged.');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
