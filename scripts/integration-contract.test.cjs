const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs');
test('production assets exclude the seed; dev and technical builds retain their tiny example', () => {
  const build = JSON.parse(fs.readFileSync('angular.json')).projects.app.architect.build;
  assert.ok(build.options.assets[0].ignore.includes('catalog-development-seed.json'));
  for (const key of ['development', 'live-test']) assert.ok(!build.configurations[key].assets[0].ignore);
  const seed = JSON.parse(fs.readFileSync('src/assets/catalog-development-seed.json'));
  assert.equal(seed.stations.length, 0);
  assert.equal(seed.discoveryStations.length, 1);
  assert.equal(seed.discoveryStations[0].id, 'offline-example');
  assert.ok(fs.statSync('src/assets/catalog-development-seed.json').size < 5000);
  assert.doesNotMatch(fs.readFileSync('tsconfig.json', 'utf8'), /"resolveJsonModule"\s*:\s*true/);
});
test('no client maintained alias list, card navigation or JSON seed imports remain', () => {
  assert.doesNotMatch(fs.readFileSync('src/app/catalog/catalog.models.ts', 'utf8'), /airNagercoilAliases/);
  assert.doesNotMatch(fs.readFileSync('src/app/catalog/station-card.html', 'utf8'), /<a\b|\[href\]/);
  assert.doesNotMatch(
    fs.readFileSync('src/app/catalog/discovery-publication.spec.ts', 'utf8'),
    /catalog-development-seed\.json/,
  );
});
