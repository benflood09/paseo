import type { PluginScreenParams } from "@getpaseo/plugin/client";
import type { PluginSurfaceContributionIdentity } from "./surface-contribution";

type PluginSurfaceRoute<Kind extends PluginSurfaceContributionIdentity["kind"]> =
  `/h/${string}/plugin/${string}/${Kind}/${string}`;

/** The screen route's own segments. Screen params share its query, so they can't use these. */
const ROUTE_PARAM_KEYS = new Set(["serverId", "pluginId", "contributionKind", "contributionId"]);

/** Screen params ride in the route's query, so reload, history and deep links keep them. */
export function buildPluginSurfaceRoute<Identity extends PluginSurfaceContributionIdentity>(
  serverId: string,
  pluginId: string,
  identity: Identity,
  params: PluginScreenParams = {},
): PluginSurfaceRoute<Identity["kind"]> {
  const path = `/h/${encodeURIComponent(serverId)}/plugin/${encodeURIComponent(pluginId)}/${identity.kind}/${encodeURIComponent(identity.id)}`;
  const query = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  return (query ? `${path}?${query}` : path) as PluginSurfaceRoute<Identity["kind"]>;
}

/**
 * Checks params a plugin passed to `openScreen`: an object of string keys and string values that
 * don't collide with the route's own segments. Throws otherwise.
 */
export function parsePluginScreenParams(value: unknown): PluginScreenParams {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Plugin screen params must be an object of strings");
  }
  const params: PluginScreenParams = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string") {
      throw new Error(`Plugin screen param ${key} must be a string`);
    }
    if (ROUTE_PARAM_KEYS.has(key)) throw new Error(`Plugin screen param ${key} is reserved`);
    params[key] = entry;
  }
  return params;
}

/** The screen params in a plugin screen route's search params (`useLocalSearchParams`). */
export function pluginScreenParamsFromRoute(
  routeParams: Readonly<Record<string, string | string[] | undefined>>,
): PluginScreenParams {
  const params: PluginScreenParams = {};
  for (const [key, value] of Object.entries(routeParams)) {
    if (ROUTE_PARAM_KEYS.has(key) || typeof value !== "string") continue;
    params[key] = value;
  }
  return params;
}

export function buildLegacyPluginSurfaceRedirectRoute(
  serverId: string,
  pluginId: string,
  sidebarContributionId: string,
): `/h/${string}/plugin/${string}/sidebar/${string}` {
  return buildPluginSurfaceRoute(serverId, pluginId, {
    kind: "sidebar",
    id: sidebarContributionId,
  });
}

export function hostIdFromPathname(pathname: string): string | null {
  const encoded = /^\/h\/([^/]+)/.exec(pathname)?.[1];
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

export function parsePluginSurfaceRoute(pathname: string): {
  serverId: string;
  pluginId: string;
  identity: PluginSurfaceContributionIdentity;
} | null {
  const match = /^\/h\/([^/]+)\/plugin\/([^/]+)\/(sidebar|surface)\/([^/]+)\/?$/.exec(pathname);
  if (!match) return null;
  try {
    return {
      serverId: decodeURIComponent(match[1]),
      pluginId: decodeURIComponent(match[2]),
      identity: { kind: match[3] as "sidebar" | "surface", id: decodeURIComponent(match[4]) },
    };
  } catch {
    return null;
  }
}
