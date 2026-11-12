const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs');
test('production assets exclude the seed; development retains its tiny unused example', () => {
  const build = JSON.parse(fs.readFileSync('angular.json')).projects.app.architect.build;
  assert.ok(build.options.assets[0].ignore.includes('catalog-development-seed.json'));
  assert.ok(!build.configurations.development.assets[0].ignore);
  const seed = JSON.parse(fs.readFileSync('src/assets/catalog-development-seed.json'));
  assert.equal(seed.stations.length, 0);
  assert.equal(seed.discoveryStations.length, 1);
  assert.equal(seed.discoveryStations[0].id, 'offline-example');
  assert.ok(fs.statSync('src/assets/catalog-development-seed.json').size < 5000);
  assert.doesNotMatch(fs.readFileSync('tsconfig.json', 'utf8'), /"resolveJsonModule"\s*:\s*true/);
});
test('no client maintained aliases, external card redirects or JSON seed imports remain', () => {
  assert.doesNotMatch(fs.readFileSync('src/app/catalog/catalog.models.ts', 'utf8'), /airNagercoilAliases/);
  assert.doesNotMatch(
    fs.readFileSync('src/app/catalog/station-card.html', 'utf8'),
    /\[href\]|href\s*=\s*[\x22\x27]https?:/,
  );
  assert.doesNotMatch(
    fs.readFileSync('src/app/catalog/discovery-publication.spec.ts', 'utf8'),
    /catalog-development-seed\.json/,
  );
});

test('only development and production environments select the v2 directory UI', () => {
  const environments = fs.readdirSync('src/environments')
    .filter(name => /^environment(?:\.[\w-]+)?\.ts$/.test(name))
    .sort();
  assert.deepEqual(environments, ['environment.prod.ts', 'environment.ts']);
  for (const name of environments) {
    const content = fs.readFileSync('src/environments/' + name, 'utf8');
    assert.match(content, /catalogUrl:\s*'https:\/\/actionanand\.github\.io\/radio-bee-data\/v2\/'/);
    assert.match(content, /\/\/.*\/v1\/.*legacy RadioBee/);
    assert.match(content, /\/\/.*\/v2\/.*new Stage 16 directory UI/);
    assert.match(content, /catalogSeedUrl:\s*null/);
  }
  const architect = JSON.parse(fs.readFileSync('angular.json', 'utf8')).projects.app.architect;
  assert.ok(architect.build.configurations.production.fileReplacements.some(
    entry => entry.with === 'src/environments/environment.prod.ts',
  ));
  assert.ok(!('live-test' in architect.build.configurations));
  assert.ok(!('stage16' in architect.build.configurations));
  assert.ok(!('live-test' in architect.serve.configurations));
});
