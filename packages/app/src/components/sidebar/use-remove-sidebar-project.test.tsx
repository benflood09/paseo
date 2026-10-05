/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SidebarProjectEntry } from "@/hooks/sidebar-workspaces-view-model";
import { useRemoveSidebarProject } from "./use-remove-sidebar-project";

const state = vi.hoisted(() => ({
  confirm: vi.fn(),
  readiness: vi.fn(),
  getClient: vi.fn(),
  error: vi.fn(),
}));

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/contexts/toast-context", () => ({ useToast: () => ({ error: state.error }) }));
vi.mock("@/utils/confirm-dialog", () => ({ confirmDialog: state.confirm }));
vi.mock("@/runtime/host-runtime", () => ({
  getHostRuntimeStore: () => ({ getClient: state.getClient }),
}));
vi.mock("@/projects/project-remove", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/projects/project-remove")>()),
  getCurrentProjectRemoveReadiness: state.readiness,
}));


const project: SidebarProjectEntry = {
  viewKey: "shared",
  projectKey: "shared",
  projectName: "Shared",
  projectKind: "git",
  iconWorkingDir: "/repo",
  workspaces: [],
  hosts: [
    { serverId: "mac", projectId: "mac-id", iconWorkingDir: "/repo", worktreeSupport: "supported" },
    { serverId: "vm", projectId: "vm-id", iconWorkingDir: "/repo", worktreeSupport: "supported" },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  state.readiness.mockReturnValue({
    kind: "ready",
    targets: [{ serverId: "mac", projectId: "mac-id" }, { serverId: "vm", projectId: "vm-id" }],
  });
});

describe("useRemoveSidebarProject", () => {
  it("leaves both hosts untouched when removal is cancelled", async () => {
    state.confirm.mockResolvedValue(false);
    const { result } = renderHook(() => useRemoveSidebarProject(project, "Shared"));
    act(() => result.current.handleRemoveProject());
    await waitFor(() => expect(state.confirm).toHaveBeenCalledTimes(1));
    expect(state.readiness).not.toHaveBeenCalled();
    expect(state.getClient).not.toHaveBeenCalled();
  });

  it("removes from both hosts after confirmation and stays pending until both finish", async () => {
    state.confirm.mockResolvedValue(true);
    let finishMac!: () => void;
    let finishVm!: () => void;
    const macRemove = vi.fn(() => new Promise<void>((resolve) => { finishMac = resolve; }));
    const vmRemove = vi.fn(() => new Promise<void>((resolve) => { finishVm = resolve; }));
    state.getClient.mockImplementation((serverId: string) =>
      serverId === "mac" ? { removeProject: macRemove } : { removeProject: vmRemove },
    );
    const { result } = renderHook(() => useRemoveSidebarProject(project, "Shared"));
    act(() => result.current.handleRemoveProject());
    await waitFor(() => expect(result.current.isRemovingProject).toBe(true));
    expect(macRemove).toHaveBeenCalledWith("mac-id");
    expect(vmRemove).toHaveBeenCalledWith("vm-id");
    act(() => finishMac());
    expect(result.current.isRemovingProject).toBe(true);
    act(() => finishVm());
    await waitFor(() => expect(result.current.isRemovingProject).toBe(false));
    expect(state.error).not.toHaveBeenCalled();
  });

  it("ignores synthesized groups without a stored project id", () => {
    const synthetic = { ...project, hosts: [{ ...project.hosts[0]!, projectId: "" }] };
    const { result } = renderHook(() => useRemoveSidebarProject(synthetic, "Other"));
    act(() => result.current.handleRemoveProject());
    expect(state.confirm).not.toHaveBeenCalled();
    expect(state.getClient).not.toHaveBeenCalled();
  });
});
