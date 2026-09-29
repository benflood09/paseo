import type { PluginScreenLocation } from "@getpaseo/plugin/client";
import {
  parsePluginScreenParams,
  parsePluginSurfaceRoute,
  pluginScreenParamsFromRoute,
} from "./routes";
import type { InstalledPlugin } from "./types";

export type PluginSurfaceContributionIdentity =
  | { kind: "sidebar"; id: string }
  | { kind: "surface"; id: string };

/**
 * A `sidebar` identity is a legacy `addSidebarItem` route. A `surface` identity also reports the
 * legacy item pointing at it, so a screen opened from a legacy row keeps that row's title and icon.
 */
export function resolvePluginSurfaceContribution(
  plugin: InstalledPlugin | null,
  identity: PluginSurfaceContributionIdentity | null,
): {
  sidebarItem: InstalledPlugin["legacySidebarItems"][number] | null;
  surface: InstalledPlugin["surfaces"][number] | null;
} {
  if (!identity || !plugin) return { sidebarItem: null, surface: null };
  const sidebarItem =
    plugin.legacySidebarItems.find((contribution) =>
      identity.kind === "sidebar"
        ? contribution.id === identity.id
        : contribution.surface === identity.id,
    ) ?? null;
  const surfaceId = identity.kind === "sidebar" ? sidebarItem?.surface : identity.id;
  const surface = surfaceId
    ? (plugin.surfaces.find((contribution) => contribution.id === surfaceId) ?? null)
    : null;
  return { sidebarItem, surface };
}

/**
 * The installation's screen open at `pathname` with the route's search params, or null when the
 * route shows anything else.
 */
export function currentPluginScreen(
  plugin: InstalledPlugin,
  pathname: string,
  routeParams: Readonly<Record<string, string | string[] | undefined>>,
): PluginScreenLocation | null {
  const route = parsePluginSurfaceRoute(pathname);
  if (!route || route.serverId !== plugin.serverId || route.pluginId !== plugin.id) return null;
  const screenId = resolvePluginSurfaceContribution(plugin, route.identity).surface?.id;
  return screenId ? { screenId, params: pluginScreenParamsFromRoute(routeParams) } : null;
}

/** Checks an `openScreen` input against the installation's screens. Throws when it is invalid. */
export function parsePluginOpenScreenInput(
  plugin: InstalledPlugin,
  input: unknown,
): PluginScreenLocation {
  if (typeof input !== "object" || input === null || !("screenId" in input)) {
    throw new Error("openScreen takes { screenId, params? }");
  }
  const { screenId } = input;
  if (typeof screenId !== "string" || !plugin.surfaces.some((surface) => surface.id === screenId)) {
    throw new Error(`Plugin screen is unavailable: ${String(screenId)}`);
  }
  const params = "params" in input ? input.params : undefined;
  return { screenId, params: parsePluginScreenParams(params) };
}

export function getPluginSurfaceContributionServerIds(
  installations: readonly InstalledPlugin[],
  pluginId: string,
  identity: PluginSurfaceContributionIdentity,
): string[] {
  return installations
    .filter((installation) => {
      if (installation.id !== pluginId) return false;
      return identity.kind === "sidebar"
        ? installation.legacySidebarItems.some((contribution) => contribution.id === identity.id)
        : installation.surfaces.some((contribution) => contribution.id === identity.id);
    })
    .map((installation) => installation.serverId);
}
