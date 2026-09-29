import { useEffect, useState } from "react";
import type { InstalledPlugin } from "./types";
import { createPaseoApi, type PaseoApi } from "@getpaseo/client";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";

export interface PluginSurfaceRuntime {
  paseo: PaseoApi;
  invoke(method: string, input: unknown): Promise<unknown>;
}

export function createPluginSurfaceRuntime(
  client: DaemonClient | null,
  plugin: Pick<InstalledPlugin, "id" | "lifetime">,
): PluginSurfaceRuntime | null {
  if (!client || plugin.lifetime.signal.aborted) return null;
  return {
    paseo: createPaseoApi(client, { signal: plugin.lifetime.signal }),
    invoke: (method, input) => client.invokePluginRpc(plugin.id, method, input),
  };
}

/** A mounted surface owns its API; creating a React element creates no server demand. */
export function usePluginSurfaceRuntime(
  client: DaemonClient | null,
  plugin: InstalledPlugin | null | undefined,
): PluginSurfaceRuntime | null {
  const [mounted, setMounted] = useState<{
    client: DaemonClient;
    plugin: InstalledPlugin;
    runtime: PluginSurfaceRuntime;
  } | null>(null);
  useEffect(() => {
    if (!client || !plugin) return;
    const runtime = createPluginSurfaceRuntime(client, plugin);
    if (!runtime) return;
    setMounted({ client, plugin, runtime });
    return () => {
      void runtime.paseo
        .dispose()
        .catch((error) => console.warn(`[Plugins] Surface cleanup failed for ${plugin.id}`, error));
    };
  }, [client, plugin]);
  return mounted?.client === client && mounted.plugin === plugin ? mounted.runtime : null;
}

const sharedRuntimes = new WeakMap<
  InstalledPlugin,
  { client: DaemonClient; runtime: PluginSurfaceRuntime | null }
>();

/**
 * The installation's runtime for sidebar item rows. Created on first use during render, so a row's
 * first frame already has content, and shared by every row of the installation. It closes with the
 * installation's lifetime, so anything shorter-lived, such as a popover, owns its own runtime.
 */
export function getSharedPluginSurfaceRuntime(
  client: DaemonClient,
  plugin: InstalledPlugin,
): PluginSurfaceRuntime | null {
  const cached = sharedRuntimes.get(plugin);
  if (cached?.client === client) return cached.runtime;
  const runtime = createPluginSurfaceRuntime(client, plugin);
  sharedRuntimes.set(plugin, { client, runtime });
  return runtime;
}
