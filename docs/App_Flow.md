# App Flow — ShenoDev Ecosystem

**Status:** Draft v1.0
**Last Updated:** 2026-10-02

---

## 1. The Spine

Three journeys, one lifecycle. The order status enum is the shared spine that all three apps read and write.

```
Products(stock:0) → Inventory(scanned) → Store(purchasable) → Order(In Progress)
   → Dispatch(Waiting for Shipping) → Agent accepts(Out for Delivery) → Completed
```

| Stage | Owning app | Source of truth |
|-------|-----------|-----------------|
| Product listing | ShenoStore | `Products` |
| Stock intake | ShenoInventory | `Inventory` |
| Checkout / payment | ShenoStore | `Orders` |
| Dispatch | ShenoInventory | `Orders.status` |
| Agent queue | ShenoFlow | Redis + `Deliveries` |
| Client tracking | ShenoFlow (read), ShenoStore (entry) | `Orders.status`, `Deliveries` |

---

## 2. Buyer/Seller Journey

The seller side. Getting stock onto a shelf is the long pole.

```
Registers on ShenoStore
        │
        ▼
Account auto-provisioned for ShenoInventory and ShenoFlow
        │
        ▼
Adds product listings  ──►  Stock: 0   (visible but not purchasable)
        │
        ▼
Logs into ShenoInventory
        │
        ▼
Bulk-adds stock via barcode scanner  ──►  Inventory row created per product
        │
        ▼
Assigns inventory to specific branches / shelves  ──►  zone · shelf · row
```

### Step-by-step

| # | Action | App | Effect |
|---|--------|-----|--------|
| 1 | Register | ShenoStore | Creates `Tenants` + `Users` row, `role_id` = Owner |
| 2 | Auto-provision | — | User record created for ShenoInventory and ShenoFlow with the **same** `user_id`. No separate signup. |
| 3 | Add product listing | ShenoStore | `Products` row, `price` set, **no** `Inventory` row → `stock: 0` |
| 4 | Open ShenoInventory | — | SSO cookie carries the session; no login prompt |
| 5 | Bulk-add stock | ShenoInventory | Barcode scan resolves `sku` → `Products`; upserts `Inventory` |
| 6 | Assign to branch/shelf | ShenoInventory | Sets `branch_id`, `zone`, `shelf`, `row` |

**Why `stock: 0` still shows the product:** the listing exists and is indexed, but is not purchasable. This is intentional — a seller builds their catalog first and fills stock second.

**Barcode resolution:** scanning a barcode maps to `sku`, which maps to `product_id`. An unknown barcode is a **creation prompt**, not an error — the seller is at the shelf holding the item in their hand.

**Shelf addressing** is stored on the `Inventory` row as `zone_shelf_row`. This is what makes "where is SKU-4471?" answerable in seconds.

---

## 3. Client (Customer) Journey

The buyer side.

```
Browses ShenoStore
        │
        ▼
Adds to cart
        │
        ▼
Pays  ──or──  selects COD
        │
        ▼
Order triggers "Reserved" stock status in Inventory
        │
        ▼
Client tracks order via ShenoFlow
```

### Step-by-step

| # | Action | App | Effect |
|---|--------|-----|--------|
| 1 | Browse catalog | ShenoStore | SSR-rendered, indexable, public |
| 2 | Add to cart | ShenoStore | Client-side cart |
| 3 | Pay or select COD | ShenoStore | `Orders.status` → `In Progress` |
| 4 | Reserve stock | ShenoInventory (triggered) | `Inventory.reserved_quantity += qty` — **atomic with order creation** |
| 5 | Track | ShenoFlow | Public order-tracking view |

**Reservation, not decrement.** `quantity` is physical stock on the shelf. `reserved_quantity` is committed-but-unshipped. Available stock is always:

```
available = quantity - reserved_quantity
```

An order that is cancelled or expires releases the reservation. An order that ships moves `reserved_quantity` back into `quantity` decremented — the physical act of picking.

**Steps 3 and 4 are one transaction.** Order created, stock reserved, or neither. A partial failure means selling stock that isn't there.

**COD does not skip reservation.** Cash-on-delivery still commits physical units. It defers *payment*, not *allocation*.

---

## 4. Logistics Journey

The delivery side. Where Redis earns its place.

```
Buyer clicks "Send to Shipment"
        │
        ▼
Status → Waiting for Shipping
        │
        ▼
Redis queue pings available delivery agents sequentially
        │
        ▼
Agent accepts
        │
        ▼
Status → Out for Delivery
        │
        ▼
Client AND Buyer see Agent's name and phone number
```

### 4.1 Dispatch

| Actor | Action | System |
|-------|--------|--------|
| Buyer (Admin) | Click "Send to Shipment" on a paid order | `Orders.status` → `Waiting for Shipping`; enqueue dispatch job |

The action is gated on payment state: **COD orders dispatch the same as prepaid ones** — the seller already accepted the COD risk when they confirmed the order.

### 4.2 Agent Queue (Redis)

Agents are pinged **sequentially**, not broadcast. The reason is contention: broadcasting one job to every available agent produces simultaneous accept attempts, races, and double-booking. Sequential pinging walks the available-agent list one at a time until one accepts.

```
Order enters Waiting for Shipping
        │
        ▼
Redis LPUSH  delivery:queue:{tenant_id}  { order_id }
        │
        ▼
Pop available agents (ordered by proximity / load)
        │
        ▼
Ping agent #1 ──► accepts? ──yes──► done
        │ no / timeout
        ▼
Ping agent #2 ──► accepts? ──yes──► done
        │ no / timeout
        ▼
Ping agent #3 ...
```

**Guarantees:**

- **Accept is atomic.** First successful accept wins; later accepts on the same job fail (Redis `SET NX` / compare-and-set on the job key).
- **Per-agent timeout.** No-response moves to the next agent rather than stalling the order.
- **Queue is tenant-scoped.** Key includes `tenant_id` — an agent only ever sees jobs for their own tenant.
- **Exhausted queue** leaves the order in `Waiting for Shipping` and flags it for seller attention. Silent failure is the worst outcome here.

### 4.3 Delivery

| Step | Actor | State |
|------|-------|-------|
| 1 | Agent accepts | `Deliveries` row created (`agent_id`, `status`, `assigned_at`) |
| 2 | System updates order | `Orders.status` → `Out for Delivery` |
| 3 | Both parties notified | **Client** and **Buyer** see agent **name + phone number** |

Step 3 is the payoff of the whole logistics chain. The moment the agent accepts, the buyer stops guessing — which is why agent identity gets emphasis in the UI, not muted metadata styling ([UI_UX_Brief.md](./UI_UX_Brief.md#5-logistics-ui)).

### 4.4 Status Transitions

```
                    ┌──────────────┐
                    │ In Progress  │  (order created, paid or COD)
                    └──────┬───────┘
                           │ Seller dispatches
                           ▼
                ┌──────────────────────┐
                │ Waiting for Shipping │  (in Redis queue)
                └──────────┬───────────┘
                           │ Agent accepts
                           ▼
                ┌──────────────────────┐
                │ Out for Delivery     │
                └──────────┬───────────┘
                           │ Delivered / COD settled
                           ▼
                    ┌──────────────┐
                    │  Completed   │
                    └──────────────┘
```

| From | To | Trigger | Guard |
|------|----|---------|-------|
| — | `In Progress` | Order placed | Stock reservation succeeded |
| `In Progress` | `Waiting for Shipping` | Seller dispatches | Payment confirmed or COD accepted |
| `Waiting for Shipping` | `Out for Delivery` | Agent accepts | Atomic claim on the queue job |
| `Out for Delivery` | `Completed` | Agent marks delivered | — |

**`In Progress` → `Waiting for Shipping` may also be reached by cancellation/timeout from `In Progress`.** An expired unpaid online order releases its reservation and returns to available stock.

---

## 5. Cross-App Handoffs

| From | To | Trigger | Mechanism |
|------|----|---------|-----------|
| ShenoStore | ShenoInventory + ShenoFlow | Registration | Provision user rows on all three |
| ShenoStore | ShenoInventory | Order placed | `reserved_quantity += qty`, same transaction |
| ShenoInventory | ShenoStore | Stock added | Next catalog read sees `available > 0` — **no sync job** |
| ShenoInventory | ShenoFlow | Dispatch | Order status write + Redis enqueue |
| ShenoFlow | ShenoStore | Agent accepts | Order status write; client/buyer views read it |

**There is no event bus and no sync worker.** Apps share a database and a session, so a write in one app is visible to the others on next read. Adding replication would add a failure mode that this scale does not justify.

---

## 6. Related Documents

- [PRD.md](./PRD.md) — product requirements
- [TRD.md](./TRD.md) — architecture and infrastructure
- [Database_Schema.md](./Database_Schema.md) — tables behind these flows