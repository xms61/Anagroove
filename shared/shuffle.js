/**
 * Unbiased Fisher-Yates shuffle algorithm.
 * Returns a new array with elements randomly shuffled.
 *
 * @template T
 * @param {T[]} array
 * @returns {T[]}
 */
export function shuffleArray(array) {
  if (!Array.isArray(array) || array.length <= 1) {
    return Array.isArray(array) ? [...array] : [];
  }

  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }

  return result;
}
