import { useEffect, useMemo, useState } from "react";
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

/**
 * A runtime created during render, for a surface that must have content on its first frame, such
 * as a sidebar item. It is a scope over the host's client, not a new connection: it owns what the
 * surface subscribes to while mounted and releases it when the surface unmounts, moves to another
 * host, or its installation stops.
 */
export function usePluginRenderedRuntime(
  client: DaemonClient,
  plugin: InstalledPlugin,
): PluginSurfaceRuntime | null {
  const scope = useMemo(() => createPluginSurfaceScope(client, plugin), [client, plugin]);
  useEffect(() => scope?.retain(), [scope]);
  return scope?.runtime ?? null;
}

interface PluginSurfaceScope {
  runtime: PluginSurfaceRuntime;
  /** Keeps the scope open while mounted; the returned release closes it once nothing retains it. */
  retain(): () => void;
}

/**
 * A render may be discarded without an effect, so the scope holds nothing outside itself until
 * retained. Release closes it a microtask later, so StrictMode's unmount and remount in one
 * commit keeps the scope its children already subscribed through.
 */
export function createPluginSurfaceScope(
  client: DaemonClient,
  plugin: InstalledPlugin,
): PluginSurfaceScope | null {
  if (plugin.lifetime.signal.aborted) return null;
  const lifetime = new AbortController();
  const runtime = createPluginSurfaceRuntime(client, { id: plugin.id, lifetime });
  if (!runtime) return null;
  const close = () => lifetime.abort();
  let retained = 0;
  return {
    runtime,
    retain() {
      retained += 1;
      plugin.lifetime.signal.addEventListener("abort", close, { once: true });
      return () => {
        retained -= 1;
        queueMicrotask(() => {
          if (retained > 0) return;
          plugin.lifetime.signal.removeEventListener("abort", close);
          close();
        });
      };
    },
  };
}
