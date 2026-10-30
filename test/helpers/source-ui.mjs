import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { localStamp } from '../../extract.mjs';

const root = resolve(import.meta.dirname, '../..'), data = mkdtempSync(join(tmpdir(), 'sg-clean-source-'));
const base = 'http://127.0.0.1:43541', errors = [], failures = [], external = [], checks = [];
const child = spawn(process.execPath, ['scripts/dev.mjs'], { cwd: root, env: { ...process.env, SHIGUANG_DATA: data, SHIGUANG_PORT: '43541', SHIGUANG_MOBILE_PORT: '0', SHIGUANG_NO_MODEL: '1', SHIGUANG_NO_EXTERNAL: '1', SHIGUANG_DISCOVERY_ROOTS: '[]' }, windowsHide: true, stdio: 'ignore' });
const api = async (path, body) => {
  const response = await fetch(base + '/api/' + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'X-Shiguang': '1', 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.ok(response.ok, path);
  return response.json();
};
let browser;
try {
  for (let attempt = 0; ; attempt++) { try { await api('health'); break; } catch (error) { if (attempt > 80) throw error; await new Promise(resolve => setTimeout(resolve, 100)); } }
  const first = await api('state');
  assert.equal(first.events.length, 0);
  assert.equal(first.settings.appearance.pack, 'lanxi');
  assert.equal(first.settings.widgetMode, 'off');
  checks.push('clean-empty-source-start', 'blue-theme-preserved');
  await api('appearance', { reduceMotion: true });
  const missing = await fetch(base + '/pet-assets/gojo-sheet.png');
  assert.equal(missing.status, 404);
  await api('health');
  checks.push('missing-optional-resource-does-not-stop-service');
  browser = await chromium.launch({ ...(process.env.SHIGUANG_BROWSER_CHANNEL ? { channel: process.env.SHIGUANG_BROWSER_CHANNEL } : {}), headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failures.push(response.status() + ' ' + new URL(response.url()).pathname); });
  await page.route('**/*', route => { if (!route.request().url().startsWith(base)) { external.push(route.request().url()); return route.abort(); } return route.continue(); });
  await page.goto(base);
  await page.locator('#connectMessages').click();
  await page.locator('[data-import]').click();
  await page.locator('#source').fill('源码演示通知（合成）');
  await page.locator('#sentAt').fill(localStamp(new Date()).slice(0, 16));
  await page.locator('#text').fill('明天下午3点在示例教室参加源码演示会议。');
  await page.locator('#mode').selectOption('rules');
  await page.locator('#analyzeBtn').click();
  await page.locator('nav [data-view="pending"]').click();
  await page.locator('#reviewAllSources').click();
  await page.locator('.review-row').waitFor();
  checks.push('notice-imported-through-real-ui');
  await page.locator('.review-action-confirm').first().click();
  await page.waitForFunction(async () => (await (await fetch('/api/state')).json()).events.some(event => event.status === 'confirmed'));
  await page.locator('nav [data-view="overview"]').click();
  await page.locator('.schedule-row').waitFor();
  checks.push('confirmed-item-visible-in-agenda');
  await page.waitForTimeout(2800);
  const output = resolve(process.env.SHIGUANG_SCREENSHOTS || join(root, '.local/test-artifacts'));
  mkdirSync(output, { recursive: true });
  await page.screenshot({ path: join(output, 'source-agenda.png'), fullPage: true });
  await page.locator('nav [data-view="settings"]').click();
  await page.locator('#petSkin').waitFor();
  assert.equal(await page.locator('.gojo-feature').isVisible(), false);
  assert.equal(await page.locator('#petSkin option[value="gojo"]').count(), 0);
  checks.push('unbundled-character-not-offered');
  await page.locator('[data-settings-jump]').filter({ hasText: '桌面伙伴' }).click();
  await page.screenshot({ path: join(output, 'source-settings.png'), fullPage: true });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  checks.push('phone-and-desktop-layout');
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
  assert.deepEqual(external, []);
  console.log(JSON.stringify({ passed: true, checks, errors, failures, external }));
} finally {
  await browser?.close();
  await api('shutdown', {}).catch(() => {});
  if (child.exitCode === null) child.kill();
}
