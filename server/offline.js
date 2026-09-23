/**
 * SPOTYSPICE_OFFLINE=1 serves puzzles from the local catalog only: no Deezer/iTunes fallback and
 * no preview lookups (previews answer 404). Used by the Playwright smoke test and offline dev.
 */
export function isOfflineMode() {
  return process.env.SPOTYSPICE_OFFLINE === '1';
}
