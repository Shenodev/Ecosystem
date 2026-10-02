/**
 * Relational integrity test for @shenodev/db.
 *
 * Creates a mock Tenant → Role → Branch → User → Product → Inventory → Order
 * → OrderItem → Delivery graph in one transaction and asserts that every
 * relationship Database_Schema.md specifies actually holds in Postgres:
 *
 *   §3–§9  foreign keys, per-tenant unique constraints, CHECK invariants
 *   §6.1   available = quantity - reserved_quantity, enforced by CHECK
 *   §6.2   no tenant_id on inventory — tenancy is reached through the product
 *   §8.1   UNIQUE (order_id) — one delivery per order
 *   §10    every tenant-scoped read filters tenant_id and returns zero rows
 *          for the wrong tenant
 *
 * Everything runs inside a single transaction that is rolled back, so the test
 * leaves no rows behind and never has to clean up after itself.
 *
 * Never prints a credential.
 *
 * Run: npm test -w @shenodev/db
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";

import { pool } from "../src/client.ts";
import {
  branches,
  deliveries,
  inventory,
  orderItems,
  orders,
  products,
  roles,
  tenants,
  users,
} from "../src/schema.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(HERE, "..");

let checks = 0;
let failures = 0;

function check(label: string, ok: boolean, detail = ""): boolean {
  checks++;
  const passed = Boolean(ok);
  if (passed) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
  return passed;
}

function section(title: string): void {
  console.log(`\n${title}`);
}

let savepoint = 0;

/**
 * Run a write that is expected to be rejected by the database.
 *
 * A missing constraint is the failure this is looking for: if the INSERT
 * succeeds, the constraint is absent and the test must fail.
 *
 * Each call gets its own SAVEPOINT. In PostgreSQL a single failed statement
 * aborts the entire transaction — without the savepoint, the first expected
 * rejection makes every later statement fail with 25P02 "current transaction is
 * aborted", which reads as a cascade of constraint failures rather than the one
 * real result.
 *
 * Pass `constraintName` to assert that the *specific* constraint fired rather
 * than merely that something did.
 */
async function rejects(
  label: string,
  write: () => Promise<unknown>,
  constraintName?: string,
  codes: string[] = ["23"],
): Promise<boolean> {
  // Savepoint names cannot be parameterised; this one is generated, not input.
  const name = `sp_${savepoint++}`;
  await client.query(`SAVEPOINT ${name}`);

  let error: { code?: string; constraint?: string } | undefined;
  try {
    await write();
  } catch (err) {
    error = err as typeof error;
  }

  await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
  await client.query(`RELEASE SAVEPOINT ${name}`);

  if (!error) {
    return check(label, false, "the statement was accepted; the constraint is missing");
  }
  // A two-character code is a SQLSTATE class and matches by prefix ("23" covers
  // 23503/23505/23514); a full five-character code must match exactly.
  const accepted = codes.some((c) => (c.length === 2 ? error.code?.startsWith(c) : error.code === c));
  if (!accepted) {
    return check(label, false, `rejected with ${error.code ?? "no SQLSTATE"} — expected ${codes.join(" or ")}`);
  }
  if (constraintName && error.constraint !== constraintName) {
    return check(
      label,
      false,
      `a different constraint fired: ${error.constraint ?? "unnamed"} (expected ${constraintName})`,
    );
  }
  return check(label, true);
}

// A per-run suffix keeps domains and SKUs unique even against leftovers.
const suffix = randomUUID().slice(0, 8);

const client = await pool.connect();
let committed = false;

try {
  await client.query("BEGIN");
  const tx = drizzle(client);

  // The set of tables actually present, used by the ER-map drift check in §10.
  const tableList = await client.query(`
    select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
  `);
  const liveTables = tableList.rows.map((r) => r.table_name as string);

  // -------------------------------------------------------------- 1. fixtures
  section("1. mock graph");

  const tenantId = randomUUID();
  const [tenant] = await tx
    .insert(tenants)
    .values({ id: tenantId, name: "Mock Tenant", domain: `mock-${suffix}.example.test` })
    .returning();
  check("insert tenant", Boolean(tenant?.id === tenantId));

  const [role] = await tx
    .insert(roles)
    .values({ name: "owner", scope: "tenant", permissions: { branches: ["create"] } })
    .returning();
  check("insert tenant-scoped role", Boolean(role?.id));

  const [branch] = await tx
    .insert(branches)
    .values({ tenantId, name: "Mock Branch", lowStockThreshold: 5 })
    .returning();
  check("insert branch", Boolean(branch?.id && branch.tenantId === tenantId));

  // §8.1: agent name and phone come from this join, so the user row carries them.
  const buyerId = randomUUID();
  const agentId = randomUUID();
  await tx.insert(users).values([
    {
      id: buyerId,
      tenantId,
      email: `buyer-${suffix}@example.test`,
      roleId: role.id,
      fullName: "Bea Buyer",
      phone: "+15550000001",
    },
    {
      id: agentId,
      tenantId,
      email: `agent-${suffix}@example.test`,
      roleId: role.id,
      branchId: branch.id,
      fullName: "Gil Agent",
      phone: "+15550000002",
    },
  ]);
  check("insert two users on the same tenant", true);

  const productId = randomUUID();
  const [product] = await tx
    .insert(products)
    .values({
      id: productId,
      tenantId,
      sku: `SKU-${suffix}`,
      title: "Mock Widget",
      description: "Integration-test fixture",
      price: "19.99",
    })
    .returning();
  check("insert product", Boolean(product?.id === productId));

  const [stock] = await tx
    .insert(inventory)
    .values({
      productId,
      branchId: branch.id,
      zoneShelfRow: "A-03-2",
      quantity: 10,
      reservedQuantity: 4,
    })
    .returning();
  check("insert inventory", Boolean(stock?.id));

  const [order] = await tx
    .insert(orders)
    .values({
      tenantId,
      clientId: buyerId,
      status: "in_progress",
      total: "19.99",
      paymentMethod: "cod",
      paymentStatus: "pending",
    })
    .returning();
  check("insert order", Boolean(order?.id));

  const [line] = await tx
    .insert(orderItems)
    .values({ orderId: order.id, productId, quantity: 1, unitPrice: "19.99", inventoryId: stock.id })
    .returning();
  check("insert order item", Boolean(line?.id));

  const [delivery] = await tx
    .insert(deliveries)
    .values({ orderId: order.id, agentId, status: "assigned" })
    .returning();
  check("insert delivery", Boolean(delivery?.id));

  // --------------------------------------------------- 2. relational integrity
  section("2. relational integrity");

  const userTenant = await tx
    .select({ name: tenants.name })
    .from(users)
    .innerJoin(tenants, eq(users.tenantId, tenants.id))
    .where(eq(users.id, buyerId));
  check("§3  user.tenant_id resolves to its tenant row", userTenant.length === 1);

  const userRole = await tx
    .select({ name: roles.name, scope: roles.scope })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.id, buyerId));
  check("§3  user.role_id resolves to its role row", userRole[0]?.name === "owner");

  // §6.2: inventory has no tenant_id of its own; tenancy is reached through the
  // product. This join is the only way to scope inventory to a tenant.
  const inventoryTenant = await tx
    .select({ tenantId: products.tenantId })
    .from(inventory)
    .innerJoin(products, eq(inventory.productId, products.id))
    .where(eq(inventory.id, stock.id));
  check("§6.2  inventory reaches tenancy via product.tenant_id", inventoryTenant[0]?.tenantId === tenantId);

  const stockBranch = await tx
    .select({ name: branches.name })
    .from(inventory)
    .innerJoin(branches, eq(inventory.branchId, branches.id))
    .where(eq(inventory.id, stock.id));
  check("§6  inventory.branch_id resolves to its branch row", stockBranch.length === 1);

  const orderClient = await tx
    .select({ email: users.email })
    .from(orders)
    .innerJoin(users, eq(orders.clientId, users.id))
    .where(eq(orders.id, order.id));
  check("§7  order.client_id resolves to the buyer", orderClient[0]?.email === `buyer-${suffix}@example.test`);

  const lineProduct = await tx
    .select({ sku: products.sku })
    .from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.id, line.id));
  check("§9.2  order_items.product_id resolves to the product", lineProduct[0]?.sku === `SKU-${suffix}`);

  const lineInventory = await tx
    .select({ zone: inventory.zoneShelfRow })
    .from(orderItems)
    .innerJoin(inventory, eq(orderItems.inventoryId, inventory.id))
    .where(eq(orderItems.id, line.id));
  check("§9.2  order_items.inventory_id records the physical shelf", lineInventory[0]?.zone === "A-03-2");

  const deliveryAgent = await tx
    .select({ name: users.fullName, phone: users.phone })
    .from(deliveries)
    .innerJoin(users, eq(deliveries.agentId, users.id))
    .where(eq(deliveries.id, delivery.id));
  check("§8.1  delivery.agent_id resolves to the agent's name and phone", deliveryAgent[0]?.name === "Gil Agent");

  // --------------------------------------------------------- 3. core invariant
  section("3. core invariant §6.1");

  const available = await tx
    .select({
      available: sql<number>`(${inventory.quantity} - ${inventory.reservedQuantity})::int`,
    })
    .from(inventory)
    .where(eq(inventory.id, stock.id));
  check("§6.1  available = quantity - reserved_quantity", available[0]?.available === 6, `got ${available[0]?.available}`);

  await rejects("§6.1  CHECK rejects reserved_quantity > quantity", () =>
    tx
      .insert(inventory)
      .values({ productId, branchId: branch.id, zoneShelfRow: "B-01-1", quantity: 2, reservedQuantity: 3 }),
    "inventory_reserved_within_quantity",
  );

  await rejects("§6  CHECK rejects negative quantity", () =>
    tx
      .insert(inventory)
      .values({ productId, branchId: branch.id, zoneShelfRow: "B-01-2", quantity: -1 }),
    "inventory_quantity_non_negative",
  );

  // ------------------------------------------------------- 4. unique constraints
  section("4. per-tenant uniqueness");

  await rejects("§3  UNIQUE (tenant_id, email) rejects a duplicate user", () =>
    tx.insert(users).values({ tenantId, email: `buyer-${suffix}@example.test`, roleId: role.id }),
    "users_tenant_email_key",
  );

  await rejects("§5  UNIQUE (tenant_id, sku) rejects a duplicate product", () =>
    tx.insert(products).values({ tenantId, sku: `SKU-${suffix}`, title: "Clash", price: "1.00" }),
    "products_tenant_sku_key",
  );

  await rejects("§2  tenants.domain is unique", () =>
    tx.insert(tenants).values({ name: "Domain Clash", domain: `mock-${suffix}.example.test` }),
    "tenants_domain_unique",
  );

  await rejects("§8.1  UNIQUE (order_id) rejects a second delivery for one order", () =>
    tx.insert(deliveries).values({ orderId: order.id, agentId: buyerId }),
    "deliveries_order_id_key",
  );

  await rejects("§9.1  UNIQUE (tenant_id, name) rejects a duplicate branch", () =>
    tx.insert(branches).values({ tenantId, name: "Mock Branch" }),
    "branches_tenant_name_key",
  );

  // The same email and SKU in a *different* tenant must be allowed — §3 and §5
  // both scope uniqueness per tenant precisely so a second storefront works.
  const otherTenantId = randomUUID();
  await tx.insert(tenants).values({ id: otherTenantId, name: "Other Tenant", domain: `other-${suffix}.example.test` });
  await tx.insert(users).values({ tenantId: otherTenantId, email: `buyer-${suffix}@example.test` });
  await tx.insert(products).values({ tenantId: otherTenantId, sku: `SKU-${suffix}`, title: "Theirs", price: "5.00" });
  check("§3/§5 the same email and SKU are allowed in another tenant", true);

  // ------------------------------------------------------- 5. FK enforcement
  section("5. foreign key enforcement");

  await rejects("§3  users.tenant_id rejects an unknown tenant", () =>
    tx.insert(users).values({ tenantId: randomUUID(), email: `orphan-${suffix}@example.test` }),
    "users_tenant_id_tenants_id_fk",
  );

  await rejects("§7  orders.client_id rejects an unknown user", () =>
    tx.insert(orders).values({
      tenantId,
      clientId: randomUUID(),
      total: "1.00",
      paymentMethod: "prepaid",
    }),
    "orders_client_id_users_id_fk",
  );

  await rejects("§6  inventory.product_id rejects an unknown product", () =>
    tx.insert(inventory).values({ productId: randomUUID(), branchId: branch.id, zoneShelfRow: "C-01-1" }),
    "inventory_product_id_products_id_fk",
  );

  await rejects("§8  deliveries.order_id rejects an unknown order", () =>
    tx.insert(deliveries).values({ orderId: randomUUID(), agentId }),
    "deliveries_order_id_orders_id_fk",
  );

  // ------------------------------------------------------- 6. enum + money
  section("6. enum and money rules");

  await rejects(
    "§7  payment_method rejects a value outside (prepaid, cod)",
    () => tx.insert(orders).values({ tenantId, clientId: buyerId, total: "1.00", paymentMethod: "cheque" as never }),
    undefined,
    // A value outside a pgEnum is invalid_text_representation (22P02), not an
    // integrity error — Postgres reports it before any constraint is consulted.
    ["22P02"],
  );

  await rejects(
    "§7  status rejects a value outside the order enum",
    () =>
      tx.insert(orders).values({
        tenantId,
        clientId: buyerId,
        total: "1.00",
        paymentMethod: "cod",
        status: "teleported" as never,
      }),
    undefined,
    ["22P02"],
  );

  await rejects("§9.2  CHECK rejects order_items.quantity = 0", () =>
    tx.insert(orderItems).values({ orderId: order.id, productId, quantity: 0, unitPrice: "1.00" }),
    "order_items_quantity_positive",
  );

  await rejects("§5  CHECK rejects a negative price", () =>
    tx.insert(products).values({ tenantId, sku: `NEG-${suffix}`, title: "Negative", price: "-1.00" }),
    "products_price_non_negative",
  );

  // §5: money is NUMERIC, never FLOAT. Binary floating point cannot hold 0.10.
  const [penny] = await tx
    .insert(products)
    .values({ tenantId, sku: `PENNY-${suffix}`, title: "Penny", price: "0.10" })
    .returning();
  const [penny2] = await tx
    .insert(products)
    .values({ tenantId, sku: `PENNY2-${suffix}`, title: "Penny 2", price: "0.20" })
    .returning();
  const summed = await tx.execute(sql`
    select (${penny.price}::numeric + ${penny2.price}::numeric)::text as total
  `);
  const sum = (summed as unknown as { rows: { total: string }[] }).rows[0]?.total;
  check("§5  NUMERIC sums 0.10 + 0.20 to exactly 0.30", sum === "0.30", `got ${sum}`);

  // ------------------------------------------------------- 7. cascade deletes
  section("7. ON DELETE CASCADE");

  const spareProductId = randomUUID();
  await tx.insert(products).values({ id: spareProductId, tenantId, sku: `SPARE-${suffix}`, title: "Spare", price: "1.00" });
  await tx.insert(inventory).values({ productId: spareProductId, branchId: branch.id, zoneShelfRow: "Z-01-1", quantity: 1 });

  const beforeDelete = await tx.select().from(inventory).where(eq(inventory.productId, spareProductId));
  check("spare product has an inventory row to cascade", beforeDelete.length === 1);

  await tx.delete(products).where(eq(products.id, spareProductId));
  const afterDelete = await tx.select().from(inventory).where(eq(inventory.productId, spareProductId));
  check("§6  deleting a product cascades to its inventory rows", afterDelete.length === 0);

  // §9.2 order_items has no cascade from products, so this must be refused.
  await rejects("§9.2  products referenced by an order item cannot be deleted", () =>
    tx.delete(products).where(eq(products.id, productId)),
    "order_items_product_id_products_id_fk",
  );

  // ------------------------------------------------------- 8. isolation
  section("8. tenant isolation §10");

  const ownProducts = await tx.select().from(products).where(eq(products.tenantId, tenantId));
  check("§10  filtering by the owning tenant returns its products", ownProducts.length >= 2);

  const otherTenantProducts = await tx
    .select()
    .from(products)
    .where(eq(products.tenantId, otherTenantId));
  check(
    "§10  another tenant's products exist and are invisible under this filter",
    otherTenantProducts.length === 1 && ownProducts.every((p) => p.tenantId === tenantId),
    "a leak would mean a row from the other tenant appeared in the filtered read",
  );

  const otherOrders = await tx.select().from(orders).where(eq(orders.tenantId, otherTenantId));
  check("§10  the wrong tenant_id returns zero rows for orders", otherOrders.length === 0);

  // ------------------------------------------------- 9. index coverage
  section("9. foreign key index coverage");

  // Postgres does not index foreign key columns automatically. An unindexed FK
  // makes every JOIN through it a sequential scan, and makes a parent DELETE
  // scan the whole child table to find rows to cascade to or refuse.
  const unindexed = await tx.execute(sql`
    select conrelid::regclass::text as table_name, a.attname as fk_column
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
     where c.contype = 'f'
       and c.connamespace = 'public'::regnamespace
       and not exists (
         select 1 from pg_index i
          where i.indrelid = c.conrelid and a.attnum = any(i.indkey)
       )
     order by table_name, fk_column
  `);
  const missing = (unindexed as unknown as { rows: { table_name: string; fk_column: string }[] }).rows;
  check(
    "every foreign key column has a supporting index",
    missing.length === 0,
    missing.map((m) => `${m.table_name}.${m.fk_column}`).join(", "),
  );

  // ------------------------------------------------- 10. ER map is not stale
  section("10. ER map matches the live database");

  // docs/db-relationships.json is the committed ER map, generated from
  // docs/Database_Schema.md by scripts/build-db-semantic-fragment.py. Asserting
  // it here is what stops the map quietly drifting away from the schema: an
  // edge in the document that never became a foreign key fails this test.
  const erPath = resolve(PKG_ROOT, "../..", "docs", "db-relationships.json");
  if (!check("docs/db-relationships.json exists", existsSync(erPath), `looked in ${erPath}`)) {
    console.log("         regenerate: python3 scripts/build-db-semantic-fragment.py");
  } else {
    const er = JSON.parse(readFileSync(erPath, "utf8")) as {
      tables: Record<string, { references: string[] }>;
      foreign_keys: { from: string; to: string }[];
    };

    const live = await tx.execute(sql`
      select conrelid::regclass::text as src, confrelid::regclass::text as tgt
        from pg_constraint
       where contype = 'f' and connamespace = 'public'::regnamespace
    `);
    const liveFks = (live as unknown as { rows: { src: string; tgt: string }[] }).rows
      .map((r) => `${r.src}->${r.tgt}`)
      .sort();

    const mapFks = er.foreign_keys.map((f) => `${f.from}->${f.to}`).sort();

    const onlyInMap = mapFks.filter((f) => !liveFks.includes(f));
    const onlyInDb = liveFks.filter((f) => !mapFks.includes(f));

    check(
      `every foreign key in the ER map exists in the database (${mapFks.length} edges)`,
      onlyInMap.length === 0,
      `documented but absent: ${onlyInMap.join(", ")}`,
    );
    check(
      `every foreign key in the database is in the ER map (${liveFks.length} edges)`,
      onlyInDb.length === 0,
      `present but undocumented: ${onlyInDb.join(", ")} — regenerate the map, or add the FK to §Database_Schema`,
    );

    const absentTables = Object.keys(er.tables).filter((t) => !liveTables.includes(t));
    check(
      "every table in the ER map exists in the database",
      absentTables.length === 0,
      `missing: ${absentTables.join(", ")}`,
    );
  }
} finally {
  if (!committed) {
    await client.query("ROLLBACK");
  }
  client.release();
  await pool.end();
}

console.log(`\n${checks - failures}/${checks} checks passed`);
console.log(failures === 0 ? "RESULT: PASS" : `RESULT: FAIL (${failures} failing)`);
process.exit(failures === 0 ? 0 : 1);
