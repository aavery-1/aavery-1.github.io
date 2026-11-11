// The shared engine and its data are copies of Grove's (scripts/sync-shared-geo.mjs in Grove). Their fingerprints
// must match the ones recorded at sync time, so a local edit here can never make the two tools disagree. A folder is
// fingerprinted as a tree hash: SHA-256 over "<relative path> <file SHA-256>" lines, sorted by path.
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");
const manifest = JSON.parse(readFileSync(join(ROOT, "src", "shared-geo", "MANIFEST.json"), "utf8")) as { files: Record<string, { sha256?: string; tree_sha256?: string }> };
const sha = (f: string) => createHash("sha256").update(readFileSync(f)).digest("hex");
const files = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? files(join(d, n)) : [join(d, n)]));
const treeSha = (d: string) => createHash("sha256").update(files(d).map((f) => `${relative(d, f).split(sep).join("/")} ${sha(f)}`).sort().join("\n")).digest("hex");

describe("shared geo copies are unedited", () => {
  it.each(Object.entries(manifest.files))("%s matches Grove's master", (path, { sha256, tree_sha256 }) => {
    if (tree_sha256) expect(treeSha(join(ROOT, path))).toBe(tree_sha256);
    else expect(sha(join(ROOT, path))).toBe(sha256);
  });
});
