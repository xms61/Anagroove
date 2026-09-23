import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { canonicalArtistKey } from '../../shared/musicIdentity.js';
import {
  isLanguagePermitted,
  isTemporalPermitted,
  allowedLanguagesForContext,
  resolveReleaseYear,
} from '../../server/policy/selectionPolicy.js';
import { createRng, weightedOrder } from '../../server/selection/random.js';
import { validateLivePuzzlePayload, parseLanguageFilter } from '../../server/validators.js';
import { SqliteCatalog } from '../../server/db/sqliteCatalog.js';
import { classifyVersion, baseTitleKey, cleanDisplayText, deezerRankToScore } from '../../server/db/trackNormalization.js';
import { resolveTrackLanguage, classifyArtistLanguage, scriptLanguage } from '../../server/db/languageClassifier.js';
import { runCatalogCleanup } from '../../server/db/catalogCleanup.js';
import { evaluateCatalogGate } from '../../server/db/catalogGate.js';
import { UserStore } from '../../server/db/userStore.js';
import { catalogCandidates } from '../../server/selection/candidates.js';
import { CatalogEnricher } from '../../server/crawler/enricher.js';
import { routedFetch } from './helpers.js';

test('Catalog Cleanup, Validation Gate & Album Enrichment', async () => {
  // 1. Classifier guards against deleting English songs
  const lang = (title, artist, artistLanguage = null) => resolveTrackLanguage({ title, artist, artistLanguage });
  assert(lang("Sweet Child O' Mine", "Guns N' Roses", 'en') === 'en' && lang('Moth To A Flame', 'The Weeknd', 'en') === 'en', 'Short English titles that edge out English in ELD stay English');
  assert(lang('Cutie Pie', 'One Way') === 'en' && lang('Teenage Dirtbag', 'Wheatus') === 'en', 'Two-word titles only turn foreign for major languages with a clear margin');
  assert(lang('Mi Gente', 'J Balvin') === 'es' && lang('Te Quería Ver', 'Alemán') === 'es', 'Clear Spanish titles are still detected without an artist vote');
  assert(lang("Pour que tu m'aimes encore", 'Céline Dion', 'en') === 'fr', 'A long, clearly French title overrules an English artist vote');
  assert(scriptLanguage('KoЯn') === null && scriptLanguage('DISCIPLΞS') === null && scriptLanguage('Кино') === 'ru', 'A stylized letter does not make a name Russian or Greek');
  assert(lang('Freak On a Leash', 'KoЯn') === 'en' && lang('P.I.M.P.', '50 Cent', 'en') === 'en', 'Stylized names and dotted acronyms stay English');
  assert(classifyArtistLanguage({ titles: ['Brown Sugar', 'The Door', 'Playa Playa'] }).language === 'en', 'A few short English titles do not vote an artist foreign');
  assert(classifyArtistLanguage({ titles: ['Por Esos Ojos', 'La Sala de Espera', 'Mi Corazón Contigo'] }).language === 'es', 'A Spanish catalog still votes es');

  // 1b. Selection policy and sampling (Phase 5)
  assert(isLanguagePermitted({ title: 'Viva La Vida', artist: 'Coldplay', language: 'en' }, 'pop') === true, 'Catalog language is trusted over stopword heuristics ("Viva La Vida")');
  assert(isLanguagePermitted({ title: 'Idol', artist: 'YOASOBI', language: 'ja' }, 'pop') === false && isLanguagePermitted({ title: 'Idol', artist: 'YOASOBI', language: 'ja' }, 'all', 'japanese city pop') === true, 'Japanese catalog tracks only appear in Japanese themes');
  assert(allowedLanguagesForContext('kpop').join() === 'ko,en' && allowedLanguagesForContext('all', 'anime openings').join() === 'ja,en' && allowedLanguagesForContext('rock').join() === 'en', 'Theme languages map to the en/ja/ko catalog');
  const unmutated = { title: 'Dreams (2004 Remaster)', releaseDate: '2018-01-01' };
  assert(isTemporalPermitted(unmutated, { start: 2000, end: 2009 }) === true && unmutated.releaseYear === undefined && resolveReleaseYear(unmutated) === 2004, 'isTemporalPermitted is pure; the vintage year comes from resolveReleaseYear');
  assert(isTemporalPermitted({ title: 'No Year' }, null) === true && isTemporalPermitted({ title: 'No Year' }, { start: 1980, end: 1989 }) === false, 'Unknown years pass without a year window and fail with one');
  const rngA = createRng('seed-1');
  const rngB = createRng('seed-1');
  assert([1, 2, 3].every(() => rngA() === rngB()) && createRng('seed-2')() !== createRng('seed-1')(), 'Seeded RNG is reproducible and seed-dependent');
  const weightRng = createRng('weights');
  let heavyFirst = 0;
  for (let i = 0; i < 400; i++) {
    if (weightedOrder([{ id: 'light', w: 1 }, { id: 'heavy', w: 9 }], item => item.w, weightRng)[0].id === 'heavy') heavyFirst++;
  }
  assert(heavyFirst > 320 && heavyFirst < 400, 'Weighted order puts a 9x heavier item first about 90% of the time');

  const sampleCat = new SqliteCatalog(':memory:');
  for (let i = 0; i < 30; i++) {
    sampleCat.upsertTrack({ title: `Sample Song ${i}`, artist: `Sample Artist ${i % 10}`, durationMs: 200000, provider: 'deezer', providerTrackId: String(500 + i), deezerRank: 100000 + i * 20000, releaseYear: 1980 + (i % 20), sampleUrl: `https://cdn.test/${i}.mp3` });
    sampleCat.insertSample(i + 1, { provider: 'itunes', providerTrackId: `it${i}`, sampleUrl: `https://it.test/${i}.m4a` });
  }
  const windowRows = sampleCat.sampleCatalogTracks({ languages: ['en'], poolSize: 50, start: 0.5 });
  assert(windowRows.length === 30 && new Set(windowRows.map(r => r.id)).size === 30, 'Catalog window wraps around and returns one row per track (no duplicate per sample)');
  assert(windowRows.every(r => r.sample_url.startsWith('https://cdn.test/')), 'The Deezer sample is preferred when a track has several');
  const windowAgain = sampleCat.sampleCatalogTracks({ languages: ['en'], poolSize: 10, start: 0.25 });
  assert(windowAgain.map(r => r.id).join() === sampleCat.sampleCatalogTracks({ languages: ['en'], poolSize: 10, start: 0.25 }).map(r => r.id).join(), 'The same window start returns the same rows');
  const eighties = sampleCat.sampleCatalogTracks({ yearRange: { start: 1980, end: 1989 }, poolSize: 50 });
  assert(eighties.length === 20 && eighties.every(r => r.release_year >= 1980 && r.release_year <= 1989), 'Year windows filter in SQL');
  assert(sampleCat.sampleCatalogTracks({ artist: 'Sample Artist 3', poolSize: 50 }).length === 3 && sampleCat.sampleCatalogTracks({ ftsQuery: '"Song 1"', poolSize: 50 }).length >= 1, 'Artist and text filters narrow the window');
  sampleCat.close();

  // 1b'. Explicit EN/JA/KO filter (Phase 6 generator chips)
  assert(parseLanguageFilter(['ja', 'KO', 'ja']).languages.join() === 'ja,ko' && parseLanguageFilter('en,ko').languages.join() === 'en,ko' && parseLanguageFilter(undefined).languages === undefined, 'Language filter accepts arrays and comma lists, deduped');
  assert(!parseLanguageFilter(['es']).valid && !validateLivePuzzlePayload({ languages: 'fr' }).valid && validateLivePuzzlePayload({ languages: ['ja'] }).data.languages.join() === 'ja', 'Only en/ja/ko are accepted');
  assert(isLanguagePermitted({ title: 'Idol', artist: 'YOASOBI', language: 'ja' }, 'pop', '', { languages: ['ja'] }) === true && isLanguagePermitted({ title: 'Levitating', artist: 'Dua Lipa', language: 'en' }, 'pop', '', { languages: ['ja'] }) === false, 'An explicit filter overrides the theme languages');
  const filterCat = new SqliteCatalog(':memory:');
  filterCat.upsertTrack({ title: 'Levitating', artist: 'Dua Lipa', durationMs: 203000, provider: 'deezer', providerTrackId: '901', deezerRank: 800000 });
  filterCat.upsertTrack({ title: 'アイドル', artist: 'YOASOBI', durationMs: 213000, provider: 'deezer', providerTrackId: '902', deezerRank: 800000, isrc: 'JPU902300400' });
  const filtered = catalogCandidates({ catalog: filterCat, queryPlan: { genre: 'all', popularity: 'pure', languages: ['ja'] }, prompt: '', rng: createRng('lang') });
  assert(filtered.length === 1 && filtered[0].language === 'ja', 'The catalog window honors the explicit language filter');
  filterCat.close();

  // 1c. SQLite user store with a one-time import of the old JSON store
  const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spotyspice-users-'));
  const legacyPath = path.join(storeDir, 'store.json');
  fs.writeFileSync(`${legacyPath}.bak`, JSON.stringify({ users: {
    alice: {
      userId: 'alice', createdAt: 1000, lastActive: 2000,
      activeProgress: { puzzleId: 'p2', userLetters: [['A']] },
      solvedHistory: [{ puzzleId: 'p1', solvedAt: 1500 }, { puzzleId: 'p1', solvedAt: 1600 }],
      blacklist: [
        { id: 'b1', name: 'Daft Punk', type: 'artist', dateAdded: 1100 },
        { id: 'b2', name: 'daft  punk', type: 'artist', dateAdded: 1200 },
        { id: 'b3', name: 'Same Title', type: 'song', provider: 'deezer', providerTrackId: '101', dateAdded: 1300 },
        { id: 'bad', name: 'Nope', type: 'album' },
      ],
    },
  } }));
  fs.writeFileSync(legacyPath, '{ broken json');
  const users = new UserStore(path.join(storeDir, 'users.sqlite'), { legacyStorePath: legacyPath });
  assert(users.findUser('alice')?.createdAt === 1000 && users.getProgress('alice')?.puzzleId === 'p2', 'Legacy store is imported from the .bak copy when store.json is corrupt');
  assert(users.getSolvedHistory('alice').length === 1 && users.getBlacklist('alice').map(b => b.id).join() === 'b1,b3', 'Import drops duplicate history, duplicate blacklist names and invalid types');
  assert(users.importLegacyStore(legacyPath).imported === false, 'The import runs only once');
  users.recordSolvedPuzzle('alice', { puzzleId: 'p2', title: 'Two' });
  assert(users.getProgress('alice') === null && users.getSolvedHistory('alice').map(h => h.puzzleId).join() === 'p1,p2', 'Solving a puzzle clears its progress and appends to history in order');
  users.addBlacklistItem('alice', { name: 'Same Title', type: 'song' });
  users.addBlacklistItem('alice', { name: 'DAFT PUNK', type: 'artist' });
  assert(users.getBlacklist('alice').length === 3 && users.removeBlacklistItem('alice', 'b1').length === 2, 'Generic and provider-scoped entries coexist; duplicates are ignored; removal by id');
  assert(users.findUser('nobody') === null && users.getBlacklist('nobody').length === 0 && users.findUser('nobody') === null, 'Reads never create users');
  users.close();
  const reopened = new UserStore(path.join(storeDir, 'users.sqlite'), { legacyStorePath: legacyPath });
  assert(reopened.getSolvedHistory('alice').length === 2 && reopened.getBlacklist('alice').length === 2, 'User state persists across restarts without re-importing');
  reopened.close();
  fs.rmSync(storeDir, { recursive: true, force: true });

  // 2. Text and version normalization
  assert(cleanDisplayText('I&#039;m Not The Only One') === "I'm Not The Only One" && cleanDisplayText('Rock &amp;amp; Roll') === 'Rock & Roll', 'HTML entities are decoded, including double encoding');
  const zwsp = String.fromCharCode(0x200b);
  assert(cleanDisplayText(`  Equator - ${zwsp} Eastern  `) === 'Equator - Eastern' && cleanDisplayText(cleanDisplayText('A &amp; B')) === 'A & B', 'Invisible characters and whitespace are cleaned idempotently');
  assert(['Mayonaka no Door (Single ver.)', 'Nuit de folie (Version originale 1988)', 'So Far Away (Full Version)'].every(t => classifyVersion(t) === 'original'), 'Tags naming the original release are original');
  assert(classifyVersion('Sparkle - movie ver.') === 'alternate' && classifyVersion('Dreams (2004 Remaster)') === 'remaster', 'Movie versions stay alternate; remasters are accepted');

  // 3. Cleanup on a legacy catalog (rows inserted directly: upsertTrack would refuse them)
  const cat = new SqliteCatalog(':memory:');
  const db = cat.db;
  const artistId = (name) => {
    const key = canonicalArtistKey(name) || name;
    db.prepare('INSERT OR IGNORE INTO artists (canonical_name, display_name) VALUES (?, ?)').run(key, name);
    return db.prepare('SELECT id FROM artists WHERE canonical_name = ?').get(key).id;
  };
  const legacy = ({ title, artist, album = 'Album', language = 'en', durationMs = 200000, isrc = null, popularity = 50, year = null, deezerId = null, sampleId = deezerId, provider = true }) => {
    const id = Number(db.prepare(`
      INSERT INTO tracks (isrc, canonical_title, display_title, artist_id, album_name, duration_ms, release_year, language, popularity, version_type, rand_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.5)
    `).run(isrc, baseTitleKey(title), title, artistId(artist), album, durationMs, year, language, popularity, classifyVersion(title, album)).lastInsertRowid);
    if (provider && deezerId) db.prepare("INSERT INTO track_providers (track_id, provider, provider_track_id) VALUES (?, 'deezer', ?)").run(id, String(deezerId));
    if (sampleId) db.prepare("INSERT INTO track_samples (track_id, provider, provider_track_id, sample_url) VALUES (?, 'deezer', ?, ?)").run(id, String(sampleId), `https://cdn.test/${sampleId}.mp3`);
    return id;
  };

  const levitating = legacy({ title: 'Levitating', artist: 'Dua Lipa', isrc: 'GBAHT2000942', year: 2020, popularity: 80, deezerId: 1 });
  legacy({ title: 'Levitating (Live at the BRITs)', artist: 'Dua Lipa', popularity: 90, deezerId: 2 });
  legacy({ title: 'Levitating', artist: 'Dua Lipa', album: 'Future Nostalgia (Deluxe)', year: 2019, popularity: 60, deezerId: 3 });
  const gaga = legacy({ title: 'Die With A Smile', artist: 'Lady Gaga', popularity: 95, deezerId: 10 });
  legacy({ title: 'Die With A Smile', artist: 'Bruno Mars', popularity: 95, sampleId: 10, provider: false });
  for (const [i, title] of ['Por Esos Ojos', 'La Sala de Espera', 'Mi Corazón Contigo'].entries()) {
    legacy({ title, artist: 'Grupo Norteño', language: 'en', deezerId: 20 + i });
  }
  legacy({ title: 'I&#039;m Not The Only One', artist: 'Sam Smith', deezerId: 30, popularity: 70 });
  legacy({ title: "I'm Not The Only One", artist: 'Sam Smith', deezerId: 31, popularity: 40 });
  legacy({ title: 'The Riddle', artist: 'Gigi D&#039;Agostino', deezerId: 40 });
  legacy({ title: 'Bla Bla Bla', artist: "Gigi D'Agostino", deezerId: 41 });
  legacy({ title: 'Rain Sounds For Sleep', artist: 'Sleep Sounds', deezerId: 50 });
  legacy({ title: 'Intro', artist: 'Some Band', durationMs: 8000, deezerId: 51 });
  legacy({ title: 'Lost Song', artist: 'Some Band', deezerId: null, sampleId: null });
  const idol = legacy({ title: 'アイドル', artist: 'YOASOBI', language: 'ja', isrc: 'jpu902300400', deezerId: 60, popularity: 900000 });
  legacy({ title: '봄날', artist: 'BTS', language: 'ko', deezerId: 61 });

  const dirtyGate = evaluateCatalogGate(db, { minYearCoverage: 0, minIsrcCoverage: 0 });
  const failing = new Set(dirtyGate.checks.filter(c => !c.ok).map(c => c.id));
  assert(!dirtyGate.ok && ['duplicates', 'version', 'text', 'duration', 'unlinked', 'inauthentic'].every(id => failing.has(id)), 'Gate flags duplicates, versions, entities, durations, unlinked and inauthentic rows');

  const trackCount = () => db.prepare('SELECT COUNT(*) AS c FROM tracks').get().c;
  const before = trackCount();
  const dry = runCatalogCleanup(db);
  assert(dry.applied === false && trackCount() === before && dry.after.tracks < before, 'Dry run reports the changes and rolls them back');

  const applied = runCatalogCleanup(db, { apply: true });
  const step = (name) => applied.steps.find(s => s.name === name);
  assert(step('recordings').removed === 1 && !db.prepare("SELECT 1 FROM tracks t JOIN artists a ON a.id = t.artist_id WHERE a.display_name = 'Bruno Mars'").get(), 'A collaboration stored under a second artist is folded into the provider owner');
  assert(db.prepare('SELECT COUNT(*) AS c FROM tracks WHERE id = ?').get(gaga).c === 1, 'The provider owner keeps the song');
  const policy = step('policy');
  assert(policy.reasons.version === 1 && policy.reasons.language === 3 && policy.reasons.inauthentic === 1 && policy.reasons.duration === 1 && policy.reasons.unlinked === 1, 'Policy deletes live, Spanish, utility, too-short and unlinked rows');
  const lev = db.prepare('SELECT release_year, isrc FROM tracks WHERE id = ?').get(levitating);
  const levProviders = db.prepare('SELECT COUNT(*) AS c FROM track_providers WHERE track_id = ?').get(levitating).c;
  assert(lev.release_year === 2019 && lev.isrc === 'GBAHT2000942' && levProviders === 2, 'Duplicate releases merge into one row with the earliest year and all provider links');
  assert(db.prepare("SELECT COUNT(*) AS c FROM tracks WHERE display_title = 'I''m Not The Only One'").get().c === 1, 'Entity-decoded titles merge with their clean duplicate');
  const gigi = db.prepare("SELECT COUNT(DISTINCT artist_id) AS artists, COUNT(*) AS tracks FROM tracks WHERE display_title IN ('The Riddle', 'Bla Bla Bla')").get();
  assert(gigi.artists === 1 && gigi.tracks === 2 && step('text').artistsMerged === 1, 'Artists whose names only differed by HTML entities are merged');
  const idolRow = db.prepare('SELECT language, isrc, country_code, popularity FROM tracks WHERE id = ?').get(idol);
  assert(idolRow.language === 'ja' && idolRow.isrc === 'JPU902300400' && idolRow.country_code === 'JP' && idolRow.popularity === deezerRankToScore(900000), 'Japanese rows survive with normalized ISRC, registrant and 0-100 popularity');
  assert(db.prepare("SELECT language FROM tracks WHERE display_title = '봄날'").get()?.language === 'ko', 'Korean rows survive');
  assert(db.prepare('SELECT COUNT(*) AS c FROM artists WHERE id NOT IN (SELECT artist_id FROM tracks)').get().c === 0, 'Artists left without tracks are deleted');

  const again = runCatalogCleanup(db, { apply: true });
  const changed = again.steps
    .filter(s => s.name !== 'fts' && s.name !== 'languages')
    .flatMap(s => Object.entries(s).filter(([k, v]) => typeof v === 'number' && !['ms', 'rounds'].includes(k) && v !== 0));
  assert(changed.length === 0 && again.after.tracks === again.before.tracks, 'A second cleanup run changes nothing (idempotent)');

  const gate = evaluateCatalogGate(db, { minYearCoverage: 0, minIsrcCoverage: 0 });
  assert(gate.ok, 'Cleaned catalog passes every gate check');
  const strictGate = evaluateCatalogGate(db);
  assert(!strictGate.ok && strictGate.checks.find(c => c.id === 'year_coverage').ok === false, 'Default thresholds still require 95% release-year coverage');
  const ftsHit = db.prepare(`SELECT rowid FROM tracks_fts WHERE tracks_fts MATCH '"Levitating"'`).all().map(r => r.rowid);
  assert(ftsHit.length === 1 && ftsHit[0] === levitating, 'FTS index is rebuilt to match the cleaned rows');
  const fresh = cat.upsertTrack({ title: 'Houdini', artist: 'Dua Lipa', durationMs: 185000, provider: 'deezer', providerTrackId: '70', deezerRank: 500000 });
  assert(db.prepare(`SELECT rowid FROM tracks_fts WHERE tracks_fts MATCH '"Houdini"'`).get()?.rowid === fresh.trackId, 'FTS triggers are restored after cleanup');

  // 4. Album enrichment dates every catalog track on the album
  const albumCat = new SqliteCatalog(':memory:');
  const seed = (title, deezerId, albumId) => albumCat.upsertTrack({ title, artist: 'Album Artist', durationMs: 200000, album: 'X', provider: 'deezer', providerTrackId: String(deezerId), deezerRank: 1000, rawMetadata: albumId ? { albumId } : null }).trackId;
  const a1 = seed('First Song', 31, 700);
  const a2 = seed('Second Song', 32, 700);
  const a3 = seed('Third Song', 33, null);
  const gone = seed('Gone Song', 34, 701);
  const albumFetch = routedFetch([
    [/api\.deezer\.com\/album\/700$/, { id: 700, release_date: '2011-05-02', tracks: { data: [{ id: 31 }, { id: 32 }, { id: 33 }] } }],
    [/api\.deezer\.com\/album\/701$/, { error: { type: 'DataException', code: 800 } }],
  ]);
  const albumEnricher = new CatalogEnricher(albumCat, { fetchImpl: albumFetch });
  const albumStats = await albumEnricher.enrichAlbums({ limit: 10 });
  const year = (id) => albumCat.db.prepare('SELECT release_year, release_date, album_checked_at FROM tracks WHERE id = ?').get(id);
  assert(albumStats.checked === 2 && albumStats.yearFilled === 3 && [a1, a2, a3].every(id => year(id).release_year === 2011 && year(id).release_date === '2011-05-02'), 'One album request dates every catalog track on the album');
  assert(year(gone).release_year === null && year(gone).album_checked_at !== null && albumStats.missing === 1, 'Unknown albums are stamped and not retried');
  assert((await albumEnricher.enrichAlbums({ limit: 10 })).checked === 0, 'A second album run has nothing left to do');

  // 5. CLI: --ci exit codes and --fix with a backup
  const cliDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spotyspice-cli-'));
  const cliPath = path.join(cliDir, 'catalog.sqlite');
  const cliCat = new SqliteCatalog(cliPath);
  cliCat.upsertTrack({ title: 'Levitating', artist: 'Dua Lipa', durationMs: 203000, provider: 'deezer', providerTrackId: '1', isrc: 'GBAHT2000942', releaseYear: 2020, deezerRank: 900000 });
  cliCat.db.prepare("INSERT INTO tracks (canonical_title, display_title, artist_id, album_name, duration_ms, language, popularity, version_type) VALUES ('levitating', 'Levitating (Live)', 1, 'A', 200000, 'en', 10, 'live')").run();
  cliCat.close();
  const cli = (...cliArgs) => spawnSync(process.execPath, ['scripts/validate_and_sanitize_db.js', `--db=${cliPath}`, '--no-report', ...cliArgs], { encoding: 'utf8' });
  const ciDirty = cli('--ci', '--min-year-coverage=0', '--min-isrc-coverage=0');
  assert(ciDirty.status === 1 && /Validation gate: FAIL/.test(ciDirty.stdout), '--ci exits 1 on a catalog that fails the gate');
  const fixed = cli('--fix', '--no-vacuum');
  const backups = fs.readdirSync(cliDir).filter(f => f.startsWith('catalog.backup-cleanup-'));
  assert(fixed.status === 0 && backups.length === 1, '--fix writes a VACUUM INTO backup before changing anything');
  const ciClean = cli('--ci', '--min-year-coverage=0', '--min-isrc-coverage=0');
  assert(ciClean.status === 0 && /Validation gate: PASS/.test(ciClean.stdout), '--ci exits 0 once the catalog is clean');
  fs.rmSync(cliDir, { recursive: true, force: true });

  cat.close();
  albumCat.close();
});
