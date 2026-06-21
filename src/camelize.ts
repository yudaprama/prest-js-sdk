/**
 * Snake-case → camelCase key mapping.
 *
 * pREST returns Postgres column names verbatim (snake_case). Most JS/TS
 * consumers (React stores, serializers, UI components) expect camelCase.
 * These helpers let the SDK bridge the boundary once, at the client layer,
 * instead of forcing every call site to map manually.
 */

export function camelizeKey(key: string): string {
  // Fast path: no underscore → already camelCase-ish.
  if (key.indexOf("_") === -1) return key;
  let out = "";
  let upper = false;
  for (let i = 0; i < key.length; i++) {
    const ch = key[i];
    if (ch === "_") {
      upper = true;
      continue;
    }
    out += upper ? ch.toUpperCase() : ch;
    upper = false;
  }
  return out;
}

/**
 * Recursively rewrite an object's keys from snake_case to camelCase.
 *
 * - Plain objects: keys are rewritten.
 * - Arrays: each element is rewritten.
 * - Primitives, Date, null: returned as-is.
 *
 * Values are NOT transformed — only keys. `Date` strings from pREST stay
 * strings; the caller (or a serializer) decides when to `new Date()`.
 */
export function camelizeKeys<T = unknown>(input: unknown): T {
  if (input === null || input === undefined) return input as T;
  if (Array.isArray(input)) {
    return input.map((v) => camelizeKeys(v)) as unknown as T;
  }
  if (typeof input === "object") {
    if (input instanceof Date) return input as unknown as T;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[camelizeKey(k)] = camelizeKeys(v);
    }
    return out as T;
  }
  return input as T;
}
