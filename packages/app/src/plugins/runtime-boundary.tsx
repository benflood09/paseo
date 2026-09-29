import { QueryClientProvider } from "@tanstack/react-query";
import { PaseoApiProvider, PluginRpcProvider } from "@getpaseo/plugin/client/host";
import React, { type ReactNode } from "react";
import type { InstalledPlugin } from "./types";
import {
  getSharedPluginSurfaceRuntime,
  usePluginSurfaceRuntime,
  type PluginSurfaceRuntime,
} from "./surface-runtime";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";

interface PluginRuntimeBoundaryProps {
  plugin: InstalledPlugin;
  client: DaemonClient;
  children: ReactNode;
}

/** A screen, panel, or timeline row: it owns a runtime while mounted and renders once it has one. */
export function PluginRuntimeBoundary({ plugin, client, children }: PluginRuntimeBoundaryProps) {
  const runtime = usePluginSurfaceRuntime(client, plugin);
  return (
    <PluginRuntimeProviders plugin={plugin} runtime={runtime}>
      {children}
    </PluginRuntimeProviders>
  );
}

/** Sidebar item rows: the installation's shared runtime, so they render on their first frame. */
export function PluginSharedRuntimeBoundary({
  plugin,
  client,
  children,
}: PluginRuntimeBoundaryProps) {
  const runtime = getSharedPluginSurfaceRuntime(client, plugin);
  return (
    <PluginRuntimeProviders plugin={plugin} runtime={runtime}>
      {children}
    </PluginRuntimeProviders>
  );
}

function PluginRuntimeProviders({
  plugin,
  runtime,
  children,
}: {
  plugin: InstalledPlugin;
  runtime: PluginSurfaceRuntime | null;
  children: ReactNode;
}) {
  if (!runtime) return null;
  return (
    <QueryClientProvider client={plugin.queryClient}>
      <PaseoApiProvider paseo={runtime.paseo}>
        <PluginRpcProvider invoke={runtime.invoke}>{children}</PluginRpcProvider>
      </PaseoApiProvider>
    </QueryClientProvider>
  );
}
