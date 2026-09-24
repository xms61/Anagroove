/** Unbiased Fisher-Yates shuffle with `rng` in [0, 1). Returns a new array; the input is not changed. */
export function shuffleArray<T>(array: readonly T[], rng: () => number = Math.random): T[] {
  if (!Array.isArray(array) || array.length <= 1) {
    return Array.isArray(array) ? [...array] : [];
  }

  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
