/**
 * @vitest-environment jsdom
 */
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { PaseoApi } from "@getpaseo/client";
import { PaseoApiProvider } from "@getpaseo/plugin/client/host";
import { usePaseo } from "@getpaseo/plugin/client";
import { act } from "@testing-library/react";
import React, { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { PluginRenderedRuntimeBoundary } from "./runtime-boundary";
import { createPluginSurfaceRuntime } from "./surface-runtime";
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

vi.hoisted(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

describe("sidebar item runtime", () => {
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

  /** A host client that records which event observations are open. */
  function observingClient() {
    const open = new Set<string>();
    let next = 0;
    const observeEvents = vi.fn(() => {
      const id = `observation-${++next}`;
      open.add(id);
      return {
        id,
        ready: Promise.resolve({ subscriptionId: id }),
        subscribe: () => () => undefined,
        release: async () => {
          open.delete(id);
        },
      };
    });
    return { client: { observeEvents } as unknown as DaemonClient, open, observeEvents };
  }

  /** Opens an observation when mounted and, like a careless plugin, never releases it. */
  function Observer({ name, opened }: { name: string; opened: Map<string, string[]> }) {
    const paseo = usePaseo();
    useEffect(() => {
      const observation = paseo.observeEvents(["project.update"]) as unknown as { id: string };
      opened.set(name, [...(opened.get(name) ?? []), observation.id]);
    }, [name, opened, paseo]);
    return <span>{name}</span>;
  }

  function Items({
    names,
    plugin,
    client,
    opened,
  }: {
    names: string[];
    plugin: InstalledPlugin;
    client: DaemonClient;
    opened: Map<string, string[]>;
  }) {
    return names.map((name) => (
      <PluginRenderedRuntimeBoundary key={name} plugin={plugin} client={client}>
        <Observer name={name} opened={opened} />
      </PluginRenderedRuntimeBoundary>
    ));
  }

  async function flush() {
    await act(async () => {
      await Promise.resolve();
    });
  }

  it("renders a sidebar item's content on its first frame", () => {
    const { client } = observingClient();
    function Item() {
      usePaseo();
      return <span>Deploys</span>;
    }

    const markup = renderToStaticMarkup(
      <PluginRenderedRuntimeBoundary plugin={installation()} client={client}>
        <Item />
      </PluginRenderedRuntimeBoundary>,
    );

    expect(markup).toBe("<span>Deploys</span>");
  });

  it("releases an item's observations when it unmounts, while its sibling on the same client keeps its own", async () => {
    const { client, open } = observingClient();
    const plugin = installation();
    const opened = new Map<string, string[]>();
    const root = createRoot(document.createElement("div"));
    const render = (names: string[]) =>
      act(() =>
        root.render(
          <StrictMode>
            <Items names={names} plugin={plugin} client={client} opened={opened} />
          </StrictMode>,
        ),
      );

    // StrictMode mounts, unmounts and remounts each item; the remount must not get a closed scope.
    render(["alerts", "deploys"]);
    await flush();
    expect(opened.get("alerts")).toHaveLength(2);
    expect([...open].sort()).toEqual([...opened.get("alerts")!, ...opened.get("deploys")!].sort());

    render(["deploys"]);
    await flush();
    expect([...open]).toEqual(opened.get("deploys"));

    act(() => root.unmount());
    await flush();
    expect(open.size).toBe(0);
  });

  it("releases an item's observations when its installation stops", async () => {
    const { client, open } = observingClient();
    const plugin = installation();
    const opened = new Map<string, string[]>();
    const root = createRoot(document.createElement("div"));
    act(() => {
      root.render(
        <PluginRenderedRuntimeBoundary plugin={plugin} client={client}>
          <Observer name="alerts" opened={opened} />
        </PluginRenderedRuntimeBoundary>,
      );
    });
    expect(open.size).toBe(1);

    plugin.lifetime.abort();
    await flush();
    expect(open.size).toBe(0);
    act(() => root.unmount());
  });

  it("has no runtime once the installation is gone", () => {
    const plugin = installation();
    plugin.lifetime.abort();

    const markup = renderToStaticMarkup(
      <PluginRenderedRuntimeBoundary plugin={plugin} client={observingClient().client}>
        <span>Deploys</span>
      </PluginRenderedRuntimeBoundary>,
    );

    expect(markup).toBe("");
  });
});
