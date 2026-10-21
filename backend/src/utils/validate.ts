import { badRequest } from './errors';

type Input = Record<string, unknown> | null | undefined;

const missing = (v: unknown) => v === undefined || v === null || v === '';

export function str(obj: Input, key: string, opts: { optional: true; max?: number }): string | undefined;
export function str(obj: Input, key: string, opts?: { optional?: false; max?: number }): string;
export function str(obj: Input, key: string, { optional = false, max = 200 } = {}): string | undefined {
  const v = obj?.[key];
  if (missing(v)) {
    if (optional) return undefined;
    throw badRequest(`"${key}" is required`);
  }
  if (typeof v !== 'string') throw badRequest(`"${key}" must be a string`);
  const t = v.trim();
  if (t.length > max) throw badRequest(`"${key}" must be at most ${max} characters`);
  return t;
}

export function int(obj: Input, key: string, opts: { optional: true; min?: number; max?: number }): number | undefined;
export function int(obj: Input, key: string, opts?: { optional?: false; min?: number; max?: number }): number;
export function int(obj: Input, key: string, { optional = false, min = -Infinity, max = Infinity } = {}): number | undefined {
  let v = obj?.[key];
  if (missing(v)) {
    if (optional) return undefined;
    throw badRequest(`"${key}" is required`);
  }
  // Make often sends numbers as strings
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) v = Number(v.trim());
  if (typeof v !== 'number' || !Number.isInteger(v)) throw badRequest(`"${key}" must be a whole number`);
  if (v < min || v > max) throw badRequest(`"${key}" must be between ${min} and ${max}`);
  return v;
}

export function money(obj: Input, key: string, opts: { optional: true }): number | undefined;
export function money(obj: Input, key: string, opts?: { optional?: false }): number;
export function money(obj: Input, key: string, { optional = false } = {}): number | undefined {
  let v = obj?.[key];
  if (missing(v)) {
    if (optional) return undefined;
    throw badRequest(`"${key}" is required`);
  }
  if (typeof v === 'string') v = Number(v);
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw badRequest(`"${key}" must be a positive number`);
  return Math.round(v * 100) / 100;
}

export function email(obj: Input, key: string): string {
  const v = str(obj, key, { max: 254 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw badRequest(`"${key}" must be an email address`);
  return v;
}

export function oneOf<T extends string>(obj: Input, key: string, allowed: readonly T[]): T {
  const v = str(obj, key);
  if (!(allowed as readonly string[]).includes(v)) throw badRequest(`"${key}" must be one of: ${allowed.join(', ')}`);
  return v as T;
}

export function httpUrl(obj: Input, key: string): string {
  const v = str(obj, key, { max: 2048 });
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    throw badRequest(`"${key}" must be a valid URL`);
  }
  if (!['http:', 'https:'].includes(u.protocol)) throw badRequest(`"${key}" must use http or https`);
  return u.toString();
}
