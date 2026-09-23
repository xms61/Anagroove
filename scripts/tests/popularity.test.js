import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deezerRankToScore, normalizePopularity } from '../../server/db/trackNormalization.js';
import { POPULARITY_SAMPLING, popularityWeight } from '../../server/selection/candidates.js';

test('Deezer rank maps onto 0-100, monotonic and clamped', () => {
  let previous = -1;
  for (let rank = 1; rank <= 1e8; rank *= 1.5) {
    const score = deezerRankToScore(rank);
    assert.ok(Number.isInteger(score) && score >= 0 && score <= 100, `rank ${rank} -> ${score} is an integer in 0-100`);
    assert.ok(score >= previous, `rank ${rank} does not score below a lower rank`);
    previous = score;
  }
  for (const bad of [0, -5, NaN, null, undefined, 'abc']) assert.equal(deezerRankToScore(bad), 0);
});

test('calibration anchors: Deezer rank vs Spotify popularity', () => {
  // 20*log10(rank) - 39: the median Deezer rank of tracks that also carry a Spotify score (~562k) sits at ~76
  assert.equal(deezerRankToScore(1_000), 21);
  assert.equal(deezerRankToScore(100_000), 61);
  assert.equal(deezerRankToScore(500_000), 75);
  assert.equal(deezerRankToScore(1_000_000), 81);
  assert.equal(deezerRankToScore(5_000_000), 95);
});

test('normalizePopularity prefers Spotify, then Deezer rank, then legacy values', () => {
  assert.equal(normalizePopularity({ spotifyPopularity: 82, deezerRank: 10 }), 82);
  assert.equal(normalizePopularity({ spotifyPopularity: 150 }), 100);
  assert.equal(normalizePopularity({ spotifyPopularity: -3 }), 0);
  assert.equal(normalizePopularity({ deezerRank: 1_000_000 }), 81);
  assert.equal(normalizePopularity({ popularity: 55 }), 55, 'a 0-100 legacy value is kept');
  assert.equal(normalizePopularity({ popularity: 950_000 }), deezerRankToScore(950_000), 'a legacy value above 100 is a Deezer rank');
  assert.equal(normalizePopularity({}), 0);
});

test('selection weights follow the popularity setting', () => {
  assert.equal(POPULARITY_SAMPLING.obscure.alpha, 0);
  assert.equal(POPULARITY_SAMPLING.pure.alpha, 0);
  const balanced = POPULARITY_SAMPLING.balanced.alpha;
  const mainstream = POPULARITY_SAMPLING.mainstream.alpha;
  assert.ok(mainstream > balanced && balanced > 0);
  assert.equal(popularityWeight(90, 0), popularityWeight(5, 0), 'alpha 0 is uniform');
  assert.ok(popularityWeight(90, mainstream) > popularityWeight(90, balanced) * 10);
});
