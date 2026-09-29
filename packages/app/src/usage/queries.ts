import { useCallback, useMemo } from "react";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useShallow } from "zustand/shallow";
import { useFetchQueries, useFetchQuery } from "@/data/query";
import {
  getHostRuntimeStore,
  useHostRuntimeConnectionStatuses,
  useHostRuntimeIsConnected,
  useHosts,
} from "@/runtime/host-runtime";
import { useSessionStore, type SessionState } from "@/stores/session-store";
import { usageCopy } from "./copy";
import {
  groupUsageByHost,
  replaceReport,
  resolveUsageRefresh,
  resolveUsageView,
  type UsageHostGroup,
  type UsageQueryState,
  type UsageRefresh,
} from "./model";
import type { UsageReportEntry, UsageView } from "./types";

// The daemon caches each report for five minutes, so re-reading it is cheap. Only
// an explicit refresh passes `forceRefresh` and reaches the source's API.
const REPORTS_STALE_TIME_MS = 60_000;

function usageReportsQueryKey(serverId: string) {
  return ["usage", "reports", serverId] as const;
}

function requireClient(serverId: string) {
  const client = getHostRuntimeStore().getClient(serverId);
  if (!client) throw new Error(usageCopy.clientUnavailable);
  return client;
}

async function listReports(serverId: string, forceRefresh = false): Promise<UsageReportEntry[]> {
  return (await requireClient(serverId).listUsageReports({ forceRefresh })).reports;
}

function reportQueryKey(serverId: string, reportId: string) {
  return ["usage", "report", serverId, reportId] as const;
}

async function getReport(
  serverId: string,
  reportId: string,
  forceRefresh = false,
): Promise<UsageReportEntry | null> {
  return (
    (await requireClient(serverId).listUsageReports({ reportIds: [reportId], forceRefresh }))
      .reports[0] ?? null
  );
}

function supportsUsage(session: SessionState | undefined): boolean {
  return session?.serverInfo?.features?.usageSources === true;
}

async function refreshReports(queryClient: QueryClient, serverId: string): Promise<void> {
  await queryClient.fetchQuery({
    queryKey: usageReportsQueryKey(serverId),
    queryFn: async () => {
      const reports = await listReports(serverId, true);
      for (const report of reports)
        queryClient.setQueryData(reportQueryKey(serverId, report.id), report);
      return reports;
    },
    staleTime: 0,
  });
}

function toQueryState(query: {
  data: UsageReportEntry[] | undefined;
  error: unknown;
  isFetching: boolean;
}): UsageQueryState {
  return { data: query.data, error: query.error, isFetching: query.isFetching };
}

/** Usage reports for one host, as shown on its settings page. */
export function useHostUsage(serverId: string): { view: UsageView; refresh: () => void } {
  const queryClient = useQueryClient();
  const isConnected = useHostRuntimeIsConnected(serverId);
  const isSupported = useSessionStore((state) => supportsUsage(state.sessions[serverId]));
  const query = useFetchQuery({
    queryKey: usageReportsQueryKey(serverId),
    queryFn: async () => {
      const reports = await listReports(serverId);
      for (const report of reports)
        queryClient.setQueryData(reportQueryKey(serverId, report.id), report);
      return reports;
    },
    enabled: isConnected && isSupported,
    dataShape: "list",
    staleTimeMs: REPORTS_STALE_TIME_MS,
  });
  const refresh = useCallback(() => {
    void refreshReports(queryClient, serverId).catch(() => undefined);
  }, [queryClient, serverId]);
  const view = resolveUsageView({
    isConnected,
    supportsUsage: isSupported,
    query: toQueryState(query),
  });
  return { view, refresh };
}

/** Usage reports for every connected host, grouped by host. */
export function useUsageByHost(): {
  groups: UsageHostGroup[];
  refresh: (serverId: string) => void;
} {
  const queryClient = useQueryClient();
  const hosts = useHosts();
  const serverIds = useMemo(() => hosts.map((host) => host.serverId), [hosts]);
  const connectionStatuses = useHostRuntimeConnectionStatuses(serverIds);
  const supportedServerIds = useSessionStore(
    useShallow((state) => serverIds.filter((serverId) => supportsUsage(state.sessions[serverId]))),
  );
  const usageHosts = useMemo(
    () =>
      hosts.map((host) => ({
        serverId: host.serverId,
        label: host.label,
        isConnected: connectionStatuses.get(host.serverId) === "online",
        supportsUsage: supportedServerIds.includes(host.serverId),
      })),
    [connectionStatuses, hosts, supportedServerIds],
  );
  const results = useFetchQueries<UsageReportEntry[]>(
    usageHosts.map((host) => ({
      queryKey: usageReportsQueryKey(host.serverId),
      queryFn: () => listReports(host.serverId),
      enabled: host.isConnected && host.supportsUsage,
      dataShape: "list",
      staleTimeMs: REPORTS_STALE_TIME_MS,
    })),
  );
  const groups = groupUsageByHost(
    usageHosts,
    new Map(usageHosts.map((host, index) => [host.serverId, toQueryState(results[index])])),
  );
  const refresh = useCallback(
    (serverId: string) => {
      void refreshReports(queryClient, serverId).catch(() => undefined);
    },
    [queryClient],
  );
  return { groups, refresh };
}

/**
 * Forces the source to fetch one report, and only that report. The result replaces
 * the report wherever it is cached — its own entry and its host's list — so every
 * surface showing it moves together; until then the previous report stays on screen.
 */
export function useReportRefresh(
  serverId: string,
  reportId: string,
): { refresh: () => void; refreshState: UsageRefresh } {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => getReport(serverId, reportId, true),
    onSuccess: (report) => {
      queryClient.setQueryData(reportQueryKey(serverId, reportId), report);
      queryClient.setQueryData<UsageReportEntry[]>(usageReportsQueryKey(serverId), (reports) =>
        reports ? replaceReport(reports, reportId, report) : reports,
      );
    },
  });
  const { mutate } = mutation;
  const refresh = useCallback(() => mutate(), [mutate]);
  return { refresh, refreshState: resolveUsageRefresh(mutation) };
}
