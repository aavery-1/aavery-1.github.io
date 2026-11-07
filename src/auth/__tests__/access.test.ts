// The password gate's client side, against a stubbed Supabase. Locks the
// contract with supabase/002_session_gate.sql: unlock() returns a token that is
// then used to read private data; HTTP 429 means rate limited; a 404 (migration
// not run yet) falls back to the old yes/no check instead of locking people out.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Call = { url: string; body: Record<string, unknown> };

function stubServer(routes: Record<string, (body: Record<string, unknown>) => { status: number; json?: unknown }>) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
    calls.push({ url, body });
    const fn = Object.keys(routes).find((k) => url.endsWith(k));
    const r = fn ? routes[fn](body) : { status: 404 };
    return new Response(r.json === undefined ? null : JSON.stringify(r.json), { status: r.status });
  }));
  return calls;
}

async function loadAccess() {
  vi.resetModules();
  vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon");
  return import("../access");
}

const TOKEN = "a".repeat(64);

describe("access gate", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("unlocks with a token and reads private data with it", async () => {
    const calls = stubServer({
      "/rpc/unlock": () => ({ status: 200, json: TOKEN }),
      "/rpc/private_data": (b) => ({ status: 200, json: b.token === TOKEN ? { kipp_requested_msids: ["99-0001"] } : null }),
    });
    const access = await loadAccess();
    expect(access.gateConfigured).toBe(true);
    await expect(access.unlock("right")).resolves.toEqual({ kipp_requested_msids: ["99-0001"] });
    expect(calls.map((c) => c.url.split("/").pop())).toEqual(["unlock", "private_data"]);
    expect(access.storedToken()).toBe(TOKEN);
  });

  it("returns null for a wrong password and stores nothing", async () => {
    stubServer({ "/rpc/unlock": () => ({ status: 200, json: null }) });
    const access = await loadAccess();
    await expect(access.unlock("wrong")).resolves.toBeNull();
    expect(access.storedToken()).toBeNull();
  });

  it("reports rate limiting distinctly", async () => {
    stubServer({ "/rpc/unlock": () => ({ status: 429, json: { message: "too_many_attempts" } }) });
    const access = await loadAccess();
    await expect(access.unlock("x")).rejects.toMatchObject({ kind: "rate-limited" });
  });

  it("falls back to check_access before the migration has run", async () => {
    stubServer({ "/rpc/check_access": () => ({ status: 200, json: true }) });
    const access = await loadAccess();
    await expect(access.unlock("right")).resolves.toEqual({});
  });

  it("drops an expired session on resume so the password screen shows", async () => {
    sessionStorage.setItem("fft_session", TOKEN);
    stubServer({ "/rpc/private_data": () => ({ status: 200, json: null }) });
    const access = await loadAccess();
    await expect(access.resumeSession()).resolves.toBeNull();
    expect(access.storedToken()).toBeNull();
  });

  it("a hand-set browser flag does not unlock anything", async () => {
    sessionStorage.setItem("fft_unlocked", "1"); // the old bypass
    stubServer({});
    const access = await loadAccess();
    await expect(access.resumeSession()).resolves.toBeNull();
  });
});
