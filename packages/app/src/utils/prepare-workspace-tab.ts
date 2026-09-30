import { generateDraftId } from "@/stores/draft-keys";
import {
  buildWorkspaceTabPersistenceKey,
  type WorkspaceTabTarget,
} from "@/workspace-tabs/model";
import type { WorkspaceTabPlacement } from "@/stores/workspace-layout-actions";

export interface PrepareWorkspaceTabInput {
  serverId: string;
  workspaceId: string;
  tabScopeKey?: string | null;
  target: WorkspaceTabTarget;
  pin?: boolean;
  placement?: WorkspaceTabPlacement;
}

export interface PrepareWorkspaceTabDeps {
  openTab: (input: {
    workspaceKey: string;
    target: WorkspaceTabTarget;
    intent: "reveal";
    pin?: boolean;
    placement?: WorkspaceTabPlacement;
  }) => string | null;
}

function getPreparedTarget(
  target: WorkspaceTabTarget,
  workspaceId: string,
  projectScoped: boolean
): WorkspaceTabTarget {
  const contextualTarget =
    !projectScoped || target.kind === "setup" || target.workspaceId?.trim()
      ? target
      : { ...target, workspaceId };
  if (
    contextualTarget.kind !== "draft" ||
    contextualTarget.draftId.trim() !== "new"
  ) {
    return contextualTarget;
  }
  return { ...contextualTarget, draftId: generateDraftId() };
}

export function prepareWorkspaceTab(
  input: PrepareWorkspaceTabInput,
  deps: PrepareWorkspaceTabDeps
): void {
  const workspaceKey = buildWorkspaceTabPersistenceKey({
    serverId: input.serverId,
    workspaceId: input.workspaceId,
  }) ?? "";
  const key = input.tabScopeKey ?? workspaceKey;
  const target = getPreparedTarget(input.target, input.workspaceId, key !== workspaceKey);

  deps.openTab({
    workspaceKey: key,
    target,
    intent: "reveal",
    pin: input.pin === true && target.kind === "agent",
    placement: input.placement,
  });
}
