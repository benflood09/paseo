import { useMemo, useState } from "react";
import {
  useActiveWorkspaceSelection,
  useLastWorkspaceSelection,
} from "@/stores/navigation-active-workspace-store";
import { resolveSidebarUsageHostId, resolveUsageScreenHostId, type UsageHost } from "./model";
import { useUsageHosts } from "./queries";

/** The active workspace's host; off a workspace route, the last workspace visited. */
function useActiveServerId(): string | null {
  const active = useActiveWorkspaceSelection();
  const last = useLastWorkspaceSelection();
  return active?.serverId ?? last?.serverId ?? null;
}

/** The host the sidebar Usage item and its popover read, or null when none reports usage. */
export function useSidebarUsageHostId(): string | null {
  return resolveSidebarUsageHostId(useActiveServerId(), useUsageHosts());
}

/** The Usage screen's host. The pick is screen state: it resets when the screen unmounts. */
export function useUsageScreenHost(): {
  serverId: string | null;
  connectedHosts: UsageHost[];
  select: (serverId: string) => void;
} {
  const hosts = useUsageHosts();
  const activeServerId = useActiveServerId();
  const [selectedServerId, select] = useState<string | null>(null);
  const connectedHosts = useMemo(() => hosts.filter((host) => host.isConnected), [hosts]);
  return {
    serverId: resolveUsageScreenHostId({ selectedServerId, activeServerId, hosts }),
    connectedHosts,
    select,
  };
}
