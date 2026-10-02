/**
 * Seeds the single reserved Demo-mode tenant.
 *
 * RULE 5: every Demo-mode session resolves to this row, so its id is a fixed
 * constant (Database_Schema.md §2) and code branches on it. It is seeded with
 * domain NULL — a reserved tenant must not own a routable storefront, and NULL
 * keeps it out of the `domain` unique namespace entirely.
 *
 * Idempotent. Safe to run on every deploy.
 *
 * ponytail: seeds one row, not a demo dataset. The wider demo-data question is
 * still open — see docs/Database_Schema.md §11. Add a dataset when someone
 * decides what belongs in it.
 *
 * Run: npm run db:seed -w @shenodev/db
 */
import { sql } from "drizzle-orm";

import { db, pool } from "../src/client.ts";
import { DEMO_TENANT_ID } from "../src/schema.ts";

const inserted = await db.execute(sql`
  insert into tenants (id, name, domain)
  values (${DEMO_TENANT_ID}, 'Demo Tenant', null)
  on conflict (id) do nothing
  returning id
`);

const rows = (inserted as unknown as { rows: { id: string }[] }).rows ?? [];

const check = await db.execute(sql`select name from tenants where id = ${DEMO_TENANT_ID}`);
const found = (check as unknown as { rows: { name: string }[] }).rows ?? [];

if (found.length !== 1) {
  console.error(`FAIL: reserved tenant ${DEMO_TENANT_ID} is not readable after insert`);
  await pool.end();
  process.exit(1);
}

console.log(
  rows.length === 1
    ? `seeded demo_tenant_id ${DEMO_TENANT_ID}`
    : `demo_tenant_id ${DEMO_TENANT_ID} already present, left unchanged`,
);
console.log(`  name: ${found[0].name}`);
console.log("  domain: null (reserved tenant owns no storefront)");

await pool.end();