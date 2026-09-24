/**
 * Defers constructing a database-backed singleton until it is first used, so importing a
 * module (tests, scripts, type checks) never opens — or migrates — a database file.
 * `instance` is a proxy; `peek` returns the real object only if it has already been created.
 */
export function lazySingleton<T extends object>(factory: () => T): { instance: T; peek: () => T | null } {
  let real: T | null = null;
  const resolve = (): T => (real ??= factory());

  const instance = new Proxy(Object.create(null), {
    get(_target, prop) {
      const target = resolve();
      const value = Reflect.get(target, prop);
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set(_target, prop, value) {
      Reflect.set(resolve(), prop, value);
      return true;
    },
    has(_target, prop) {
      return prop in resolve();
    },
  });

  return { instance, peek: () => real };
}
