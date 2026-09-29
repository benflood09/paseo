import { expect, test } from "../support/fixtures";
import { gotoAppShell, openSettings } from "../support/helpers/app";
import { createMockIdleAgent, fetchAgentArchivedAt } from "../support/helpers/archive-tab";
import { seedWorkspace } from "../support/helpers/seed-client";
import { getServerId } from "../support/helpers/server-id";
import { buildHostWorkspaceRoute } from "@/utils/host-routes";

test("Threads mode groups chats under their repository and opens them from the sidebar", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const workspace = await seedWorkspace({ repoPrefix: "thread-sidebar-" });
  try {
    const first = await createMockIdleAgent(workspace.client, {
      cwd: workspace.repoPath,
      workspaceId: workspace.workspaceId,
      title: "First sidebar thread",
    });
    const second = await createMockIdleAgent(workspace.client, {
      cwd: workspace.repoPath,
      workspaceId: workspace.workspaceId,
      title: "Second sidebar thread",
    });
    const serverId = getServerId();

    await gotoAppShell(page);
    await openSettings(page);
    await page.getByTestId("settings-sidebar-organization").getByText("Threads").click();
    await page.goto(buildHostWorkspaceRoute(serverId, workspace.workspaceId));

    const sidebar = page.getByTestId("sidebar-thread-list").filter({ visible: true }).first();
    const project = sidebar.getByTestId(/^sidebar-thread-project:/).first();
    await expect(project).toBeVisible();
    await expect(project.getByTestId(`sidebar-thread:${serverId}:${first.id}`)).toBeVisible();
    await expect(project.getByTestId(`sidebar-thread:${serverId}:${second.id}`)).toBeVisible();

    await project.getByTestId(`sidebar-thread:${serverId}:${first.id}`).click();
    await expect(page.getByTestId(`workspace-tab-agent_${first.id}`).filter({ visible: true })).toBeVisible();

    await project.getByTestId(`sidebar-thread-archive:${serverId}:${second.id}`).click();
    await expect(project.getByTestId(`sidebar-thread:${serverId}:${second.id}`)).toHaveCount(0);
    await expect.poll(() => fetchAgentArchivedAt(workspace.client, second.id)).not.toBeNull();
    await expect(project.getByTestId(`sidebar-thread:${serverId}:${first.id}`)).toBeVisible();
  } finally {
    await workspace.cleanup();
  }
});
