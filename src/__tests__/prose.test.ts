// Enforces the "no em dashes anywhere" rule as a machine check, over all the
// source, sample data, and authored docs in this project. An em dash (U+2014)
// anywhere in these files fails the suite. Uses the escaped code point so this
// test file does not itself contain the character it forbids.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const EM_DASH = "\u2014"; // U+2014 via JS escape; this file avoids the literal character
const ROOT = process.cwd();

const SCAN_DIRS = ["src", join("public", "data"), "scripts"];
const SCAN_FILES = ["README.md", "PROJECT_NOTES.md", "07_LAYERS.config.json"];

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
}

function collectFiles(): string[] {
  const files: string[] = [];
  for (const d of SCAN_DIRS) {
    try {
      walk(join(ROOT, d), files);
    } catch {
      // directory may not exist in every checkout state; skip
    }
  }
  for (const f of SCAN_FILES) files.push(join(ROOT, f));
  return files;
}

describe("no em dashes", () => {
  it("no authored source, sample, or doc file contains an em dash", () => {
    const offenders: string[] = [];
    for (const file of collectFiles()) {
      let text: string;
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      if (text.includes(EM_DASH)) offenders.push(file.replace(ROOT + "/", ""));
    }
    expect(offenders, `files containing an em dash: ${offenders.join(", ")}`).toEqual([]);
  });
});
