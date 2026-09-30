import { describe, expect, it } from "vitest";
import type { AggregatedAgent } from "./use-aggregated-agents";
import type { SidebarProjectEntry } from "./sidebar-workspaces-view-model";
import { groupSidebarThreads } from "./sidebar-thread-projects";

const project: SidebarProjectEntry = {
  viewKey: "shared-repo",
  projectKey: "shared-repo",
  projectName: "LinkSplash",
  projectKind: "git",
  iconWorkingDir: "/Users/me/linksplash",
  hosts: [
    {
      serverId: "mac",
      projectId: "mac-repo",
      iconWorkingDir: "/Users/me/linksplash",
      worktreeSupport: "supported",
    },
    {
      serverId: "vm",
      projectId: "vm-repo",
      iconWorkingDir: "/home/cloud-vm/linksplash",
      worktreeSupport: "supported",
    },
  ],
  workspaces: [],
};

function agent(
  input: Partial<AggregatedAgent> & Pick<AggregatedAgent, "id" | "serverId">,
): AggregatedAgent {
  return {
    cwd: "/Users/me/linksplash",
    lastActivityAt: new Date("2026-09-01"),
    ...input,
  } as AggregatedAgent;
}

describe("groupSidebarThreads", () => {
  it("groups matching repo threads from Mac and VM under one project", () => {
    const groups = groupSidebarThreads({
      projects: [project],
      agents: [
        agent({
          id: "mac-1",
          serverId: "mac",
          projectPlacement: { projectKey: "shared-repo" } as AggregatedAgent["projectPlacement"],
        }),
        agent({ id: "vm-1", serverId: "vm", cwd: "/home/cloud-vm/linksplash" }),
      ],
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.agents.map((item) => item.id)).toEqual(["mac-1", "vm-1"]);
  });

  it("keeps a thread visible when its workspace is missing", () => {
    const groups = groupSidebarThreads({
      projects: [project],
      agents: [agent({ id: "orphan", serverId: "vm", cwd: "/home/cloud-vm/other" })],
    });
    expect(groups[1]?.agents[0]?.id).toBe("orphan");
  });
});
