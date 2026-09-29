import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { PaseoApi } from "@getpaseo/client";
import { PaseoApiProvider } from "@getpaseo/plugin/client/host";
import { usePaseo } from "@getpaseo/plugin/client";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { PluginSharedRuntimeBoundary } from "./runtime-boundary";
import { createPluginSurfaceRuntime, getSharedPluginSurfaceRuntime } from "./surface-runtime";
import type { InstalledPlugin } from "./types";

function clientWithWorkspace(id: string) {
  const createWorkspace = vi.fn(async () => ({
    error: null,
    workspace: {
      id,
      projectId: `project-${id}`,
      workspaceDirectory: `/tmp/${id}`,
      name: id,
      status: "active",
    },
  }));
  const createAgent = vi.fn(async () => ({
    id: `agent-${id}`,
    provider: "codex",
    cwd: `/tmp/${id}`,
    workspaceId: id,
    status: "idle",
  }));
  const invokePluginRpc = vi.fn(async () => id);
  return {
    client: { createWorkspace, createAgent, invokePluginRpc } as unknown as DaemonClient,
    createWorkspace,
    createAgent,
    invokePluginRpc,
  };
}

function borrowFromAppProvider(paseo: PaseoApi): PaseoApi {
  let borrowed: PaseoApi | null = null;
  function PluginSurface() {
    borrowed = usePaseo();
    return null;
  }
  renderToStaticMarkup(
    <PaseoApiProvider paseo={paseo}>
      <PluginSurface />
    </PaseoApiProvider>,
  );
  if (!borrowed) throw new Error("Plugin surface did not receive Paseo API");
  return borrowed;
}

describe("plugin surface host runtime", () => {
  it("creates a PR worktree and agent through usePaseo on the selected app host", async () => {
    const selected = clientWithWorkspace("workspace-a");
    const runtime = createPluginSurfaceRuntime(selected.client, {
      id: "workspace-plugin",
      lifetime: new AbortController(),
    });
    if (!runtime) throw new Error("Expected selected host runtime");

    const paseo = borrowFromAppProvider(runtime.paseo);
    const workspace = await paseo.workspaces.create({
      source: {
        kind: "worktree",
        cwd: "/tmp/repository",
        action: "checkout",
        checkoutSource: { kind: "change_request", forge: "github", number: 42 },
      },
    });
    const agent = await workspace.agents.create({
      config: { provider: "codex/gpt-5" },
      prompt: "Review PR #42",
    });

    expect(workspace.id).toBe("workspace-a");
    expect(agent.id).toBe("agent-workspace-a");
    expect(selected.createWorkspace).toHaveBeenCalledOnce();
    expect(selected.createAgent).toHaveBeenCalledOnce();
  });

  it("switches all plugin calls when the selected host changes", async () => {
    const hostA = clientWithWorkspace("workspace-a");
    const hostB = clientWithWorkspace("workspace-b");
    const first = createPluginSurfaceRuntime(hostA.client, {
      id: "same-plugin",
      lifetime: new AbortController(),
    });
    const second = createPluginSurfaceRuntime(hostB.client, {
      id: "same-plugin",
      lifetime: new AbortController(),
    });
    if (!first || !second) throw new Error("Expected online host runtimes");

    await first.invoke("host", {});
    await borrowFromAppProvider(second.paseo).workspaces.create({
      source: { kind: "directory", path: "/tmp/workspace-b" },
    });

    expect(hostA.invokePluginRpc).toHaveBeenCalledWith("same-plugin", "host", {});
    expect(hostA.createWorkspace).not.toHaveBeenCalled();
    expect(hostB.createWorkspace).toHaveBeenCalledOnce();
  });

  it("keeps an offline selected host unavailable instead of borrowing another host", () => {
    const otherHost = clientWithWorkspace("workspace-online");

    expect(
      createPluginSurfaceRuntime(null, { id: "same-plugin", lifetime: new AbortController() }),
    ).toBeNull();
    expect(otherHost.createWorkspace).not.toHaveBeenCalled();
  });
});

describe("shared plugin runtime", () => {
  function installation(): InstalledPlugin {
    return {
      id: "chrome-plugin",
      serverId: "host",
      clientBundle: "",
      lifetime: new AbortController(),
      queryClient: new QueryClient(),
      cleanup: () => undefined,
      settingsScreens: [],
      surfaces: [],
      sidebarItems: { header: [], footer: [] },
      legacySidebarItems: [],
      workspacePanels: [],
      commandCenterItems: [],
      clientSlashCommands: [],
      attachmentSources: [],
      themes: [],
      timelineTransformers: [],
      timelineRenderers: [],
    };
  }

  it("renders a sidebar item's content on its first frame", () => {
    const { client } = clientWithWorkspace("workspace-a");
    function Item() {
      usePaseo();
      return <span>Deploys</span>;
    }

    const markup = renderToStaticMarkup(
      <PluginSharedRuntimeBoundary plugin={installation()} client={client}>
        <Item />
      </PluginSharedRuntimeBoundary>,
    );

    expect(markup).toBe("<span>Deploys</span>");
  });

  it("gives every item of an installation one runtime, and a new one for a new host client", () => {
    const plugin = installation();
    const hostA = clientWithWorkspace("workspace-a").client;
    const hostB = clientWithWorkspace("workspace-b").client;
    const first = getSharedPluginSurfaceRuntime(hostA, plugin);

    expect(first).not.toBeNull();
    expect(getSharedPluginSurfaceRuntime(hostA, plugin)).toBe(first);
    expect(getSharedPluginSurfaceRuntime(hostA, installation())).not.toBe(first);
    expect(getSharedPluginSurfaceRuntime(hostB, plugin)).not.toBe(first);
  });

  it("has no runtime once the installation is gone", () => {
    const plugin = installation();
    plugin.lifetime.abort();

    expect(getSharedPluginSurfaceRuntime(clientWithWorkspace("a").client, plugin)).toBeNull();
  });
});
