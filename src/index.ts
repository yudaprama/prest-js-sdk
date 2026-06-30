/**
 * prest-js-sdk
 *
 * TypeScript SDK for pREST (PostgreSQL REST API). Provides route-shaped methods
 * for catalog/CRUD/stored-queries plus a typed filter DSL that serializes to
 * pREST's `?field=op.value` URL syntax.
 *
 * Usage:
 *   import { PrestClient } from "prest-js-sdk";
 *
 *   const client = new PrestClient("http://localhost:3000");
 *
 *   // Catalog
 *   const dbs = await client.databases();
 *
 *   // Query with typed filter
 *   const rows = await client.select<Balance>("plano", "public", "billing_balances", {
 *     where: { actor_id: { eq: 42 }, status: "active" },
 *     select: ["id", "balance"],
 *     order: ["balance:desc"],
 *     limit: 10,
 *   });
 *
 *   // Insert
 *   const [row] = await client.insert<Balance>("plano", "public", "billing_balances", {
 *     actor_id: 42, balance: 100.50, status: "active",
 *   });
 *
 *   // Update (filter + new values)
 *   const updated = await client.update<Balance>(
 *     "plano", "public", "billing_balances",
 *     { actor_id: 42 },
 *     { status: "frozen" },
 *   );
 *
 *   // Delete
 *   await client.delete("plano", "public", "billing_balances", { actor_id: 42 });
 *
 *   // Stored SQL (prest/etc/queries/reports/top_balances.sql)
 *   const top = await client.query<Balance>("reports", "top_balances", { min: 1000 });
 *
 *   // Forward-compat Kratos auth (works once [auth.kratos] is wired into prest)
 *   const authed = await PrestClient.fromKratosSession(
 *     "http://localhost:4433",
 *     "http://localhost:3000",
 *   );
 */

// ============================================================
// Types
// ============================================================

export interface PrestConfig {
  /** pREST base URL, e.g. http://localhost:3000 */
  prestUrl: string;
  /** Optional bearer token (JWT from POST /auth, or Kratos session for forward-compat) */
  authToken?: string;
  /** Optional: pre-built Authorization header value (skips "Bearer " prefix) */
  rawAuthHeader?: string;
  /** Optional: extra headers merged into every request */
  headers?: Record<string, string>;
  /**
   * Optional: fetch credentials mode. Set to `"include"` to send cookies on
   * cross-origin requests — required when pREST sits behind a cookie-auth edge
   * (e.g. Ory Oathkeeper validating a Kratos session). Defaults to fetch's
   * `"same-origin"`.
   */
  credentials?: RequestCredentials;
}

/**
 * Filter operators supported by pREST's `?field=op.value` syntax.
 * Mirrors `prest/adapters/postgres/postgres.go` GetQueryOperator (line ~1474).
 *
 * `tsquery` / `tsquery(cfg)` are SuffixType operators (see `adapters/postgres/postgres.go`
 * `case "tsquery"` around line 463): they emit `<col>@@to_tsquery('<cfg>', '<val>')`
 * when the config is supplied, or `<col>@@to_tsquery('<val>')` when omitted.
 */
export type Operator =
  | "eq" | "ne" | "gt" | "gte" | "lt" | "lte"
  | "in" | "nin" | "any" | "some" | "all"
  | "null" | "notnull" | "true" | "nottrue" | "false" | "notfalse"
  | "like" | "ilike" | "nlike" | "nilike"
  | "tsquery" | "tsquery(english)";

export type OpValue = string | number | (string | number)[];

/**
 * Filter on table columns.
 *
 * - `{ field: value }` — shorthand for `{ field: { eq: value } }`
 * - `{ field: null }` — IS NULL
 * - `{ field: { op: value } }` — operator form, e.g. `{ age: { gt: 30 } }`
 * - `{ field: tsquery("hello world") }` — Postgres FTS, e.g. `{ content_tsv: tsquery("deploy") }`
 *   → `?content_tsv$tsquery=deploy`. Use the `tsquery()` helper from this package.
 *
 * Multiple fields are AND-ed. For OR across fields, use `SelectOpts.or`.
 */
export type Filter = {
  [field: string]:
    | string
    | number
    | boolean
    | null
    | { [op in Operator]?: OpValue };
};

export interface SelectOpts {
  /** WHERE clause — AND-ed across fields */
  where?: Filter;
  /** Column selection — `_select=col1,col2` */
  select?: string[];
  /** Order — `_order=col1,col2:desc` */
  order?: string[];
  /** Page-based pagination (1-indexed) — `_page=N&_size=M` */
  page?: number;
  size?: number;
  /** Offset-based pagination — `_limit=N&_offset=M` */
  limit?: number;
  offset?: number;
  /** DISTINCT — `_distinct=true` */
  distinct?: boolean;
  /** COUNT rows instead of returning them — `_count=true` */
  count?: boolean;
  /** Return just the count as a single object — `_count_first=true` */
  countFirst?: boolean;
  /** GROUP BY columns — `_groupby=col1,col2` */
  groupBy?: string[];
  /** OR-clauses for the WHERE — joined with OR inside parens */
  or?: Filter[];
  /** Columns to return from update/delete — `_returning=col1,col2` */
  returning?: string[];
  /**
   * Rewrite response keys from snake_case to camelCase. Off by default so
   * existing callers keep the Postgres-verbatim shape. Turn on at the
   * boundary where a frontend store / serializer expects camelCase.
   */
  camelCase?: boolean;
}

export class PrestApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(`[${status}] ${message}`);
    this.name = "PrestApiError";
  }
}

export { camelizeKey, camelizeKeys } from "./camelize.js";
import { camelizeKeys } from "./camelize.js";

// ============================================================
// Filter serializer (the heart of the DSL)
// ============================================================

const VALUELESS_OPS = new Set<Operator>([
  "null", "notnull", "true", "nottrue", "false", "notfalse",
]);

const ARRAY_OPS = new Set<Operator>(["in", "nin", "any", "some", "all"]);

function serializeOpValue(op: Operator, val: OpValue | undefined): string {
  if (VALUELESS_OPS.has(op)) {
    return op; // ?field=null
  }
  if (ARRAY_OPS.has(op)) {
    const arr = Array.isArray(val) ? val : val === undefined ? [] : [val];
    return `${op}.(${arr.join(",")})`;
  }
  // tsquery uses pREST's suffix syntax — emitted at the field level, not here.
  // The serializer detects `op === "tsquery"` (or `tsquery(config)`) and skips
  // the `op.` prefix; it just writes the raw search string.
  if (op === "tsquery" || op.startsWith("tsquery(")) {
    return val === undefined ? "" : String(val);
  }
  const v = val === undefined ? "" : typeof val === "string" ? val : String(val);
  return `${op}.${v}`;
}

/**
 * Marker for full-text search on a `*_tsv` column.
 *
 *   tsquery("hello world")           → ?col$tsquery=hello+world
 *   tsquery("hello", "english")      → ?col$tsquery(english)=hello
 *
 * Use against the generated `*_tsv` columns (see migration
 * 0111_add_postgres_fts.sql). The text is sent raw to pREST — no
 * quoting or escaping — so prefer plain words. For relevance-ranked
 * search, hit `/_QUERIES/lobehub/{messages,topics}SearchFts` instead
 * (Tier 2 templates that wrap `ts_rank(...)`).
 */
export function tsquery(q: string, config?: string): { tsquery: string } | Record<string, string> {
  if (config) return { [`tsquery(${config})`]: q };
  return { tsquery: q };
}

/**
 * Serialize a Filter into pREST URL query params.
 *
 * Each field becomes one or more entries: `field=op.value`. Multiple ops on the
 * same field are emitted as repeated query params (pREST AND-s them).
 *
 * @example
 *   serializeFilter({ actor_id: 42 })
 *   // → "actor_id=eq.42"
 *   serializeFilter({ age: { gt: 30 }, name: { like: "foo%" } })
 *   // → "age=gt.30&name=like.foo%25"
 *   serializeFilter({ id: { in: [1, 2, 3] }, status: null })
 *   // → "id=in.(1,2,3)&status=null"
 */
export function serializeFilter(filter: Filter): URLSearchParams {
  const params = new URLSearchParams();
  for (const [field, condition] of Object.entries(filter)) {
    if (condition === null || condition === undefined) {
      params.append(field, "null");
      continue;
    }
    if (typeof condition === "object" && !Array.isArray(condition)) {
      for (const [op, val] of Object.entries(condition)) {
        if (op === "tsquery" || op.startsWith("tsquery(")) {
          // pREST suffix syntax: the operator hangs off the field name with `$`,
          // value is the raw search string (no `op.` prefix).
          params.append(`${field}$${op}`, serializeOpValue(op as Operator, val as OpValue));
          continue;
        }
        params.append(field, serializeOpValue(op as Operator, val as OpValue));
      }
      continue;
    }
    // Primitive shorthand
    if (typeof condition === "boolean") {
      params.append(field, condition ? "true" : "false");
    } else {
      params.append(field, `eq.${condition}`);
    }
  }
  return params;
}

/**
 * Serialize full SelectOpts into URLSearchParams (filter + modifiers).
 */
export function serializeSelectOpts(opts: SelectOpts): URLSearchParams {
  const params = opts.where ? serializeFilter(opts.where) : new URLSearchParams();

  if (opts.select?.length) params.set("_select", opts.select.join(","));
  if (opts.order?.length) params.set("_order", opts.order.join(","));
  if (opts.distinct) params.set("_distinct", "true");
  if (opts.count) params.set("_count", "true");
  if (opts.countFirst) params.set("_count_first", "true");
  if (opts.groupBy?.length) params.set("_groupby", opts.groupBy.join(","));
  if (opts.returning?.length) params.set("_returning", opts.returning.join(","));

  if (opts.or?.length) {
    // pREST format: _or=field=op.value,field=op.value
    const parts: string[] = [];
    for (const f of opts.or) {
      const fp = serializeFilter(f);
      fp.forEach((v, k) => parts.push(`${k}=${v}`));
    }
    params.set("_or", parts.join(","));
  }

  if (opts.page !== undefined) params.set("_page", String(opts.page));
  if (opts.size !== undefined) params.set("_size", String(opts.size));
  if (opts.limit !== undefined) params.set("_limit", String(opts.limit));
  if (opts.offset !== undefined) params.set("_offset", String(opts.offset));

  return params;
}

// ============================================================
// PrestClient
// ============================================================

export class PrestClient {
  private readonly prestUrl: string;
  private authHeader: string | undefined;
  private readonly extraHeaders: Record<string, string>;
  private readonly credentials: RequestCredentials | undefined;

  constructor(config: PrestConfig | string) {
    if (typeof config === "string") {
      // Shortcut: new PrestClient(url, authToken?)
      this.prestUrl = config.replace(/\/+$/, "");
      const token = arguments[1] as string | undefined;
      this.authHeader = token ? `Bearer ${token}` : undefined;
      this.extraHeaders = {};
      this.credentials = undefined;
    } else {
      this.prestUrl = config.prestUrl.replace(/\/+$/, "");
      this.authHeader =
        config.rawAuthHeader ??
        (config.authToken ? `Bearer ${config.authToken}` : undefined);
      this.extraHeaders = { ...(config.headers ?? {}) };
      this.credentials = config.credentials;
    }
  }

  /**
   * Forward-compat factory: validate a Kratos session and build a PrestClient.
   *
   * The vanilla pREST submodule does not yet wire Kratos (the planned
   * `[auth.kratos]` middleware is documented in the parent project's CLAUDE.md
   * but not merged into the submodule). This helper validates the session
   * against Kratos and stores it as a Bearer header, so it will Just Work
   * once the integration lands. Today it's useful if you're running a patched
   * prest build with Kratos auth.
   *
   * @param kratosUrl - Kratos public URL, e.g. http://localhost:4433
   * @param prestUrl - pREST base URL, defaults to http://localhost:3000
   * @param sessionToken - Optional token. Reads `ory_kratos_session` cookie if omitted (browser).
   * @returns PrestClient, or null if no valid session was found.
   */
  static async fromKratosSession(
    kratosUrl: string,
    prestUrl = "http://localhost:3000",
    sessionToken?: string,
  ): Promise<PrestClient | null> {
    const token =
      sessionToken ??
      (typeof document !== "undefined" ? readCookie("ory_kratos_session") : undefined);
    if (!token) return null;

    const valid = await validateKratosSession(kratosUrl, token);
    if (!valid) return null;

    return new PrestClient({ prestUrl, authToken: token });
  }

  /**
   * Set or replace the auth token after construction.
   * Useful after calling `login()`. Returns `this` for chaining.
   */
  setAuthToken(token: string): this {
    this.authHeader = `Bearer ${token}`;
    return this;
  }

  // ─── Low-level request helper ────────────────────────────────────────────

  /**
   * Escape hatch for endpoints not covered by the typed methods.
   * Throws PrestApiError on non-2xx.
   */
  async request<T = unknown>(
    method: string,
    path: string,
    init?: {
      body?: BodyInit | null;
      headers?: Record<string, string>;
      params?: URLSearchParams;
    },
  ): Promise<T> {
    const url = new URL(
      `${path.startsWith("/") ? "" : "/"}${path}`,
      this.prestUrl,
    );
    if (init?.params) {
      init.params.forEach((v, k) => url.searchParams.append(k, v));
    }

    const res = await fetch(url.toString(), {
      method,
      headers: {
        Accept: "application/json",
        ...(this.authHeader ? { Authorization: this.authHeader } : {}),
        ...this.extraHeaders,
        ...(init?.body && !(init.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...init?.headers,
      },
      body: init?.body ?? null,
      redirect: "manual",
      ...(this.credentials ? { credentials: this.credentials } : {}),
    });

    const text = await res.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    if (!res.ok) {
      const msg =
        (body && typeof body === "object" && "error" in body
          ? String((body as Record<string, unknown>).error)
          : res.statusText) || `HTTP ${res.status}`;
      throw new PrestApiError(res.status, msg, body);
    }
    return body as T;
  }

  // ─── Authz check ─────────────────────────────────────────────────────────

  /**
   * `GET /authz/check` — check a workspace permission via Ory Keto.
   *
   * @param params.object     (required) — e.g. workspace ID
   * @param params.relation   (required) — e.g. "view", "write", "manage"
   * @param params.namespace  (optional, default "workspace")
   * @param params.subject_id (optional — defaults to X-User-Id header)
   */
  async checkAuthz(params: {
    object: string;
    relation: string;
    namespace?: string;
    subject_id?: string;
  }): Promise<{ allowed: boolean }> {
    const qs = new URLSearchParams();
    qs.set("object", params.object);
    qs.set("relation", params.relation);
    if (params.namespace) qs.set("namespace", params.namespace);
    if (params.subject_id) qs.set("subject_id", params.subject_id);
    return this.request("GET", "/authz/check", { params: qs });
  }

  // ─── Catalog ─────────────────────────────────────────────────────────────

  /** `GET /databases` — list database names. */
  databases(): Promise<unknown> {
    return this.request("GET", "/databases");
  }

  /** `GET /schemas` — list schema names. */
  schemas(): Promise<unknown> {
    return this.request("GET", "/schemas");
  }

  /** `GET /tables` — list table names. */
  tables(): Promise<unknown> {
    return this.request("GET", "/tables");
  }

  /** `GET /{database}/{schema}` — list tables in a specific database/schema. */
  tablesIn(database: string, schema: string): Promise<unknown> {
    return this.request(
      "GET",
      `/${encodeURIComponent(database)}/${encodeURIComponent(schema)}`,
    );
  }

  /** `GET /show/{database}/{schema}/{table}` — table description / columns. */
  showTable(
    database: string,
    schema: string,
    table: string,
  ): Promise<Record<string, unknown>> {
    return this.request(
      "GET",
      `/show/${encodeURIComponent(database)}/${encodeURIComponent(schema)}/${encodeURIComponent(table)}`,
    );
  }

  // ─── CRUD ────────────────────────────────────────────────────────────────

  /**
   * `GET /{db}/{schema}/{table}` — SELECT with typed filter DSL.
   *
   * For Postgres full-text search on a `*_tsv` column, use the `tsquery()` helper:
   *
   * ```ts
   *   await client.select("lobehub", "public", "messages", {
   *     where: { messages_tsv: tsquery("deploy failed") },
   *     order: ["created_at:desc"],
   *     size: 20,
   *   });
   *
   *   // With explicit config:
   *   await client.select("lobehub", "public", "topics", {
   *     where: { topics_tsv: tsquery("deploy", "english") },
   *   });
   * ```
   *
   * For relevance-ranked search, use `client.query("lobehub", "messagesSearchFts", { q: ... })`
   * instead — Tier 2 templates that wrap `ts_rank(...)`.
   */
  select<T = unknown>(
    database: string,
    schema: string,
    table: string,
    opts: SelectOpts = {},
  ): Promise<T[]> {
    const { camelCase, ...rest } = opts;
    const params = serializeSelectOpts(rest);
    const rows = this.request<T[]>(
      "GET",
      `/${encodeURIComponent(database)}/${encodeURIComponent(schema)}/${encodeURIComponent(table)}`,
      { params },
    );
    return camelCase ? rows.then((r) => camelizeKeys<T[]>(r)) : rows;
  }

  /** `POST /{db}/{schema}/{table}` — insert a single row. */
  insert<T = unknown>(
    database: string,
    schema: string,
    table: string,
    data: Record<string, unknown>,
    opts: { camelCase?: boolean } = {},
  ): Promise<T[]> {
    const rows = this.request<T[]>(
      "POST",
      `/${encodeURIComponent(database)}/${encodeURIComponent(schema)}/${encodeURIComponent(table)}`,
      { body: JSON.stringify(data) },
    );
    return opts.camelCase ? rows.then((r) => camelizeKeys<T[]>(r)) : rows;
  }

  /** `POST /batch/{db}/{schema}/{table}` — insert multiple rows in one call. */
  insertBatch<T = unknown>(
    database: string,
    schema: string,
    table: string,
    rows: Record<string, unknown>[],
    opts: { camelCase?: boolean } = {},
  ): Promise<T[]> {
    const result = this.request<T[]>(
      "POST",
      `/batch/${encodeURIComponent(database)}/${encodeURIComponent(schema)}/${encodeURIComponent(table)}`,
      { body: JSON.stringify(rows) },
    );
    return opts.camelCase ? result.then((r) => camelizeKeys<T[]>(r)) : result;
  }

  /** `PUT /{db}/{schema}/{table}?filter` — update rows matching filter. */
  update<T = unknown>(
    database: string,
    schema: string,
    table: string,
    where: Filter,
    data: Record<string, unknown>,
    opts: { camelCase?: boolean } = {},
  ): Promise<T[]> {
    const params = serializeFilter(where);
    const rows = this.request<T[]>(
      "PUT",
      `/${encodeURIComponent(database)}/${encodeURIComponent(schema)}/${encodeURIComponent(table)}`,
      { body: JSON.stringify(data), params },
    );
    return opts.camelCase ? rows.then((r) => camelizeKeys<T[]>(r)) : rows;
  }

  /** `DELETE /{db}/{schema}/{table}?filter` — delete rows matching filter. */
  delete<T = unknown>(
    database: string,
    schema: string,
    table: string,
    where: Filter,
    opts: { camelCase?: boolean } = {},
  ): Promise<T[]> {
    const params = serializeFilter(where);
    const rows = this.request<T[]>(
      "DELETE",
      `/${encodeURIComponent(database)}/${encodeURIComponent(schema)}/${encodeURIComponent(table)}`,
      { params },
    );
    return opts.camelCase ? rows.then((r) => camelizeKeys<T[]>(r)) : rows;
  }

  // ─── Stored queries ──────────────────────────────────────────────────────

  /**
   * Execute a stored SQL script: `GET /_QUERIES/{location}/{script}`.
   *
   * Scripts live in `<prest queries dir>/<location>/<script>.sql` and can
   * reference params as `{{ sqlVal "key" }}` / `{{ sqlList "key" }}` in
   * pREST's template syntax.
   *
   * @param location - Folder name under prest's `queries` directory.
   * @param script - `.sql` filename without the extension.
   * @param params - Rendered as URL query params; accessible in the SQL template.
   */
  query<T = unknown>(
    location: string,
    script: string,
    params: Record<string, string | number | boolean> = {},
    opts: { camelCase?: boolean } = {},
  ): Promise<T[]> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
    const rows = this.request<T[]>(
      "GET",
      `/_QUERIES/${encodeURIComponent(location)}/${encodeURIComponent(script)}`,
      { params: qs },
    );
    return opts.camelCase ? rows.then((r) => camelizeKeys<T[]>(r)) : rows;
  }

  // ─── Health & auth ───────────────────────────────────────────────────────

  /** `GET /_health` — returns true on 2xx, false otherwise. */
  async health(): Promise<boolean> {
    try {
      await this.request("GET", "/_health");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * `POST /auth` — exchange username/password for a JWT.
   * Stores the returned token and attaches it as `Authorization: Bearer <token>`
   * on subsequent requests.
   *
   * Only works when pREST's `[auth]` block is enabled in `prest.toml`.
   * Returns the token string.
   */
  async login(username: string, password: string): Promise<string> {
    const res = await this.request<{ token?: string }>("POST", "/auth", {
      body: JSON.stringify({ username, password }),
    });
    const token = res.token;
    if (!token) {
      throw new PrestApiError(200, "auth response missing 'token' field", res);
    }
    this.setAuthToken(token);
    return token;
  }
  // ─── Typed table client ──────────────────────────────────────────────────

  /**
   * Create a type-safe sub-client bound to a specific database, schema, and
   * table map. All CRUD methods become constrained to the table map's keys
   * and row types — no manual generics needed at call sites.
   *
   *   interface LobehubTables { agents: AgentRow; sessions: SessionRow; ... }
   *   const db = client.forSchema<LobehubTables>("lobehub", "public");
   *   const rows = await db.select("agents", { where: { user_id: "abc" } });
   *   // rows is AgentRow[]
   */
  forSchema<Tables>(
    database: string,
    schema: string,
  ): TypedPrestClient<Tables> {
    return new TypedPrestClient(this, database, schema);
  }
}

// ============================================================
// Typed client — binds PrestClient to a table map
// ============================================================

/**
 * Shape expected by TypedPrestClient — matches pg-to-ts's `TableTypes` output
 * where each table maps to `{ select: RowType, input: InsertType }`.
 */
export interface TableMap {
  [table: string]: { select: object; input: object };
}

// Helper types to extract select/input from table map entries
type SelectOf<T> = T extends { select: infer S } ? S : never;
type InputOf<T> = T extends { input: infer I } ? I : never;

export class TypedPrestClient<Tables> {
  constructor(
    private readonly client: PrestClient,
    private readonly database: string,
    private readonly schema: string,
  ) {}

  select<K extends keyof Tables & string>(
    table: K,
    opts: SelectOpts = {},
  ): Promise<SelectOf<Tables[K]>[]> {
    return this.client.select(this.database, this.schema, table, opts);
  }

  insert<K extends keyof Tables & string>(
    table: K,
    data: InputOf<Tables[K]>,
    opts: { camelCase?: boolean } = {},
  ): Promise<SelectOf<Tables[K]>[]> {
    return this.client.insert(
      this.database,
      this.schema,
      table,
      data as Record<string, unknown>,
      opts,
    );
  }

  insertBatch<K extends keyof Tables & string>(
    table: K,
    rows: InputOf<Tables[K]>[],
    opts: { camelCase?: boolean } = {},
  ): Promise<SelectOf<Tables[K]>[]> {
    return this.client.insertBatch(
      this.database,
      this.schema,
      table,
      rows as unknown as Record<string, unknown>[],
      opts,
    );
  }

  update<K extends keyof Tables & string>(
    table: K,
    where: Filter,
    data: Partial<InputOf<Tables[K]>>,
    opts: { camelCase?: boolean } = {},
  ): Promise<SelectOf<Tables[K]>[]> {
    return this.client.update(
      this.database,
      this.schema,
      table,
      where,
      data as Record<string, unknown>,
      opts,
    );
  }

  delete<K extends keyof Tables & string>(
    table: K,
    where: Filter,
    opts: { camelCase?: boolean } = {},
  ): Promise<SelectOf<Tables[K]>[]> {
    return this.client.delete(this.database, this.schema, table, where, opts);
  }

  /** Execute a stored SQL query scoped to this client's database. */
  query<T = unknown>(
    location: string,
    script: string,
    params: Record<string, string | number | boolean> = {},
    opts: { camelCase?: boolean } = {},
  ): Promise<T[]> {
    return this.client.query(location, script, params, opts);
  }
}

// ============================================================
// Helpers (Kratos session validation — mirrors alist-kratos-sdk)
// ============================================================

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : undefined;
}

async function validateKratosSession(
  kratosUrl: string,
  token: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${kratosUrl.replace(/\/+$/, "")}/sessions/whoami`, {
      headers: { "X-Session-Token": token, Accept: "application/json" },
    });
    if (!res.ok) return false;
    const session = (await res.json()) as { active?: boolean };
    return session.active === true;
  } catch {
    return false;
  }
}
