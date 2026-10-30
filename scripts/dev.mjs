import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const [major, minor] = process.versions.node.split('.').map(Number);
if (major !== 24 || minor < 15) throw new Error('请使用 Node.js 24.15.0 或更新的 24.x 版本。');
const data = resolve(process.env.SHIGUANG_DATA || join(root, '.local/data'));
mkdirSync(data, { recursive: true });
const env = {
  ...process.env,
  SHIGUANG_DATA: data,
  SHIGUANG_PORT: process.env.SHIGUANG_PORT || '43527',
  SHIGUANG_MODEL_PORT: process.env.SHIGUANG_MODEL_PORT || '43528',
  SHIGUANG_MOBILE_PORT: process.env.SHIGUANG_MOBILE_PORT || '43529',
  SHIGUANG_MOBILE_HOST: process.env.SHIGUANG_MOBILE_HOST || '127.0.0.1'
};
console.log('打开 http://127.0.0.1:' + env.SHIGUANG_PORT + '；按 Ctrl+C 退出。');
const child = spawn(process.execPath, ['server.mjs'], { cwd: root, env, stdio: 'inherit', windowsHide: true });
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
