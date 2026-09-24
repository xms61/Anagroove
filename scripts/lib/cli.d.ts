// Types for cli.js, which stays JavaScript while the catalog enrichment runs (T7 moves it to .ts)
import type { parseArgs, ParseArgsOptionsConfig } from 'node:util';

type FlagValues<T extends ParseArgsOptionsConfig> = ReturnType<
  typeof parseArgs<{ args: string[]; options: T; strict: true; allowPositionals: false }>
>['values'];

type Flags = Record<string, unknown>;

export class UsageError extends Error {}

export function parseFlags<T extends ParseArgsOptionsConfig>(
  options: T,
  io?: { argv?: string[]; env?: NodeJS.ProcessEnv },
): FlagValues<T>;

export function intFlag(flags: Flags, name: string): number | undefined;

export function numberFlag(flags: Flags, name: string): number | undefined;

export function listFlag<T extends string>(flags: Flags, name: string, allowed: readonly T[]): T[] | undefined;

export function parseOrExit<T>(parse: () => T, usage: string): T;
