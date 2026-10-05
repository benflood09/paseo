/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { SidebarProjectEntry } from "@/hooks/sidebar-workspaces-view-model";
import { SidebarThreadList } from "./sidebar-thread-list";
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
vi.stubGlobal("React", React);
vi.mock("react-native", () => ({
  View: ({ children, testID }: { children?: React.ReactNode; testID?: string }) =>
    React.createElement("div", { "data-testid": testID }, children),
  ScrollView: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", null, children),
  Text: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("span", null, children),
  Pressable: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("button", { type: "button" }, children),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  withUnistyles: (icon: unknown) => icon,
}));
vi.mock("lucide-react-native", () => ({
  ChevronDown: () => null,
  ChevronRight: () => null,
  Plus: () => null,
  X: () => null,
}));
vi.mock("@/hooks/use-aggregated-agents", () => ({ useAggregatedAgents: () => ({ agents: [] }) }));
vi.mock("@/hooks/use-archive-agent", () => ({
  useArchiveAgent: () => ({ archiveAgent: vi.fn() }),
}));
vi.mock("@/stores/sidebar-collapsed-sections-store", () => ({
  useSidebarCollapsedSectionsStore: (selector: (state: unknown) => unknown) =>
    selector({ collapsedProjectKeys: new Set(), toggleProjectCollapsed: vi.fn() }),
}));
vi.mock("@/stores/sidebar-view-store", () => ({
  hasActiveSidebarLabelFilter: () => false,
  useSidebarViewStore: (selector: (state: unknown) => unknown) =>
    selector({ hostFilters: [], labelFilter: null }),
}));
vi.mock("@/stores/session-store", () => ({ useSessionStore: () => false }));
vi.mock("@/stores/navigation-active-workspace-store", () => ({ navigateToWorkspace: vi.fn() }));
vi.mock("@/utils/navigate-to-agent", () => ({ navigateToAgent: vi.fn() }));
vi.mock("@/components/provider-icons", () => ({ getProviderIcon: () => () => null }));
vi.mock("@/hooks/use-is-local-daemon", () => ({ useLocalDaemonServerId: () => "mac" }));
vi.mock("@/utils/sidebar-project-row-model", () => ({
  resolveSidebarProjectLocalPath: () => "/repo",
}));
vi.mock("@/components/sidebar/use-remove-sidebar-project", () => ({
  useRemoveSidebarProject: () => ({ handleRemoveProject: vi.fn(), isRemovingProject: false }),
}));
vi.mock("@/components/sidebar-workspace-list", () => ({
  ProjectKebabMenu: ({ projectViewKey }: { projectViewKey: string }) =>
    React.createElement(
      "button",
      { type: "button", "data-testid": "sidebar-project-kebab-" + projectViewKey },
      "Actions",
    ),
}));
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", null, children),
  DropdownMenuTrigger: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("button", { type: "button" }, children),
  DropdownMenuContent: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", null, children),
  DropdownMenuItem: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("button", { type: "button" }, children),
}));
const project: SidebarProjectEntry = {
  viewKey: "stored",
  projectKey: "stored",
  projectName: "Stored",
  projectKind: "git",
  iconWorkingDir: "/repo",
  workspaces: [],
  hosts: [
    {
      serverId: "mac",
      projectId: "stored-id",
      iconWorkingDir: "/repo",
      worktreeSupport: "supported",
    },
  ],
};
it("shows actions only for stored Threads projects", () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  const synthetic = {
    ...project,
    viewKey: "thread:orphan",
    hosts: [{ ...project.hosts[0]!, projectId: "" }],
  };
  act(() => root.render(<SidebarThreadList projects={[project, synthetic]} />));
  expect(container.querySelector('[data-testid="sidebar-project-kebab-stored"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="sidebar-project-kebab-thread:orphan"]')).toBeNull();
  act(() => root.unmount());
});
