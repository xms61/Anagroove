import { parseArgs } from 'node:util';

export class UsageError extends Error {}

/**
 * Strict flag parsing for scripts (Node's util.parseArgs). Throws a UsageError for an unknown
 * flag or a missing value, and when npm consumed the flags because they were passed without
 * `--` (`npm run x --flag` hands the script no arguments and sets npm_config_flag instead).
 * Both `--name=value` and `--name value` work.
 */
export function parseFlags(options, { argv = process.argv.slice(2), env = process.env } = {}) {
  if (argv.length === 0) {
    const swallowed = Object.keys(options).filter(name => env[npmConfigKey(name)] !== undefined);
    if (swallowed.length > 0) {
      throw new UsageError(`npm consumed ${swallowed.map(name => `--${name}`).join(', ')}. Pass flags after "--": npm run <script> -- --flag`);
    }
  }
  try {
    return parseArgs({ args: argv, options, strict: true, allowPositionals: false }).values;
  } catch (err) {
    throw new UsageError(err.message);
  }
}

/** Whole number >= 0 from a string flag; undefined when the flag is absent. */
export function intFlag(flags, name) {
  const value = flags[name];
  if (value === undefined) return undefined;
  const number = Number(value);
  if (value.trim() === '' || !Number.isInteger(number) || number < 0) {
    throw new UsageError(`--${name} needs a whole number, got "${value}"`);
  }
  return number;
}

/** Number from a string flag (e.g. a 0-1 threshold); undefined when the flag is absent. */
export function numberFlag(flags, name) {
  const value = flags[name];
  if (value === undefined) return undefined;
  const number = Number(value);
  if (value.trim() === '' || !Number.isFinite(number)) {
    throw new UsageError(`--${name} needs a number, got "${value}"`);
  }
  return number;
}

/** Comma-separated list flag, checked against the allowed values; undefined when absent. */
export function listFlag(flags, name, allowed) {
  const value = flags[name];
  if (value === undefined) return undefined;
  const items = value.split(',').map(item => item.trim()).filter(Boolean);
  const unknown = items.filter(item => !allowed.includes(item));
  if (items.length === 0 || unknown.length > 0) {
    throw new UsageError(`--${name}: unknown value(s) ${unknown.join(', ') || '(empty)'}. Allowed: ${allowed.join(', ')}`);
  }
  return items;
}

/** Runs `parse` and exits with the usage text when it throws a UsageError. */
export function parseOrExit(parse, usage) {
  try {
    return parse();
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    console.error(`${err.message}\n\n${usage.trim()}`);
    process.exit(1);
  }
}

function npmConfigKey(name) {
  return `npm_config_${name.replace(/^no-/, '').replace(/-/g, '_')}`;
}
