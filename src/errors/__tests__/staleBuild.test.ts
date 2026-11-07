import { describe, it, expect, beforeEach, vi } from "vitest";
import { isStaleBuildError, reloadForNewVersion } from "../staleBuild";

describe("stale build recovery", () => {
  it("recognizes each browser's missing-chunk error, and nothing else", () => {
    expect(isStaleBuildError(new TypeError("Failed to fetch dynamically imported module: https://aavery-1.github.io/assets/SchoolListView-IXLvSCWe.js"))).toBe(true);
    expect(isStaleBuildError(new TypeError("error loading dynamically imported module"))).toBe(true);
    expect(isStaleBuildError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isStaleBuildError(new Error("Cannot read properties of undefined"))).toBe(false);
  });

  describe("reload guard", () => {
    beforeEach(() => sessionStorage.clear());

    it("reloads once with a cache-busting query, then refuses to loop within 30 seconds", () => {
      const nav = vi.fn();
      expect(reloadForNewVersion(nav)).toBe(true);
      expect(nav).toHaveBeenCalledTimes(1);
      expect(String(nav.mock.calls[0][0])).toMatch(/[?&]v=\d+/);
      expect(reloadForNewVersion(nav)).toBe(false);
      expect(nav).toHaveBeenCalledTimes(1);
    });
  });
});
