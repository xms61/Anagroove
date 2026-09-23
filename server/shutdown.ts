import { logger } from './logger.js';

/**
 * Single owner of process signal handling. Modules register synchronous cleanup
 * hooks (store flush, WAL checkpoint) instead of installing their own handlers,
 * so no hook is skipped by another handler calling process.exit first.
 */
const hooks: { name: string; fn: () => void }[] = [];
let installed = false;
let ran = false;

function runHooks() {
  if (ran) return;
  ran = true;
  for (const { name, fn } of hooks) {
    try {
      fn();
    } catch (err) {
      logger.error('shutdown', `Hook "${name}" failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

/** Registers a synchronous cleanup hook that runs once on exit, SIGINT or SIGTERM. */
export function onShutdown(name: string, fn: () => void): void {
  hooks.push({ name, fn });
  if (installed) return;
  installed = true;
  process.on('beforeExit', runHooks);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      runHooks();
      process.exit(0);
    });
  }
}
