import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

test('clean source UI imports a synthetic notice, confirms it and serves optional resources safely', { skip: process.env.SHIGUANG_UI_TESTS !== '1', timeout: 45000 }, async () => {
  const root = resolve(import.meta.dirname, '..');
  const child = spawn(process.execPath, ['test/helpers/source-ui.mjs'], { cwd: root, env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', bytes => output += bytes);
  child.stderr.on('data', bytes => output += bytes);
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  assert.equal(code, 0, output);
});
