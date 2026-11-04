const fs = require('node:fs');

/** Add only the artwork settings to ZimaOS's live app service. */
function linkArtwork(compose, source) {
  if (!source.startsWith('/') || /[\r\n]/.test(source)) throw new Error('Artwork source must be an absolute host directory.');
  const newline = compose.includes('\r\n') ? '\r\n' : '\n';
  const match = compose.match(/^( +)(?:app|"app"|'app'):[ \t]*(?:\r?\n|$)/m);
  if (!match) throw new Error('Expected an app service; compose left unchanged.');
  const bodyStart = match.index + match[0].length;
  const next = compose.slice(bodyStart).search(new RegExp('^' + match[1] + '\\S', 'm'));
  const end = next < 0 ? compose.length : bodyStart + next;
  let app = compose.slice(match.index, end);
  const propertyIndent = app.slice(match[0].length).match(/^( +)[^ #\r\n]/m)?.[1];
  if (!propertyIndent) throw new Error('Expected app settings; compose left unchanged.');

  function block(name) {
    const header = app.match(new RegExp('^' + propertyIndent + '(?:' + name + '|"' + name + '"|\'' + name + '\'):[ \\t]*(?:\\r?\\n|$)', 'm'));
    if (!header) throw new Error('Expected an app ' + name + ' block; compose left unchanged.');
    const start = header.index + header[0].length;
    const nextProperty = app.slice(start).search(new RegExp('^' + propertyIndent + '\\S', 'm'));
    const body = app.slice(start, nextProperty < 0 ? app.length : start + nextProperty);
    const entryIndent = body.match(/^( +)[^ #\r\n]/m)?.[1] ?? propertyIndent + '  ';
    return { start, body, entryIndent };
  }

  if (!/^\s+(?:ARTWORK_ROOT: \/artwork|- ARTWORK_ROOT=\/artwork)\r?$/m.test(app)) {
    if (/ARTWORK_ROOT/.test(app)) throw new Error('Unexpected artwork environment setting; compose left unchanged.');
    const environment = block('environment');
    const setting = /^\s*-/m.test(environment.body) ? '- ARTWORK_ROOT=/artwork' : 'ARTWORK_ROOT: /artwork';
    app = app.slice(0, environment.start) + environment.entryIndent + setting + newline + app.slice(environment.start);
  }
  const mount = source + ':/artwork:ro';
  const mounts = app.split(/\r?\n/).filter(line => line.includes(':/artwork'));
  if (mounts.length) {
    if (mounts.length !== 1 || !['- ' + mount, '- ' + JSON.stringify(mount)].includes(mounts[0].trim())) {
      throw new Error('Unexpected artwork mount; compose left unchanged.');
    }
  } else {
    const volumes = block('volumes');
    app = app.slice(0, volumes.start) + volumes.entryIndent + '- ' + JSON.stringify(mount) + newline + app.slice(volumes.start);
  }
  return compose.slice(0, match.index) + app + compose.slice(end);
}

module.exports = { linkArtwork };
if (require.main === module || process.argv[1] === '-') {
  const [file, source] = process.argv.slice(2);
  if (!file || !source) throw new Error('Usage: link-artwork.cjs COMPOSE_FILE ARTWORK_SOURCE');
  const before = fs.readFileSync(file, 'utf8');
  const after = linkArtwork(before, source);
  if (before !== after) fs.writeFileSync(file, after);
  console.log('changed=' + (before !== after));
}
