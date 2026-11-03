import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
const file = process.argv[2] ?? 'release-keystore.jks';
if (!existsSync(file)) throw new Error('Keystore not found. Usage: npm run keystore:type -- <file>');
try {
  const output = execFileSync(
    'keytool',
    [
      '-J-Duser.language=en',
      '-list',
      '-keystore',
      file,
      ...(process.env.KEYSTORE_PASSWORD ? ['-storepass:env', 'KEYSTORE_PASSWORD'] : []),
    ],
    { encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] },
  );
  const type = output.match(/Keystore type:\s*(\S+)/i)?.[1];
  if (!type) throw new Error('Unknown format');
  console.log(`Keystore type: ${type}`);
} catch {
  throw new Error('Cannot inspect keystore. Check keytool, file and store password.');
}
