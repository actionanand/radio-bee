// Apply the review-only RFC 6902 proposal to an aggregate catalogue snapshot.
// Writes only the explicitly supplied client-local output; never edits the data checkout.
const fs = require('fs'),
  path = require('path'),
  assert = require('assert/strict');
if (process.platform !== 'linux') throw Error('Run with WSL2 Linux Node');
const input = process.argv[2] || 'tmp/stage6-catalogue.json';
const output = process.argv[3] || 'tmp/stage6-reviewed.json';
assert.ok(path.resolve(output).startsWith(path.resolve('tmp') + path.sep), 'Review output must stay in client tmp/');
const catalog = JSON.parse(fs.readFileSync(input, 'utf8'));
assert.equal(catalog.manifest.catalogVersion, '1.3.0', 'Rebase the proposal explicitly for newer catalogue versions');
assert.equal(catalog.stations.length, 88);
const before = JSON.stringify(catalog.stations);
const patch = JSON.parse(fs.readFileSync('documentation/stage6/catalogue-proposal.patch.json', 'utf8'));
for (const operation of patch) {
  const keys = operation.path.slice(1).split('/');
  const key = keys.pop();
  let parent = catalog;
  for (const key of keys) parent = parent[key];
  if (operation.op === 'add' && key === '-') parent.push(operation.value);
  else if (operation.op === 'add' || operation.op === 'replace') parent[key] = operation.value;
  else throw Error('Unsupported proposal operation');
}
assert.equal(JSON.stringify(catalog.stations.slice(0, 88)), before);
fs.writeFileSync(output, JSON.stringify(catalog, null, 2) + '\n');
console.log(`Prepared local review snapshot: ${catalog.stations.length} stations; original 88 unchanged`);
