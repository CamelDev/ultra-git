/// <reference types="bun" />
/**
 * Unit tests for update-check business logic.
 *
 * These tests exercise the version comparison and update-check decision logic
 * used by `src/main/update.ts` without launching Electron.
 * They use Bun's native test runner.
 *
 * Run: bun test src/main/__tests__/update.test.ts
 */

import { describe, it, expect } from "bun:test";

// ─── Helpers that mirror update.ts logic exactly ─────────────────────────────
// We duplicate the logic here (rather than importing from Electron main process
// files that depend on `electron` globals) so tests can run in plain Node/Bun.

export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^[vV]/, "").split(".").map(n => parseInt(n, 10) || 0);
  const pb = b.replace(/^[vV]/, "").split(".").map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

interface UpdateInfo {
  latest: string;
  url: string;
  publishedAt: string | null;
  notes: string;
}

interface UpdateSettings {
  skippedVersion?: string | null;
  lastCheckedAt?: string;
}

// Mirrors checkForUpdates() decision logic
function decideUpdate(
  currentVersion: string,
  serverResponse: { latest?: string; url?: string; publishedAt?: string | null; notes?: string } | null,
  settings: { updates?: UpdateSettings } = {}
): UpdateInfo | null {
  if (!serverResponse?.latest) return null;
  if (compareVersions(serverResponse.latest, currentVersion) <= 0) return null;
  if (serverResponse.latest === settings.updates?.skippedVersion) return null;

  return {
    latest: serverResponse.latest,
    url: serverResponse.url || "",
    publishedAt: serverResponse.publishedAt ?? null,
    notes: serverResponse.notes ?? "",
  };
}

// Mirrors queryUpdateServer() decision logic
function decideQuery(
  currentVersion: string,
  serverResponse: { latest?: string; url?: string; publishedAt?: string | null; notes?: string } | null,
  settings: { updates?: UpdateSettings } = {}
): { contacted: boolean; update: UpdateInfo | null } {
  if (!serverResponse?.latest) return { contacted: false, update: null };
  if (compareVersions(serverResponse.latest, currentVersion) <= 0) return { contacted: true, update: null };
  if (serverResponse.latest === settings.updates?.skippedVersion) return { contacted: true, update: null };

  return {
    contacted: true,
    update: {
      latest: serverResponse.latest,
      url: serverResponse.url || "",
      publishedAt: serverResponse.publishedAt ?? null,
      notes: serverResponse.notes ?? "",
    },
  };
}

// Mirrors scheduleUpdateChecks tick logic
function shouldRecheck(lastCheckedAt: string | undefined, now: number, recheckAfterMs: number): boolean {
  if (!lastCheckedAt) return true;
  const parsed = Date.parse(lastCheckedAt);
  if (isNaN(parsed)) return true; // corrupt timestamp → recheck
  return now - parsed >= recheckAfterMs;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("compareVersions", () => {
  it("returns 0 for equal versions", () => {
    expect(compareVersions("1.0.10", "1.0.10")).toBe(0);
  });

  it("detects patch differences", () => {
    expect(compareVersions("1.0.11", "1.0.10")).toBeGreaterThan(0);
    expect(compareVersions("1.0.10", "1.0.11")).toBeLessThan(0);
  });

  it("detects minor differences", () => {
    expect(compareVersions("1.1.0", "1.0.10")).toBeGreaterThan(0);
    expect(compareVersions("1.0.10", "1.1.0")).toBeLessThan(0);
  });

  it("detects major differences", () => {
    expect(compareVersions("2.0.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.9.9", "2.0.0")).toBeLessThan(0);
  });

  it("handles v-prefixed tags", () => {
    expect(compareVersions("v1.1.0", "1.1.0")).toBe(0);
    expect(compareVersions("V1.1.0", "1.1.0")).toBe(0);
    expect(compareVersions("v1.1.0", "1.0.10")).toBeGreaterThan(0);
  });

  it("handles malformed input gracefully", () => {
    expect(compareVersions("", "")).toBe(0);
    expect(compareVersions("abc", "1.0.0")).toBeLessThan(0);
    expect(compareVersions("1.0.0", "abc")).toBeGreaterThan(0);
  });

  it("handles pre-release suffixes by ignoring them", () => {
    expect(compareVersions("1.1.0-beta", "1.1.0")).toBe(0);
    expect(compareVersions("1.1.0-beta", "1.0.10")).toBeGreaterThan(0);
  });
});

describe("decideUpdate (checkForUpdates logic)", () => {
  const baseSettings = { updates: {} };

  it("returns update info when newer version exists", () => {
    const result = decideUpdate("1.0.10", {
      latest: "1.1.0",
      url: "https://github.com/CamelDev/ultra-git/releases/tag/v1.1.0",
      publishedAt: "2026-07-30T12:00:00Z",
      notes: "### Added\n- Update notifications",
    }, baseSettings);

    expect(result).not.toBeNull();
    expect(result!.latest).toBe("1.1.0");
    expect(result!.url).toContain("v1.1.0");
    expect(result!.publishedAt).toBe("2026-07-30T12:00:00Z");
    expect(result!.notes).toContain("Update notifications");
  });

  it("returns null when versions are equal", () => {
    const result = decideUpdate("1.0.10", { latest: "1.0.10" }, baseSettings);
    expect(result).toBeNull();
  });

  it("returns null when current version is newer", () => {
    const result = decideUpdate("1.2.0", { latest: "1.1.0" }, baseSettings);
    expect(result).toBeNull();
  });

  it("returns null when version is skipped", () => {
    const result = decideUpdate("1.0.10", { latest: "1.1.0" }, {
      updates: { skippedVersion: "1.1.0" },
    });
    expect(result).toBeNull();
  });

  it("returns null on server error / garbage", () => {
    expect(decideUpdate("1.0.10", null, baseSettings)).toBeNull();
    expect(decideUpdate("1.0.10", {}, baseSettings)).toBeNull();
    expect(decideUpdate("1.0.10", { latest: "" }, baseSettings)).toBeNull();
  });
});

describe("decideQuery (queryUpdateServer logic)", () => {
  const baseSettings = { updates: {} };

  it("reports contacted=true and update when newer version exists", () => {
    const result = decideQuery("1.0.10", { latest: "1.1.0" }, baseSettings);
    expect(result.contacted).toBe(true);
    expect(result.update).not.toBeNull();
    expect(result.update!.latest).toBe("1.1.0");
  });

  it("reports contacted=true and no update when up to date", () => {
    const result = decideQuery("1.0.10", { latest: "1.0.10" }, baseSettings);
    expect(result.contacted).toBe(true);
    expect(result.update).toBeNull();
  });

  it("reports contacted=false when server unreachable", () => {
    const result = decideQuery("1.0.10", null, baseSettings);
    expect(result.contacted).toBe(false);
    expect(result.update).toBeNull();
  });

  it("reports contacted=true but no update when version skipped", () => {
    const result = decideQuery("1.0.10", { latest: "1.1.0" }, {
      updates: { skippedVersion: "1.1.0" },
    });
    expect(result.contacted).toBe(true);
    expect(result.update).toBeNull();
  });
});

describe("shouldRecheck (scheduleUpdateChecks tick logic)", () => {
  const RECHECK_AFTER_MS = 24 * 60 * 60 * 1000; // 24h
  const now = Date.parse("2026-08-06T12:00:00Z");

  it("rechecks when elapsed >= 24h", () => {
    const last = new Date(now - RECHECK_AFTER_MS).toISOString();
    expect(shouldRecheck(last, now, RECHECK_AFTER_MS)).toBe(true);
  });

  it("does not recheck when elapsed < 24h", () => {
    const last = new Date(now - 60 * 60 * 1000).toISOString(); // 1h ago
    expect(shouldRecheck(last, now, RECHECK_AFTER_MS)).toBe(false);
  });

  it("rechecks when timestamp is missing", () => {
    expect(shouldRecheck(undefined, now, RECHECK_AFTER_MS)).toBe(true);
  });

  it("rechecks when timestamp is corrupt", () => {
    expect(shouldRecheck("not-a-date", now, RECHECK_AFTER_MS)).toBe(true);
  });

  it("rechecks when timestamp is exactly at threshold", () => {
    const last = new Date(now - RECHECK_AFTER_MS).toISOString();
    expect(shouldRecheck(last, now, RECHECK_AFTER_MS)).toBe(true);
  });
});
