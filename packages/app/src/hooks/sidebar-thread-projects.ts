import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";
import type { SidebarProjectEntry } from "@/hooks/sidebar-workspaces-view-model";

export function hasStoredSidebarProject(project: SidebarProjectEntry): boolean {
  return project.hosts.some((host) => host.projectId.length > 0);
}

export interface SidebarThreadProject {
  project: SidebarProjectEntry;
  agents: AggregatedAgent[];
}

/** Match a live thread to the same project identity used by the workspace sidebar. */
export function groupSidebarThreads(input: {
  projects: readonly SidebarProjectEntry[];
  agents: readonly AggregatedAgent[];
  includeUnmatched?: boolean;
}): SidebarThreadProject[] {
  const groups = input.projects.map((project) => ({ project, agents: [] as AggregatedAgent[] }));
  for (const agent of input.agents) {
    const projectKey = agent.projectPlacement?.projectKey;
    const matched = groups.find(
      ({ project }) =>
        (projectKey && project.projectKey === projectKey) ||
        project.hosts.some(
          (host) =>
            host.serverId === agent.serverId &&
            (agent.cwd === host.iconWorkingDir ||
              agent.cwd.startsWith(`${host.iconWorkingDir.replace(/\/$/, "")}/`)),
        ),
    );
    if (matched) {
      matched.agents.push(agent);
    } else if (input.includeUnmatched !== false) {
      // Agents can outlive their workspace directory entry. Keep their chats reachable.
      const projectName =
        agent.projectPlacement?.projectName || agent.cwd.split("/").findLast(Boolean) || "Other";
      const viewKey = `thread:${agent.serverId}:${projectKey || agent.cwd}`;
      let fallback = groups.find(({ project }) => project.viewKey === viewKey);
      if (!fallback) {
        fallback = {
          project: {
            viewKey,
            projectKey: projectKey ?? null,
            projectName,
            projectKind: "unknown",
            iconWorkingDir: agent.cwd,
            hosts: [
              {
                serverId: agent.serverId,
                projectId: "",
                iconWorkingDir: agent.cwd,
                worktreeSupport: "unknown",
              },
            ],
            workspaces: [],
          },
          agents: [],
        };
        groups.push(fallback);
      }
      fallback.agents.push(agent);
    }
  }
  for (const group of groups) {
    group.agents.sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
  }
  return groups;
}
