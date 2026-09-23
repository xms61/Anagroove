/**
 * The markdown report of `npm run db:validate`: catalog statistics, the cleanup dry run and the
 * validation gate. The checks themselves live in catalogGate.js (hard limits) and
 * catalogCleanup.js (what a cleanup would change); this module only measures and renders.
 */

/** Inventory, language/decade/popularity distributions and genre coverage. */
export function catalogStatistics(db) {
  const count = (sql) => Number(db.prepare(sql).get().c) || 0;
  const tracks = count('SELECT COUNT(*) AS c FROM tracks');
  const artists = count('SELECT COUNT(*) AS c FROM artists');
  const share = (n, total = tracks) => (total ? Number(((n / total) * 100).toFixed(1)) : 0);
  const distribution = (sql) => db.prepare(sql).all().map(row => ({ ...row, share: share(row.count) }));

  const genreCounts = new Map();
  let artistsWithGenres = 0;
  for (const { genres_json: json } of db.prepare("SELECT genres_json FROM artists WHERE genres_json IS NOT NULL AND json_valid(genres_json)").all()) {
    const genres = JSON.parse(json);
    if (!Array.isArray(genres) || genres.length === 0) continue;
    artistsWithGenres++;
    for (const genre of genres) genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
  }

  return {
    overview: {
      tracks,
      artists,
      samples: count('SELECT COUNT(*) AS c FROM track_samples'),
      providerLinks: count('SELECT COUNT(*) AS c FROM track_providers'),
      tracksWithSample: share(count('SELECT COUNT(DISTINCT track_id) AS c FROM track_samples')),
      releaseYearKnown: share(count('SELECT COUNT(*) AS c FROM tracks WHERE release_year IS NOT NULL')),
      isrcKnown: share(count('SELECT COUNT(*) AS c FROM tracks WHERE isrc IS NOT NULL')),
      artistsEnriched: share(count('SELECT COUNT(*) AS c FROM artists WHERE enriched_at IS NOT NULL'), artists),
    },
    providers: db.prepare(`
      SELECT provider, COUNT(*) AS links, COUNT(DISTINCT track_id) AS tracks FROM track_providers GROUP BY provider ORDER BY links DESC
    `).all(),
    languages: distribution('SELECT language, COUNT(*) AS count FROM tracks GROUP BY language ORDER BY count DESC'),
    decades: distribution(`
      SELECT CASE WHEN release_year IS NULL THEN 'unknown' ELSE (release_year / 10 * 10) || 's' END AS decade, COUNT(*) AS count
      FROM tracks GROUP BY decade ORDER BY decade
    `),
    popularity: distribution(`
      SELECT MIN(popularity / 10 * 10, 90) AS bucket, COUNT(*) AS count FROM tracks GROUP BY bucket ORDER BY bucket
    `),
    genres: {
      artistsWithGenres,
      share: share(artistsWithGenres, artists),
      top: [...genreCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([genre, n]) => ({ genre, artists: n })),
    },
    topArtists: db.prepare(`
      SELECT a.display_name AS artist, COUNT(*) AS tracks, a.fans_count AS fans
      FROM tracks t JOIN artists a ON a.id = t.artist_id GROUP BY a.id ORDER BY tracks DESC LIMIT 25
    `).all(),
  };
}

/** One-line summary of a cleanup step's counters. */
function describeStep(step) {
  const parts = Object.entries(step)
    .filter(([key, value]) => typeof value === 'number' && key !== 'ms')
    .map(([key, value]) => `${key}: ${value.toLocaleString()}`);
  if (step.reasons) {
    parts.push(...Object.entries(step.reasons).filter(([, value]) => value > 0).map(([key, value]) => `${key}: ${value.toLocaleString()}`));
  }
  if (step.rebuilt) parts.push('rebuilt');
  return parts.join(', ') || '—';
}

function describeExample(example) {
  if (example.merged !== undefined) return `artist \`${example.merged}\` merged into \`${example.kept}\``;
  if (example.kept !== undefined) {
    const who = example.artist ? `**${example.artist}** ` : '';
    return `${who}kept \`${example.kept}\`, removed ${example.removed.map(r => `\`${r}\``).join(', ')}`;
  }
  if (example.copied !== undefined) return `**${example.artist}**: ${example.copied} of ${example.tracks} titles also recorded by better-known artists`;
  return `**${example.artist}** – \`${example.title}\`${example.detail ? ` (${example.detail})` : ''} · pop ${example.popularity}`;
}

const table = (header, rows) => [header, header.replace(/[^|]+/g, ' --- '), ...rows].join('\n');

function renderCleanup(cleanup) {
  if (!cleanup) return '_Cleanup was not evaluated._';
  const examples = cleanup.steps.flatMap(step => {
    if (!step.examples) return [];
    const groups = Array.isArray(step.examples) ? { [step.name]: step.examples } : step.examples;
    return Object.entries(groups)
      .filter(([, items]) => items.length > 0)
      .map(([label, items]) => `**${step.name === label ? label : `${step.name} / ${label}`}**\n${items.map(item => `- ${describeExample(item)}`).join('\n')}`);
  });
  const { before, after } = cleanup;
  return [
    cleanup.applied ? '**Applied.**' : '**Dry run:** what `npm run db:sanitize` would change (computed, then rolled back).',
    `Tracks ${before.tracks.toLocaleString()} → **${after.tracks.toLocaleString()}**, artists ${before.artists.toLocaleString()} → **${after.artists.toLocaleString()}**, samples ${before.samples.toLocaleString()} → ${after.samples.toLocaleString()}, provider links ${before.providers.toLocaleString()} → ${after.providers.toLocaleString()}`,
    table('| Step | Changes | Time |', cleanup.steps.map(step => `| \`${step.name}\` | ${describeStep(step)} | ${step.ms.toLocaleString()} ms |`)),
    examples.length ? `### Examples (most popular first)\n\n${examples.join('\n\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

function renderGate(gate) {
  if (!gate) return '_Gate was not evaluated._';
  const value = (v) => (Number.isInteger(v) ? v.toLocaleString() : v.toFixed(4));
  return `${gate.ok ? '**PASS**' : '**FAIL**'}\n\n${table('| Check | OK | Value | Limit |',
    gate.checks.map(check => `| ${check.label} | ${check.ok ? 'yes' : 'NO'} | ${value(check.value)} | ${check.limit} |`))}`;
}

/** The markdown report. */
export function renderValidationReport({ dbPath, stats, cleanup = null, gate = null }) {
  const { overview } = stats;
  return `# Anagroove catalog validation

Generated ${new Date().toISOString()} for \`${dbPath}\`.

## 1. Validation gate (\`npm run db:validate -- --ci\`)

${renderGate(gate)}

## 2. Cleanup (\`npm run db:sanitize\`)

${renderCleanup(cleanup)}

## 3. Inventory

${table('| Metric | Value |', [
    `| Tracks | ${overview.tracks.toLocaleString()} |`,
    `| Artists | ${overview.artists.toLocaleString()} (${overview.artistsEnriched}% enriched) |`,
    `| Samples / provider links | ${overview.samples.toLocaleString()} / ${overview.providerLinks.toLocaleString()} |`,
    `| Tracks with a sample | ${overview.tracksWithSample}% |`,
    `| Release year known | ${overview.releaseYearKnown}% |`,
    `| ISRC known | ${overview.isrcKnown}% |`,
  ])}

${table('| Provider | Links | Tracks |', stats.providers.map(p => `| ${p.provider} | ${p.links.toLocaleString()} | ${p.tracks.toLocaleString()} |`))}

## 4. Languages, decades, popularity

${table('| Language | Tracks | Share |', stats.languages.map(l => `| ${l.language} | ${l.count.toLocaleString()} | ${l.share}% |`))}

${table('| Decade | Tracks | Share |', stats.decades.map(d => `| ${d.decade} | ${d.count.toLocaleString()} | ${d.share}% |`))}

${table('| Popularity (percentile) | Tracks | Share |', stats.popularity.map(p => `| ${p.bucket}–${p.bucket + (p.bucket === 90 ? 10 : 9)} | ${p.count.toLocaleString()} | ${p.share}% |`))}

## 5. Genres and artists

${stats.genres.artistsWithGenres.toLocaleString()} artists (${stats.genres.share}%) have genres.

${table('| Genre | Artists |', stats.genres.top.map(g => `| ${g.genre} | ${g.artists.toLocaleString()} |`))}

${table('| Most tracks | Tracks | Fans |', stats.topArtists.map(a => `| ${a.artist} | ${a.tracks.toLocaleString()} | ${(a.fans || 0).toLocaleString()} |`))}
`;
}
