import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shuffleArray } from '../../shared/shuffle.ts';
import { generateLiveCrossword, type LiveSong } from '../../shared/liveCrossword.ts';

test('Unbiased Fisher-Yates Shuffle', async () => {
  const empty = shuffleArray([]);
  assert.ok(Array.isArray(empty), 'Handles empty array');
  assert.equal(empty.length, 0, 'Handles empty array');

  const single = shuffleArray([42]);
  assert.equal(single.length, 1, 'Handles single element array');
  assert.equal(single[0], 42, 'Handles single element array');

  const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const shuffled = shuffleArray(original);
  assert.equal(shuffled.length, original.length, 'Preserves total array length');
  assert(original.every(x => shuffled.includes(x)), 'Preserves all original elements');

  // Verify non-deterministic behavior across multiple runs
  let differences = 0;
  for (let i = 0; i < 5; i++) {
    const s = shuffleArray(original);
    if (s.some((val, idx) => val !== original[idx])) {
      differences++;
    }
  }
  assert(differences > 0, 'Produces randomized permutations across runs');
});

test('Live Crossword Placement Engine', async () => {
  const tracks = [
    { id: 'track_1', title: 'Get Lucky', artist: 'Daft Punk', audioUrl: 'http://example.com/1.mp3', answer: 'GETLUCKY', clueType: 'Song title' },
    { id: 'track_2', title: 'Starboy', artist: 'The Weeknd', audioUrl: 'http://example.com/2.mp3', answer: 'STARBOY', clueType: 'Song title' },
    { id: 'track_3', title: 'One More Time', artist: 'Daft Punk', audioUrl: 'http://example.com/3.mp3', answer: 'ONEMORETIME', clueType: 'Song title' },
    { id: 'track_4', title: 'Harder', artist: 'Daft Punk', audioUrl: 'http://example.com/4.mp3', answer: 'HARDER', clueType: 'Song title' },
    { id: 'track_5', title: 'Around The World', artist: 'Daft Punk', audioUrl: 'http://example.com/5.mp3', answer: 'AROUNDTHEWORLD', clueType: 'Song title' },
    { id: 'track_6', title: 'Instant Crush', artist: 'Daft Punk', audioUrl: 'http://example.com/6.mp3', answer: 'INSTANTCRUSH', clueType: 'Song title' },
    { id: 'track_7', title: 'Technologic', artist: 'Daft Punk', audioUrl: 'http://example.com/7.mp3', answer: 'TECHNOLOGIC', clueType: 'Song title' },
    { id: 'track_8', title: 'Aerodynamic', artist: 'Daft Punk', audioUrl: 'http://example.com/8.mp3', answer: 'AERODYNAMIC', clueType: 'Song title' },
  ];
  const sampleTracks: LiveSong[] = tracks.map(track => ({ ...track, album: '', albumArt: '', clueText: track.title }));
  const testPuzzle = generateLiveCrossword(sampleTracks, 'Test Puzzle', 6);
  assert(testPuzzle && testPuzzle.clues.length >= 5, 'Generates valid intersecting crossword layout');
  assert(testPuzzle && testPuzzle.rows > 0 && testPuzzle.cols > 0, 'Computes bounding box rows and cols');
  assert.ok(testPuzzle, 'Grid rows match computed bounds');
  assert.equal(testPuzzle.grid.length, testPuzzle.rows, 'Grid rows match computed bounds');
  assert.ok(testPuzzle, 'Grid cols match computed bounds');
  assert.equal(testPuzzle.grid[0].length, testPuzzle.cols, 'Grid cols match computed bounds');
  assert(testPuzzle && testPuzzle.clues.every(c => c.row >= 0 && c.col >= 0), 'All clue coordinates are non-negative');
  assert(testPuzzle && testPuzzle.clues.every(c => (c.crossings || 1) >= 1 && (c.crossings || 1) <= 3), 'All words cross between 1 and 3 times');
  const distinctCrossings = new Set(testPuzzle.clues.map(c => c.crossings || 1));
  assert(distinctCrossings.size >= 2, 'Words feature varied crossing frequencies (e.g. 1, 2, or 3 crossings)');
});
