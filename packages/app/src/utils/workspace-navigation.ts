import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { useSessionStore } from "@/stores/session-store";
import {
  getWorkspaceOrganizationPolicy,
  useWorkspaceOrganizationStore,
} from "@/stores/workspace-organization-store";
import {
  buildWorkspaceProjectTabScopeKey,
  buildWorkspaceTabPersistenceKey,
} from "@/workspace-tabs/model";
import {
  prepareWorkspaceTab as prepareWorkspaceTabPure,
  type PrepareWorkspaceTabInput,
} from "./prepare-workspace-tab";
import type { WorkspaceTabTarget } from "@/workspace-tabs/model";

export type { PrepareWorkspaceTabInput } from "./prepare-workspace-tab";

export function resolveTabScopeKey(
  input: Pick<PrepareWorkspaceTabInput, "serverId" | "workspaceId">
): string | null {
  const fallback = buildWorkspaceTabPersistenceKey(input);
  if (
    getWorkspaceOrganizationPolicy(
      useWorkspaceOrganizationStore.getState().mode
    ).tabScope !== "project"
  ) {
    return fallback;
  }
  const session = useSessionStore.getState().sessions[input.serverId];
  const workspace = [...(session?.workspaces.values() ?? [])].find(
    (item) => item.id === input.workspaceId
  );
  return (
    buildWorkspaceProjectTabScopeKey({
      serverId: input.serverId,
      projectKey: workspace?.project?.projectKey ?? workspace?.projectId,
    }) ?? fallback
  );
}

function layoutStoreDeps() {
  const store = useWorkspaceLayoutStore.getState();
  return {
    openTab: (input: {
      workspaceKey: string;
      target: WorkspaceTabTarget;
      intent: "reveal";
      pin?: boolean;
      placement?: import("@/stores/workspace-layout-actions").WorkspaceTabPlacement;
    }) => store.openTab(input),
  };
}

export function prepareWorkspaceTab(input: PrepareWorkspaceTabInput): void {
  prepareWorkspaceTabPure(
    { ...input, tabScopeKey: input.tabScopeKey ?? resolveTabScopeKey(input) },
    layoutStoreDeps()
  );
}
