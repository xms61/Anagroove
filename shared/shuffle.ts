/** Unbiased Fisher-Yates shuffle. Returns a new array; the input is not changed. */
export function shuffleArray<T>(array: readonly T[]): T[] {
  if (!Array.isArray(array) || array.length <= 1) {
    return Array.isArray(array) ? [...array] : [];
  }

  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
