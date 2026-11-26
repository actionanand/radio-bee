import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Use exactly the same literal Capacitor identity for mobile and native TV. */
export function readCapacitorIdentity(root = process.cwd()) {
  const source = readFileSync(path.join(root, 'capacitor.config.ts'), 'utf8');
  const matches = [...source.matchAll(/^[ \t]*(appId|appName)[ \t]*:[ \t]*(['"])([^'"\r\n]+)\2[ \t]*,?[ \t]*$/gm)];
  const read = key => {
    const found = matches.filter(match => match[1] === key);
    if (found.length !== 1 || !found[0][3].trim() || found[0][3] !== found[0][3].trim())
      throw new Error('Expected exactly one nonblank literal ' + key + ' in capacitor.config.ts.');
    return found[0][3];
  };
  return { appId: read('appId'), appName: read('appName') };
}
