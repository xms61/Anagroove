import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { buildFixtureCatalog } from './fixtures/fixtureCatalog.ts';
import { evaluateCatalogGate } from '../../server/db/catalogGate.ts';
import { SqliteCatalog } from '../../server/db/sqliteCatalog.js';

test('the CI fixture catalog is fully admitted, passes the gate and serves puzzles', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anagroove-fixture-'));
  const dbPath = path.join(dir, 'catalog.sqlite');
  const { tracks } = buildFixtureCatalog(dbPath);
  assert.equal(tracks, 92);

  const db = new DatabaseSync(dbPath);
  const gate = evaluateCatalogGate(db);
  assert.ok(gate.ok, gate.checks.filter(c => !c.ok).map(c => c.label).join(', '));
  const languages = db.prepare('SELECT language, COUNT(*) AS c FROM tracks GROUP BY language ORDER BY language').all();
  assert.deepEqual(languages.map(r => [r.language, r.c]), [['en', 80], ['ja', 6], ['ko', 6]]);
  db.close();

  const catalog = new SqliteCatalog(dbPath);
  const window = catalog.sampleCatalogTracks({ languages: ['en'], minPopularity: 20, poolSize: 400 });
  assert.ok(window.length >= 30, 'a default puzzle has enough candidates without live providers');
  assert.ok(window.every(t => t.deezer_id), 'every fixture track has a preview ref');
  catalog.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
