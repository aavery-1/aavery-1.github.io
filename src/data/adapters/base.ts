// Shared adapter plumbing. Every adapter isolates one data source behind the
// same interface, so swapping sample data for a real source is a one-file edit
// here and the UI never changes.

import type { LoadResult } from "../types";

// Fetch and parse a JSON/GeoJSON file, then run it through a validator. On any
// failure this resolves to a LoadResult with ok:false and a specific message,
// never a throw that blanks the app. The validator itself throws a SchemaError
// with the offending field; we surface that message.
export async function loadValidated<T>(
  url: string,
  validate: (raw: unknown) => T,
  meta: { source: string; vintage: string },
): Promise<LoadResult<T>> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return fail(`Could not load ${url}: HTTP ${res.status} ${res.statusText}`, meta);
    }
    const raw = (await res.json()) as unknown;
    const data = validate(raw);
    return { ok: true, data, error: null, source: meta.source, vintage: meta.vintage };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(message, meta);
  }
}

export function fail<T>(message: string, meta: { source: string; vintage: string }): LoadResult<T> {
  // Console error names the field/file for debugging; the UI shows the message
  // in the layer's error chip.
  console.error(message);
  return { ok: false, data: null, error: message, source: meta.source, vintage: meta.vintage };
}

// A layer that has no sample committed yet is not an error. It reports a
// specific "sample not yet included" state that the panel shows as a disabled
// row with a tooltip, per 07_LAYERS.config.json notes.
export function noSample<T>(meta: { source: string; vintage: string }): LoadResult<T> {
  return {
    ok: false,
    data: null,
    error: "Sample not yet included for this layer. See PROJECT_NOTES.md for the ordered TODO to wire the real source.",
    source: meta.source,
    vintage: meta.vintage,
  };
}
