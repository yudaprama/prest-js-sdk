// Verifies that serializeFilter and serializeSelectOpts produce the exact URL
// param strings pREST's `WhereByRequest` parser expects.
//
// Run: npm run build && node examples/filters.mjs
// Exits non-zero on first mismatch.
//
// Note: the test imports the compiled JS from dist/, so build first.

import assert from "node:assert";
import { serializeFilter, serializeSelectOpts } from "../dist/index.js";

let passed = 0;
function check(name, got, want) {
  assert.strictEqual(got, want, `${name}\n  got:  ${got}\n  want: ${want}`);
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("serializeFilter");

// Shorthand scalar → eq.
check(
  "scalar number shorthand",
  serializeFilter({ actor_id: 42 }).toString(),
  "actor_id=eq.42",
);

check(
  "scalar string shorthand",
  serializeFilter({ name: "alice" }).toString(),
  "name=eq.alice",
);

// Explicit operators
check(
  "gt operator",
  serializeFilter({ age: { gt: 30 } }).toString(),
  "age=gt.30",
);

check(
  "gte operator",
  serializeFilter({ age: { gte: 30 } }).toString(),
  "age=gte.30",
);

check(
  "like operator (URL-encoded %)",
  serializeFilter({ name: { like: "foo%" } }).toString(),
  "name=like.foo%25",
);

// Array operator
check(
  "in operator (parens, comma-separated)",
  serializeFilter({ id: { in: [1, 2, 3] } }).toString(),
  "id=in.%281%2C2%2C3%29", // URLSearchParams encodes ( ) ,
);

// Null / boolean shortcuts
check(
  "null shorthand → IS NULL",
  serializeFilter({ deleted_at: null }).toString(),
  "deleted_at=null",
);

check(
  "boolean true → IS TRUE",
  serializeFilter({ is_active: true }).toString(),
  "is_active=true",
);

check(
  "boolean false → IS FALSE",
  serializeFilter({ is_active: false }).toString(),
  "is_active=false",
);

// Multiple fields → AND-ed (separate params)
check(
  "multi-field AND",
  serializeFilter({ actor_id: 42, status: { eq: "active" } }).toString(),
  "actor_id=eq.42&status=eq.active",
);

console.log();
console.log("serializeSelectOpts");

check(
  "select + order + pagination",
  serializeSelectOpts({
    where: { actor_id: 42 },
    select: ["id", "amount"],
    order: ["amount:desc"],
    page: 1,
    size: 20,
  }).toString(),
  "actor_id=eq.42&_select=id%2Camount&_order=amount%3Adesc&_page=1&_size=20",
);

check(
  "distinct + count",
  serializeSelectOpts({ distinct: true, count: true }).toString(),
  "_distinct=true&_count=true",
);

check(
  "limit/offset pagination",
  serializeSelectOpts({ limit: 10, offset: 30 }).toString(),
  "_limit=10&_offset=30",
);

check(
  "groupBy + returning",
  serializeSelectOpts({
    groupBy: ["actor_id"],
    returning: ["id", "amount"],
  }).toString(),
  "_groupby=actor_id&_returning=id%2Camount",
);

check(
  "or clauses",
  serializeSelectOpts({
    or: [{ status: "active" }, { amount: { gt: 1000 } }],
  }).toString(),
  "_or=status%3Deq.active%2Camount%3Dgt.1000",
);

console.log();
console.log(`All ${passed} checks passed.`);
