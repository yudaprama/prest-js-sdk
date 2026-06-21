export type { TableTypes, Json } from "./lobehub-types.js";
export { tables } from "./lobehub-types.js";
export { PrestClient, TypedPrestClient } from "./index.js";
import type { TableTypes } from "./lobehub-types.js";
import { PrestClient, TypedPrestClient, type Filter, type SelectOpts } from "./index.js";

/**
 * Result row from the `agentSharesByUser` Tier 2 query.
 *
 * LobehubClient.agentSharesByUser returns these with camelCase keys by
 * default (SDK 0.7.0+). Use AgentShareRowRaw when opting out.
 */
export interface AgentShareRow {
  id: string;
  agentId: string;
  visibility: string;
  shareConfig: Record<string, unknown> | null;
  userViewCount: number;
  createdAt: string;
  updatedAt: string;
  agentTitle: string;
  agentSlug: string;
}

export interface AgentShareRowRaw {
  id: string;
  agent_id: string;
  visibility: string;
  share_config: Record<string, unknown> | null;
  user_view_count: number;
  created_at: string;
  updated_at: string;
  agent_title: string;
  agent_slug: string;
}

/**
 * A unified recent item — union of `topic`, `document`, and `task` arms.
 *
 * LobehubClient.recentByUser returns these with camelCase keys by default
 * (SDK 0.7.0+), so the type reflects the post-mapping shape.
 */
export interface RecentItem {
  id: string;
  metadata: Record<string, unknown> | null;
  routeGroupId: string | null;
  routeId: string | null;
  status: string | null;
  title: string;
  type: "topic" | "document" | "task";
  updatedAt: string;
}

/**
 * Raw (snake_case) shape — what pREST returns before LobehubClient's
 * auto-camelCase mapping. Useful when callers pass `camelCase: false`
 * to recentByUser.
 */
export interface RecentItemRaw {
  id: string;
  metadata: Record<string, unknown> | null;
  route_group_id: string | null;
  route_id: string | null;
  status: string | null;
  title: string;
  type: "topic" | "document" | "task";
  updated_at: string;
}

/**
 * Typed LobeHub client — wraps `TypedPrestClient<TableTypes>` with
 * convenience methods for Tier 2 stored queries.
 *
 * Responses are camelCased by default: pREST returns snake_case columns
 * (e.g. `saved_at`, `document_id`) but LobeHub's Zustand stores and
 * serializers expect camelCase (`savedAt`, `documentId`). The mapping
 * runs once at this boundary so call sites don't have to.
 *
 * Pass `{ camelCase: false }` on any call to keep raw snake_case keys.
 */
export class LobehubClient {
  constructor(private readonly inner: TypedPrestClient<TableTypes>) {}

  /** Typed table CRUD — mirrors `TypedPrestClient.select / insert / etc.` */
  get tables() {
    return this.inner;
  }

  /**
   * List agent shares owned by the authenticated user.
   * Maps to `/_QUERIES/lobehub/agentSharesByUser`.
   */
  agentSharesByUser(opts: {
    visibility?: "private" | "link";
    page?: number;
    size?: number;
    workspaceId?: string;
    workspaceScope?: "all";
    camelCase?: boolean;
  } = {}): Promise<AgentShareRow[]> {
    const { camelCase = true, ...rest } = opts;
    return this.inner.query("lobehub", "agentSharesByUser", rest as Record<string, string | number | boolean>, { camelCase });
  }

  /**
   * Fetch recent topics, documents, and tasks for the sidebar.
   * Maps to `/_QUERIES/lobehub/recentByUser`.
   */
  recentByUser(opts: {
    limit?: number;
    workspaceId?: string;
    workspaceScope?: "all";
    camelCase?: boolean;
  } = {}): Promise<RecentItem[]> {
    const { camelCase = true, ...rest } = opts;
    return this.inner.query("lobehub", "recentByUser", rest as Record<string, string | number | boolean>, { camelCase });
  }

  // ─── camelCase-aware CRUD shortcuts ────────────────────────────────────

  select<K extends keyof TableTypes & string>(
    table: K,
    opts: SelectOpts = {},
  ) {
    const { camelCase = true, ...rest } = opts;
    return this.inner.select(table, { ...rest, camelCase });
  }

  insert<K extends keyof TableTypes & string>(
    table: K,
    data: TableTypes[K] extends { input: infer I } ? I : never,
    opts: { camelCase?: boolean } = {},
  ) {
    const { camelCase = true } = opts;
    return this.inner.insert(table, data, { camelCase });
  }

  insertBatch<K extends keyof TableTypes & string>(
    table: K,
    rows: Array<TableTypes[K] extends { input: infer I } ? I : never>,
    opts: { camelCase?: boolean } = {},
  ) {
    const { camelCase = true } = opts;
    return this.inner.insertBatch(table, rows, { camelCase });
  }

  update<K extends keyof TableTypes & string>(
    table: K,
    where: Filter,
    data: Partial<TableTypes[K] extends { input: infer I } ? I : never>,
    opts: { camelCase?: boolean } = {},
  ) {
    const { camelCase = true } = opts;
    return this.inner.update(table, where, data, { camelCase });
  }

  delete<K extends keyof TableTypes & string>(
    table: K,
    where: Filter,
    opts: { camelCase?: boolean } = {},
  ) {
    const { camelCase = true } = opts;
    return this.inner.delete(table, where, { camelCase });
  }

  query<T = unknown>(
    location: string,
    script: string,
    params: Record<string, string | number | boolean> = {},
    opts: { camelCase?: boolean } = {},
  ): Promise<T[]> {
    const { camelCase = true } = opts;
    return this.inner.query(location, script, params, { camelCase });
  }
}

export function lobehubClient(client: PrestClient) {
  const inner = client.forSchema<TableTypes>("lobehub", "public");
  return new LobehubClient(inner);
}
