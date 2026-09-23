/**
 * Defers constructing a database-backed singleton until it is first used, so importing a
 * module (tests, scripts, type checks) never opens — or migrates — a database file.
 *
 * @template T
 * @param {() => T} factory
 * @returns {{ instance: T, peek: () => T | null }} `instance` is a proxy; `peek` returns the
 *   real object only if it has already been created.
 */
export function lazySingleton(factory) {
  let real = null;
  const resolve = () => (real ??= factory());

  const instance = new Proxy(Object.create(null), {
    get(_target, prop) {
      const target = resolve();
      const value = target[prop];
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set(_target, prop, value) {
      resolve()[prop] = value;
      return true;
    },
    has(_target, prop) {
      return prop in resolve();
    },
  });

  return { instance, peek: () => real };
}
