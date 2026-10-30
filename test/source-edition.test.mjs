import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyReleaseDefaults } from '../release-profile.mjs';
import { DatabaseSync } from 'node:sqlite';
import { AutoEngine } from '../auto-engine.mjs';
import { SyncHub } from '../sync-hub.mjs';

test('normal source first run keeps chat reading paused through legacy configuration migration', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const legacy = new AutoEngine({ db, root: '.', data: '.', analyzeImport: async () => ({}), classify: async () => [], model: () => ({ state: 'rules' }) });
    const hub = new SyncHub({ db, root: '.', data: '.', enqueue: () => ({}) });
    assert.equal(legacy.config.enabled, false);
    assert.equal(hub.config.wechat.enabled, false);
    assert.equal(hub.config.qq.enabled, false);
    hub.stop();
    legacy.stop();
  } finally { db.close(); }
});

test('source first run uses the current blue theme and rules without enabling optional desktop processes', () => {
  const root = mkdtempSync(join(tmpdir(), 'sg-source-defaults-'));
  writeFileSync(join(root, 'release-profile.json'), JSON.stringify({ schemaVersion: 1, edition: 'source', defaultTheme: 'lanxi', defaultPet: 'shijian' }));
  const saved = new Map(), args = { root, setting: (key, fallback) => saved.get(key) ?? fallback, saveSetting: (key, value) => saved.set(key, value) };
  applyReleaseDefaults(args);
  assert.equal(saved.get('appearance').pack, 'lanxi');
  assert.equal(saved.get('widgetMode'), 'off');
  assert.equal(saved.get('backgroundReminders'), false);
  assert.equal(saved.get('modelPreferences').profile, 'rules');
  saved.set('appearance', { pack: 'folio', fontSize: 24 });
  saved.set('modelPreferences', { profile: 'cpu' });
  applyReleaseDefaults(args);
  assert.deepEqual(saved.get('appearance'), { pack: 'folio', fontSize: 24 });
  assert.equal(saved.get('modelPreferences').profile, 'cpu');
});
