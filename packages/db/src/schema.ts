/**
 * Drizzle schema for @shenodev/db.
 *
 * Tables and columns mirror docs/Database_Schema.md. That document is the
 * contract — change it there first, then here.
 *
 * Section references (§) point at docs/Database_Schema.md.
 */
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * §2 Tenants — the root isolation boundary, not itself tenant-scoped.
 *
 * `domain` is UNIQUE: two tenants sharing a domain means one seller's
 * storefront is reachable under another's identity. Security constraint, not
 * convenience.
 *
 * `demo_tenant_id` is a reserved row with a fixed id that Demo-mode sessions
 * resolve to (PRD §3.3, Rules RULE 5). Its id is never generated — code
 * branches on it. See DEMO_TENANT_ID below.
 */
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  domain: text("domain").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;

/**
 * Fixed id of the reserved Demo-mode tenant.
 *
 * RULE 5: every Demo-mode session resolves to this row. Populate it once the
 * seeding strategy is decided — see the open question in docs/Database_Schema.md
 * §11. Until then the constant exists so no call site invents its own value.
 */
export const DEMO_TENANT_ID = "00000000-0000-4000-8000-000000000001";