const assert = require('node:assert/strict');
const { linkArtwork } = require('../link-artwork.cjs');
const fs = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');

const source = '/srv/print-it/1x';
const compose = `services:
  migrate:
    image: localhost:3002/owner/ppp-migrate:abcdef0
    environment:
      DATABASE_URL: unchanged-migrator
  app:
    image: localhost:3002/owner/ppp-app:abcdef0
    environment:
      DATABASE_URL: unchanged-app
      MODELS_ROOT: /uploads
    volumes:
      - /srv/print-it/uploads:/uploads
    depends_on:
      db:
        condition: service_healthy
  db:
    environment:
      POSTGRES_PASSWORD: unchanged-database
`;
for (const newline of ['\n', '\r\n']) {
  const original = compose.replaceAll('\n', newline);
  const linked = linkArtwork(original, source);
  assert.ok(linked.includes('      ARTWORK_ROOT: /artwork' + newline));
  assert.ok(linked.includes('      - "/srv/print-it/1x:/artwork:ro"' + newline));
  assert.equal(linkArtwork(linked, source), linked, 'Repeated deploys keep one mount and environment value');
  assert.equal(linked.replace('      ARTWORK_ROOT: /artwork' + newline, '')
    .replace('      - "/srv/print-it/1x:/artwork:ro"' + newline, ''), original,
  'Image pins, other settings, and all other services stay byte for byte the same');
  assert.equal(linkArtwork(linked.replace('"' + source + ':/artwork:ro"', source + ':/artwork:ro'), source)
    .split(':/artwork:ro').length, 2, 'An existing unquoted mount is also retained');
}
assert.throws(() => linkArtwork(compose.replace('  app:', '  other:'), source));
assert.throws(() => linkArtwork(compose.replace('      MODELS_ROOT: /uploads', '      ARTWORK_ROOT: /elsewhere'), source));
const listEnvironment = compose.replace('      DATABASE_URL: unchanged-app', '      - DATABASE_URL=unchanged-app')
  .replace('      MODELS_ROOT: /uploads', '      - MODELS_ROOT=/uploads');
assert.match(linkArtwork(listEnvironment, source), /^      - ARTWORK_ROOT=\/artwork$/m);
assert.equal(linkArtwork(linkArtwork(listEnvironment, source), source), linkArtwork(listEnvironment, source));
const wideIndent = compose.replace(/^( +)/gm, spaces => spaces + spaces);
const linkedWide = linkArtwork(wideIndent, source);
assert.match(linkedWide, /^            ARTWORK_ROOT: \/artwork$/m);
assert.equal(linkArtwork(linkedWide, source), linkedWide);
assert.equal(linkArtwork(wideIndent.replace('    app:', '    "app":'), source)
  .replace('    "app":', '    app:'), linkedWide);
const longVolume = compose.replace('      - /srv/print-it/uploads:/uploads',
  '      - type: bind\n        source: /srv/print-it/uploads\n        target: /uploads');
assert.ok(linkArtwork(longVolume, source).includes('      - "/srv/print-it/1x:/artwork:ro"\n      - type: bind'));
assert.throws(() => linkArtwork(compose.replace('    environment:\n      DATABASE_URL: unchanged-app', '    missing:\n      DATABASE_URL: unchanged-app'), source));
assert.throws(() => linkArtwork(compose.replace('      - /srv/print-it/uploads:/uploads', '      - /other:/artwork:rw'), source));
assert.throws(() => linkArtwork(compose, '../outside'));
const temporary = fs.mkdtempSync(join(tmpdir(), 'print-it-artwork-deploy-'));
try {
  const file = join(temporary, 'compose.yml');
  fs.writeFileSync(file, compose);
  const input = fs.readFileSync(join(__dirname, '../link-artwork.cjs'), 'utf8');
  for (const changed of [true, false]) {
    const result = spawnSync(process.execPath, ['-', file, source], { input, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'changed=' + changed, 'The Docker stdin invocation reports whether recreation is needed');
    assert.equal(fs.readFileSync(file, 'utf8'), linkArtwork(compose, source));
  }
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
console.log('Artwork deployment checks passed: idempotent read-only link, preserved settings, LF/CRLF, and conflicting-configuration rejection.');
