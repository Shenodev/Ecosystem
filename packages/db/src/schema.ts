/**
 * Drizzle schema for @shenodev/db.
 *
 * Tables and columns mirror docs/Database_Schema.md. That document is the
 * contract — change it there first, then here.
 *
 * Section references (§) point at docs/Database_Schema.md.
 */
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// --------------------------------------------------------------------- enums
// §7.1: the status enum lives here and is imported by all three apps. A string
// literal typed separately in React, Svelte and Vue is how a status ends up in
// the database that no UI knows how to render.

export const orderStatusEnum = pgEnum("order_status", [
  "in_progress",
  "waiting_for_shipping",
  "out_for_delivery",
  "completed",
]);

export const deliveryStatusEnum = pgEnum("delivery_status", ["assigned", "picked_up", "delivered"]);

export const paymentMethodEnum = pgEnum("payment_method", ["prepaid", "cod"]);

export const paymentStatusEnum = pgEnum("payment_status", ["pending", "paid", "failed", "refunded"]);

// ------------------------------------------------------------------- §2
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

// ------------------------------------------------------------------- §4
/**
 * §4 Roles.
 *
 * `tenant_id NULL` marks a system role (platform admin). Only those rows are
 * tenant-independent; everything else is scoped.
 */
export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    name: text("name").notNull(),
    /** 'tenant' | 'branch' */
    scope: text("scope").notNull(),
    permissions: jsonb("permissions").$type<Record<string, string[]>>().notNull(),
  },
  (t) => [index("idx_roles_tenant").on(t.tenantId)],
);

// ------------------------------------------------------------------- §9.1
/** §9.1 Branches. Required by inventory.branch_id. Only an Owner creates one. */
export const branches = pgTable(
  "branches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    address: text("address"),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(10),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("branches_tenant_name_key").on(t.tenantId, t.name)],
);

// ------------------------------------------------------------------- §3
/**
 * §3 Users — one account record shared by all three apps. The apps differ by
 * role, not by separate accounts.
 *
 * `email` is unique per tenant, not globally: a seller operating two storefronts
 * is one identity with two tenant memberships.
 *
 * `password_hash` is NULL for Demo-mode and SSO-only accounts.
 *
 * `branch_id` (§4: "branch scoping is a column, not a code path"), `full_name`
 * and `phone` (§8.1: delivery agent name and phone come from this join) are
 * required by the prose of §4 and §8.1 but are absent from the §3 CREATE TABLE.
 * See docs/Database_Schema.md — flagged in Implementation_Plan.md.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Never from client input — always from the session. */
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    email: text("email").notNull(),
    roleId: uuid("role_id").references(() => roles.id),
    /** Argon2id or bcrypt. NULL for Demo-mode and SSO-only accounts. */
    passwordHash: text("password_hash"),
    branchId: uuid("branch_id").references(() => branches.id),
    fullName: text("full_name"),
    phone: text("phone"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("users_tenant_email_key").on(t.tenantId, t.email),
    index("idx_users_tenant").on(t.tenantId),
    // Postgres does not index FK columns on its own, and these two are read on
    // every authorization decision: "which role does this user hold" and "which
    // branch's stock may they touch". An unindexed role_id makes deleting a
    // role scan all users.
    index("idx_users_role").on(t.roleId),
    index("idx_users_branch").on(t.branchId),
  ],
);

// ------------------------------------------------------------------- §5
/**
 * §5 Products.
 *
 * `sku` is unique per tenant, not globally — two sellers may both stock
 * "SKU-1001"; a global constraint would break barcode scanning for anyone
 * onboarding a second storefront.
 *
 * NUMERIC(12,2) for money: binary floating point cannot represent 0.10, and
 * summing float prices across an order produces reconciliation errors.
 */
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    sku: text("sku").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    imageUrl: text("image_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("products_tenant_sku_key").on(t.tenantId, t.sku),
    index("idx_products_tenant").on(t.tenantId),
    check("products_price_non_negative", sql`${t.price} >= 0`),
  ],
);

// ------------------------------------------------------------------- §6
/**
 * §6 Inventory — physical stock by branch and shelf.
 *
 * NO `tenant_id` column by design (§6.2). Tenancy is reached through
 * product_id → products.tenant_id. Denormalizing it here would create a second
 * copy of the tenant boundary that could disagree with the product's own
 * tenant — and that disagreement is a cross-tenant leak.
 *
 * Uniqueness is per-shelf, not per-product: a product in two shelves gets two
 * rows, which is what makes "where is SKU-4471?" answerable.
 */
export const inventory = pgTable(
  "inventory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** A deleted product has no stock. */
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    /** Physical address, e.g. `A-03-2` (zone A, shelf 3, row 2). */
    zoneShelfRow: text("zone_shelf_row").notNull(),
    quantity: integer("quantity").notNull().default(0),
    /** Committed to unshipped orders. */
    reservedQuantity: integer("reserved_quantity").notNull().default(0),
    /** Drives low-stock email triggers. Read-time check, never a cached flag. */
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("inventory_product_branch_shelf_key").on(t.productId, t.branchId, t.zoneShelfRow),
    index("idx_inventory_product").on(t.productId),
    index("idx_inventory_branch").on(t.branchId),
    check("inventory_quantity_non_negative", sql`${t.quantity} >= 0`),
    // §6.1 the core invariant. This is the one constraint in the schema that
    // must never be violated: violating it means selling stock that is not
    // physically present.
    check(
      "inventory_reserved_within_quantity",
      sql`${t.reservedQuantity} >= 0 AND ${t.reservedQuantity} <= ${t.quantity}`,
    ),
  ],
);

// ------------------------------------------------------------------- §7
/**
 * §7 Orders.
 *
 * `status` and `payment_status` are separate because they move independently:
 * a COD order reaches `completed` while payment is still `pending`. Collapsing
 * them makes "is this paid?" unanswerable for COD, which is most orders.
 *
 * `total` is the sum of order_items, never client input.
 */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    /** The buyer, not the seller. */
    clientId: uuid("client_id")
      .notNull()
      .references(() => users.id),
    status: orderStatusEnum("status").notNull().default("in_progress"),
    total: numeric("total", { precision: 12, scale: 2 }).notNull(),
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    paymentStatus: paymentStatusEnum("payment_status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_orders_tenant").on(t.tenantId),
    index("idx_orders_client").on(t.clientId),
    index("idx_orders_status").on(t.status),
    check("orders_total_non_negative", sql`${t.total} >= 0`),
  ],
);

// ------------------------------------------------------------------- §9.2
/**
 * §9.2 Order Items. orders.total is meaningless without line items.
 *
 * `unit_price` is copied at purchase time, never read from products.price later:
 * a subsequent price edit must not rewrite what the customer agreed to.
 * `inventory_id` records the physical shelf, which is what makes a return
 * routable.
 */
export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    quantity: integer("quantity").notNull(),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
    inventoryId: uuid("inventory_id").references(() => inventory.id),
  },
  (t) => [
    index("idx_order_items_order").on(t.orderId),
    index("idx_order_items_product").on(t.productId),
    // Deleting a shelf row has to scan order_items to find the orders holding
    // units from it, which is what makes a return routable.
    index("idx_order_items_inventory").on(t.inventoryId),
    check("order_items_quantity_positive", sql`${t.quantity} > 0`),
    check("order_items_unit_price_non_negative", sql`${t.unitPrice} >= 0`),
  ],
);

// ------------------------------------------------------------------- §8
/**
 * §8 Deliveries — durable dispatch record.
 *
 * Redis holds the queue; Postgres holds the truth. A Redis flush delays
 * dispatch, it does not erase it.
 *
 * NO `tenant_id` column by design (§8.1): tenancy is reached through
 * order_id → orders.tenant_id, for the same reason as inventory — one boundary,
 * one place.
 */
export const deliveries = pgTable(
  "deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    /** The delivery agent. One table serves sellers, staff, buyers and agents. */
    agentId: uuid("agent_id")
      .notNull()
      .references(() => users.id),
    status: deliveryStatusEnum("status").notNull().default("assigned"),
    /** Queue acceptance time. */
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    pickedUpAt: timestamp("picked_up_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (t) => [
    // Without this, two agents could both claim the same order and the buyer
    // would see two agents. Last line of defence behind the atomic Redis claim.
    unique("deliveries_order_id_key").on(t.orderId),
    index("idx_deliveries_agent").on(t.agentId),
    index("idx_deliveries_status").on(t.status),
  ],
);

// ------------------------------------------------------------------ types
export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;

export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Branch = typeof branches.$inferSelect;
export type NewBranch = typeof branches.$inferInsert;

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

export type Inventory = typeof inventory.$inferSelect;
export type NewInventory = typeof inventory.$inferInsert;

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;

export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;

export type Delivery = typeof deliveries.$inferSelect;
export type NewDelivery = typeof deliveries.$inferInsert;

/** §7.1 the status union, imported by all three apps rather than re-declared. */
export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];
export type DeliveryStatus = (typeof deliveryStatusEnum.enumValues)[number];
export type PaymentMethod = (typeof paymentMethodEnum.enumValues)[number];
export type PaymentStatus = (typeof paymentStatusEnum.enumValues)[number];

/**
 * Fixed id of the reserved Demo-mode tenant.
 *
 * RULE 5: every Demo-mode session resolves to this row. Populate it once the
 * seeding strategy is decided — see the open question in docs/Database_Schema.md
 * §11. Until then the constant exists so no call site invents its own value.
 */
export const DEMO_TENANT_ID = "00000000-0000-4000-8000-000000000001";
