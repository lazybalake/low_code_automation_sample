'use strict';

const { badRequest } = require('./errors');

function str(obj, key, { optional = false, max = 200 } = {}) {
  const v = obj?.[key];
  if (v === undefined || v === null || v === '') {
    if (optional) return undefined;
    throw badRequest(`"${key}" is required`);
  }
  if (typeof v !== 'string') throw badRequest(`"${key}" must be a string`);
  const t = v.trim();
  if (t.length > max) throw badRequest(`"${key}" must be at most ${max} characters`);
  return t;
}

function int(obj, key, { optional = false, min = -Infinity, max = Infinity } = {}) {
  let v = obj?.[key];
  if (v === undefined || v === null || v === '') {
    if (optional) return undefined;
    throw badRequest(`"${key}" is required`);
  }
  // Zapier and Make often send numbers as strings.
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) v = Number(v.trim());
  if (!Number.isInteger(v)) throw badRequest(`"${key}" must be a whole number`);
  if (v < min || v > max) throw badRequest(`"${key}" must be between ${min} and ${max}`);
  return v;
}

function money(obj, key, { optional = false } = {}) {
  let v = obj?.[key];
  if (v === undefined || v === null || v === '') {
    if (optional) return undefined;
    throw badRequest(`"${key}" is required`);
  }
  if (typeof v === 'string') v = Number(v);
  if (!Number.isFinite(v) || v < 0) throw badRequest(`"${key}" must be a positive number`);
  return Math.round(v * 100) / 100;
}

function email(obj, key, opts) {
  const v = str(obj, key, { ...opts, max: 254 });
  if (v !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw badRequest(`"${key}" must be an email address`);
  return v;
}

function oneOf(obj, key, allowed, { optional = false } = {}) {
  const v = str(obj, key, { optional });
  if (v !== undefined && !allowed.includes(v)) {
    throw badRequest(`"${key}" must be one of: ${allowed.join(', ')}`);
  }
  return v;
}

function httpUrl(obj, key) {
  const v = str(obj, key, { max: 2048 });
  let u;
  try {
    u = new URL(v);
  } catch {
    throw badRequest(`"${key}" must be a valid URL`);
  }
  if (!['http:', 'https:'].includes(u.protocol)) throw badRequest(`"${key}" must use http or https`);
  return u.toString();
}

module.exports = { str, int, money, email, oneOf, httpUrl };
