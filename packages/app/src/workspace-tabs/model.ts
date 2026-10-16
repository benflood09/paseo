import type { AgentProvider } from "@getpaseo/protocol/agent-types";
import type { JsonValue } from "@getpaseo/protocol/agent-types";
import type { WorkspaceFileTabTarget } from "@/workspace/file-open";

export interface WorkspaceDraftTabSetup {
  provider: AgentProvider;
  cwd: string;
  modeId: string | null;
  model: string | null;
  thinkingOptionId: string | null;
  featureValues: Record<string, unknown>;
}

export interface WorkspaceWorkingDiffTabTarget {
  kind: "working_diff";
  focusPath?: string;
  focusRequestId?: number;
}

export type PluginWorkspaceTabTarget =
  | {
      kind: "plugin";
      pluginId: string;
      panelId: string;
      context: "workspace";
    }
  | {
      kind: "plugin";
      pluginId: string;
      panelId: string;
      context: "agent";
      agentId: string;
    };

export type WorkspaceTabTarget = (
  | { kind: "new_tab" }
  | { kind: "draft"; draftId: string; setup?: WorkspaceDraftTabSetup }
  | { kind: "agent"; agentId: string; allowArchived?: boolean }
  | { kind: "provider_subagent"; parentAgentId: string; subagentId: string }
  | { kind: "terminal"; terminalId: string }
  | { kind: "browser"; browserId: string }
  | { kind: "changes_tree" }
  | { kind: "files" }
  | { kind: "pull_request" }
  | WorkspaceFileTabTarget
  | WorkspaceWorkingDiffTabTarget
  | PluginWorkspaceTabTarget
  | { kind: "setup"; workspaceId: string }
  | { kind: "commit_diff"; sha: string }
) & { workspaceId?: string };

/** One layout per project when the sidebar groups threads under their repository. */
export function buildWorkspaceProjectTabScopeKey(input: {
  serverId: string;
  projectKey: string | null | undefined;
}): string | null {
  const serverId = input.serverId.trim();
  const projectKey = input.projectKey?.trim();
  return serverId && projectKey ? `${serverId}:project:${projectKey}` : null;
}

export interface WorkspaceTab {
  tabId: string;
  target: WorkspaceTabTarget;
  createdAt: number;
  state?: JsonValue;
}

export function buildWorkspaceTabPersistenceKey(input: {
  serverId: string;
  workspaceId: string;
}): string | null {
  const serverId = input.serverId.trim();
  const workspaceId = input.workspaceId.trim();
  if (!serverId || !workspaceId) {
    return null;
  }
  return `${serverId}:${workspaceId}`;
}
