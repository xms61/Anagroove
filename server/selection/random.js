/**
 * Randomness for song selection: a seedable PRNG and weighted ordering without replacement.
 * A seed makes a puzzle reproducible; the seed is hashed once, never inside a comparator.
 */
import crypto from 'crypto';

/**
 * sfc32 generator seeded from a string (SHA-256 of the seed). Without a seed: Math.random.
 * @returns {() => number} uniform in [0, 1)
 */
export function createRng(seed) {
  if (seed === undefined || seed === null || !String(seed).trim()) return Math.random;
  const hash = crypto.createHash('sha256').update(String(seed).trim()).digest();
  let a = hash.readUInt32LE(0);
  let b = hash.readUInt32LE(4);
  let c = hash.readUInt32LE(8);
  let d = hash.readUInt32LE(12);
  return () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/**
 * Efraimidis-Spirakis weighted sampling without replacement: each item gets the key
 * u^(1/w) (computed as ln(u)/w) and items are ordered by key, highest first. Taking the first
 * k items is a weighted sample of size k; weight 1 for every item is a uniform shuffle.
 */
export function weightedOrder(items, weightOf, rng = Math.random) {
  return items
    .map(item => {
      const weight = Math.max(Number(weightOf(item)) || 0, 1e-6);
      const u = rng() || Number.MIN_VALUE;
      return { item, key: Math.log(u) / weight };
    })
    .sort((x, y) => y.key - x.key)
    .map(entry => entry.item);
}
