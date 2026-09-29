import { describe, expect, it } from "vitest";
import {
  displayPercent,
  formatUsageFreshness,
  replaceReport,
  resolveUsageRefresh,
  resolveSummaryHostId,
  resolveUsageScreenHostId,
  resolveUsageView,
  type UsageHost,
  type UsageQueryState,
} from "./model";
import type { UsageReportEntry, UsageWindow } from "./types";

function entry(input: {
  windows?: UsageWindow[];
  planLabel?: string;
  icon?: string;
  sourceId?: string;
}): UsageReportEntry {
  return {
    id: `${input.sourceId ?? "fixture"}:account-1`,
    account: {},
    fetchedAt: "2026-01-01T00:00:00.000Z",
    sourceId: input.sourceId ?? "fixture",
    sourceLabel: "Fixture source",
    ...(input.icon ? { icon: input.icon } : {}),
    report: {
      status: "available",
      ...(input.planLabel ? { planLabel: input.planLabel } : {}),
      windows: input.windows ?? [],
    },
  };
}

function ready(data: UsageReportEntry[]): UsageQueryState {
  return { data, error: null, isFetching: false };
}

describe("resolveUsageView", () => {
  it("asks for a host update when the host lacks usage sources", () => {
    expect(
      resolveUsageView({ isConnected: true, supportsUsage: false, query: ready([entry({})]) }),
    ).toEqual({ kind: "unavailable", message: "Update the host to see usage" });
  });

  it("asks for a connection before anything else", () => {
    expect(
      resolveUsageView({ isConnected: false, supportsUsage: false, query: undefined }),
    ).toEqual({ kind: "unavailable", message: "Connect to this host to see usage" });
  });

  it("moves from loading to ready to error", () => {
    const base = { isConnected: true, supportsUsage: true };
    expect(resolveUsageView({ ...base, query: undefined })).toEqual({ kind: "loading" });
    expect(
      resolveUsageView({ ...base, query: { data: [], error: null, isFetching: true } }),
    ).toEqual({ kind: "ready", reports: [], isRefreshing: true });
    expect(
      resolveUsageView({
        ...base,
        query: { data: undefined, error: new Error("boom"), isFetching: false },
      }),
    ).toEqual({ kind: "error", message: "boom" });
  });
});

const hosts: UsageHost[] = [
  { serverId: "offline", label: "Offline", isConnected: false, supportsUsage: true },
  { serverId: "old", label: "Old", isConnected: true, supportsUsage: false },
  { serverId: "a", label: "Alpha", isConnected: true, supportsUsage: true },
  { serverId: "b", label: "Beta", isConnected: true, supportsUsage: true },
];

describe("resolveSummaryHostId", () => {
  it("reads the active workspace's host", () => {
    expect(resolveSummaryHostId("b", hosts)).toBe("b");
  });

  it("falls back to the first connected host that reports usage", () => {
    expect(resolveSummaryHostId(null, hosts)).toBe("a");
    expect(resolveSummaryHostId("offline", hosts)).toBe("a");
    expect(resolveSummaryHostId("old", hosts)).toBe("a");
  });

  it("has no host when none reports usage", () => {
    expect(resolveSummaryHostId("old", hosts.slice(0, 2))).toBeNull();
  });
});

describe("resolveUsageScreenHostId", () => {
  it("keeps the user's pick while it stays connected", () => {
    expect(resolveUsageScreenHostId({ selectedServerId: "old", activeServerId: "b", hosts })).toBe(
      "old",
    );
    expect(
      resolveUsageScreenHostId({ selectedServerId: "offline", activeServerId: "b", hosts }),
    ).toBe("b");
  });

  it("defaults to the active workspace's host, else the first connected host", () => {
    expect(resolveUsageScreenHostId({ selectedServerId: null, activeServerId: "b", hosts })).toBe(
      "b",
    );
    expect(resolveUsageScreenHostId({ selectedServerId: null, activeServerId: null, hosts })).toBe(
      "old",
    );
    expect(
      resolveUsageScreenHostId({ selectedServerId: null, activeServerId: null, hosts: [] }),
    ).toBeNull();
  });
});

describe("displayPercent", () => {
  const window = (input: Partial<UsageWindow>): UsageWindow => ({
    id: "weekly",
    label: "Weekly",
    ...input,
  });

  it("reads the share used or the share left", () => {
    expect(displayPercent(window({ usedPct: 31 }), "used")).toBe(31);
    expect(displayPercent(window({ usedPct: 31 }), "remaining")).toBe(69);
    expect(displayPercent(window({ remainingPct: 40 }), "used")).toBe(60);
    expect(displayPercent(window({ usedPct: 50, remainingPct: 45 }), "remaining")).toBe(45);
  });

  it("has no percent when the window reports none", () => {
    expect(displayPercent(window({}), "remaining")).toBeNull();
  });
});

describe("formatUsageFreshness", () => {
  it("says when the report was fetched", () => {
    expect(formatUsageFreshness("now")).toBe("Updated just now");
    expect(formatUsageFreshness("3m")).toBe("Updated 3m ago");
    expect(formatUsageFreshness("Jan 15")).toBe("Updated Jan 15");
  });
});

describe("resolveUsageRefresh", () => {
  it("is pending while a refresh runs, even after an earlier failure", () => {
    expect(resolveUsageRefresh({ isPending: true, error: new Error("boom") })).toBe("pending");
  });

  it("is failed after a refresh errors", () => {
    expect(resolveUsageRefresh({ isPending: false, error: new Error("boom") })).toBe("failed");
  });

  it("is idle before and after a successful refresh", () => {
    expect(resolveUsageRefresh({ isPending: false, error: null })).toBe("idle");
  });
});

describe("replaceReport", () => {
  const alpha = entry({ sourceId: "alpha", planLabel: "Old" });
  const beta = entry({ sourceId: "beta" });

  it("swaps only the refreshed report, in place", () => {
    const refreshed = entry({ sourceId: "alpha", planLabel: "New" });
    expect(replaceReport([alpha, beta], alpha.id, refreshed)).toEqual([refreshed, beta]);
  });

  it("drops a report the daemon no longer knows", () => {
    expect(replaceReport([alpha, beta], alpha.id, null)).toEqual([beta]);
  });
});
