import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const env = { ...process.env, SHIGUANG_NO_EXTERNAL: '1', SHIGUANG_MOBILE_PORT: '0', SHIGUANG_DISCOVERY_ROOTS: '[]' };
if (process.argv.includes('--ui')) env.SHIGUANG_UI_TESTS = '1';
if (process.argv.includes('--native')) env.SHIGUANG_NATIVE_TESTS = '1';
const files = readdirSync(resolve(root, 'test')).filter(name => name.endsWith('.test.mjs')).sort().map(name => 'test/' + name);
const child = spawn(process.execPath, ['--test', '--test-concurrency=1', ...files], { cwd: root, env, stdio: 'inherit', windowsHide: true });
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
