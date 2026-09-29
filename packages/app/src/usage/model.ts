import { formatCompactTimeAgoAsProse } from "@/utils/time";
import { usageCopy } from "./copy";
import type { UsageDisplayAs } from "./preferences";
import type { UsageReportEntry, UsageView, UsageWindow } from "./types";

export function usedPercent(window: UsageWindow): number | null {
  if (window.usedPct != null) return window.usedPct;
  if (window.remainingPct != null) return 100 - window.remainingPct;
  return null;
}

/** The percent a window shows under the user's used/remaining preference. */
export function displayPercent(window: UsageWindow, displayAs: UsageDisplayAs): number | null {
  if (displayAs === "used") return usedPercent(window);
  if (window.remainingPct != null) return window.remainingPct;
  const used = usedPercent(window);
  return used == null ? null : 100 - used;
}

/** When a report was fetched, from its compact relative time: "Updated 3m ago". */
export function formatUsageFreshness(compactTimeAgo: string): string {
  return `${usageCopy.updated} ${formatCompactTimeAgoAsProse(compactTimeAgo)}`;
}

/** A user-requested refresh of one report. The previous report stays on screen throughout. */
export type UsageRefresh = "idle" | "pending" | "failed";

export function resolveUsageRefresh(mutation: {
  isPending: boolean;
  error: unknown;
}): UsageRefresh {
  if (mutation.isPending) return "pending";
  if (mutation.error) return "failed";
  return "idle";
}

/**
 * A host's report list with one report swapped for its refreshed copy, in place.
 * `null` means the daemon no longer knows the ID, so the report leaves the list.
 */
export function replaceReport(
  reports: readonly UsageReportEntry[],
  reportId: string,
  refreshed: UsageReportEntry | null,
): UsageReportEntry[] {
  if (!refreshed) return reports.filter((report) => report.id !== reportId);
  return reports.map((report) => (report.id === reportId ? refreshed : report));
}

export interface UsageQueryState {
  data: UsageReportEntry[] | undefined;
  error: unknown;
  isFetching: boolean;
}

export function resolveUsageView(input: {
  isConnected: boolean;
  supportsUsage: boolean;
  query: UsageQueryState | undefined;
}): UsageView {
  const { isConnected, supportsUsage, query } = input;
  if (!isConnected) return { kind: "unavailable", message: usageCopy.hostUnavailable };
  if (!supportsUsage) return { kind: "unavailable", message: usageCopy.hostUpgradeRequired };
  if (query?.data) {
    return { kind: "ready", reports: query.data, isRefreshing: query.isFetching };
  }
  if (query?.error) {
    return {
      kind: "error",
      message: query.error instanceof Error ? query.error.message : String(query.error),
    };
  }
  return { kind: "loading" };
}

export interface UsageHost {
  serverId: string;
  label: string;
  isConnected: boolean;
  supportsUsage: boolean;
}

/** The host the sidebar summary reads: the active workspace's, else the first that reports usage. */
export function resolveSummaryHostId(
  activeServerId: string | null,
  hosts: readonly UsageHost[],
): string | null {
  const reporting = hosts.filter((host) => host.isConnected && host.supportsUsage);
  const active = reporting.find((host) => host.serverId === activeServerId);
  return (active ?? reporting[0])?.serverId ?? null;
}

/**
 * The host the Usage screen shows: the user's pick while it stays connected, else the active
 * workspace's host, else the first connected host.
 */
export function resolveUsageScreenHostId(input: {
  selectedServerId: string | null;
  activeServerId: string | null;
  hosts: readonly UsageHost[];
}): string | null {
  const connected = input.hosts.filter((host) => host.isConnected);
  const find = (serverId: string | null) => connected.find((host) => host.serverId === serverId);
  return (
    (find(input.selectedServerId) ?? find(input.activeServerId) ?? connected[0])?.serverId ?? null
  );
}
