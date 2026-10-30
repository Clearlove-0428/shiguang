import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
function walk(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (['.git', 'node_modules', '.local'].includes(entry.name)) return [];
    const path = prefix + entry.name;
    if (lstatSync(join(directory, entry.name)).isSymbolicLink()) throw Error('源码目录不能包含符号链接：' + path);
    return entry.isDirectory() ? walk(join(directory, entry.name), path + '/') : [path];
  });
}
let files = [];
if (existsSync(join(root, '.git'))) files = execFileSync('git', ['ls-files', '-z', '--cached'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
if (!files.length) files = walk(root);
const findings = [];
const forbiddenPath = /(^|\/)(data|backups|node_modules|\.local|\.cache|本地声音库)(\/|$)|(^|\/)\.env(?:\.|$)|\.(?:sqlite(?:-wal|-shm)?|db|dpapi|key|pem|gguf|exe|dll|log|zip|part\d+)$/i;
const sensitiveText = [
  ['private Windows user directory', /[A-Z]:[\\/]Users[\\/](?!Public\b|Default\b)[^\s'"<>]+/i],
  ['private workspace drive path', /D:[\\/](?:\.___|node\.exe)/i],
  ['GitHub credential', /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/],
  ['private key block', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['non-fixture WeChat account', /\bwxid_(?!(?:test|synthetic|example|fixture)(?:_|\b))[A-Za-z0-9_]{6,}\b/],
  ['private external test dependency', /(?:\.\.\/){2,}work\//]
];
for (const path of files) {
  if (forbiddenPath.test(path)) findings.push({ path, kind: 'private or generated file' });
  if (lstatSync(join(root, path)).isSymbolicLink()) findings.push({ path, kind: 'symbolic link' });
  if (!/\.(?:mjs|js|cs|ps1|json|md|html|css|svg|ya?ml|txt)$/.test(path)) continue;
  const source = readFileSync(join(root, path), 'utf8');
  for (const [kind, pattern] of sensitiveText) if (pattern.test(source)) findings.push({ path, kind });
}
console.log(JSON.stringify({ passed: findings.length === 0, files: files.length, findings }, null, 2));
if (findings.length) process.exitCode = 1;
