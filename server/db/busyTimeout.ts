/**
 * busy_timeout for new catalog connections (catalog.sqlite, anime_catalog.sqlite). Scripts wait
 * out another writer's transaction; the web server's catalog writes are best-effort caching, and
 * node:sqlite blocks the event loop while it waits, so the server lowers it before first use.
 */
let busyTimeoutMs = 10000;

export function setCatalogBusyTimeout(ms: number): void {
  busyTimeoutMs = Math.max(0, Math.trunc(ms));
}

export function catalogBusyTimeout(): number {
  return busyTimeoutMs;
}
