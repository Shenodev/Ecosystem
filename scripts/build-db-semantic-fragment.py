#!/usr/bin/env python3
"""
Build the semantic graph fragment for docs/Database_Schema.md.

The LLM extraction subagent was dispatched twice and wrote no output both times,
so this script encodes the extraction directly from the document's own DDL and
prose instead. Deterministic, and reviewable against §of Database_Schema.md.

Every FK below is asserted against live pg_constraint by
packages/db/scripts/test-schema.mts (section 10), which reads the ER map this
script writes. A wrong edge therefore fails the db test suite rather than
quietly producing a misleading map.

Writes:
  graphify-out/.graphify_sem_1.json   — the graphify semantic chunk
  docs/db-relationships.json          — the curated ER map, committed, and the
                                        file the db test suite checks against
                                        live pg_constraint
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "graphify-out" / ".graphify_sem_1.json"
DOC = str(ROOT / "docs" / "Database_Schema.md")
STEM = "docs_database_schema"


def node(entity: str, label: str, file_type: str = "document") -> dict:
    return {
        "id": f"{STEM}_{entity}",
        "label": label,
        "file_type": file_type,
        "source_file": DOC,
        "source_location": None,
        "source_url": None,
        "captured_at": None,
        "author": None,
        "contributor": None,
    }


def edge(source: str, target: str, relation: str, why: str | None = None) -> dict:
    return {
        "source": f"{STEM}_{source}",
        "target": f"{STEM}_{target}",
        "relation": relation,
        "confidence": "EXTRACTED",
        "confidence_score": 1.0,
        "source_file": DOC,
        "source_location": None,
        "weight": 1.0,
        # The design note this edge exists to express, e.g. §6.2.
        "why": why,
    }


# --------------------------------------------------------------- table nodes
TABLES = [
    ("tenants", "tenants — root isolation boundary", "§2"),
    ("roles", "roles — owner / admin / staff", "§4"),
    ("branches", "branches — physical stock locations", "§9.1"),
    ("users", "users — one account shared by all three apps", "§3"),
    ("products", "products — catalog listings", "§5"),
    ("inventory", "inventory — physical stock by branch and shelf", "§6"),
    ("orders", "orders — customer orders", "§7"),
    ("order_items", "order_items — order line items", "§9.2"),
    ("deliveries", "deliveries — durable dispatch record", "§8"),
]

nodes = [node(e, lbl) for e, lbl, _ in TABLES]

# Foreign keys, verbatim from the §CREATE TABLE blocks.
FKS = [
    ("users", "tenants", "§3"),
    ("users", "roles", "§3"),
    ("users", "branches", "§4"),
    ("roles", "tenants", "§4"),
    ("branches", "tenants", "§9.1"),
    ("products", "tenants", "§5"),
    ("inventory", "products", "§6 ON DELETE CASCADE — a deleted product has no stock"),
    ("inventory", "branches", "§6"),
    ("orders", "tenants", "§7"),
    ("orders", "users", "§7 client_id is the buyer"),
    ("order_items", "orders", "§9.2 ON DELETE CASCADE"),
    ("order_items", "products", "§9.2"),
    ("order_items", "inventory", "§9.2 inventory_id records the physical shelf"),
    ("deliveries", "orders", "§8 ON DELETE CASCADE"),
    ("deliveries", "users", "§8 agent_id is the delivery agent"),
]

edges = [edge(s, t, "references", note) for s, t, note in FKS]

# The ER map is meaningless without the reasons, so they are first-class nodes.
RATIONALE = [
    (
        "no_tenant_id_on_inventory",
        "No tenant_id on inventory — tenancy is reached via product_id (§6.2)",
        ["inventory", "products", "tenants"],
        "A second copy of the tenant boundary could disagree with the product's "
        "own tenant, and that disagreement is a cross-tenant leak.",
    ),
    (
        "reserved_quantity_invariant",
        "available = quantity - reserved_quantity (§6.1)",
        ["inventory", "orders", "order_items"],
        "The one invariant in the schema that must never be violated — violating "
        "it means selling stock that is not physically present.",
    ),
    (
        "unit_price_copied_at_purchase",
        "unit_price is copied at purchase time (§9.2)",
        ["order_items", "products", "orders"],
        "The order total is what the customer agreed to; a later price edit must "
        "not rewrite history.",
    ),
    (
        "one_delivery_per_order",
        "UNIQUE (order_id) enforces one delivery per order (§8.1)",
        ["deliveries", "orders"],
        "Without it two agents could both claim the same order and the buyer "
        "would see two agents.",
    ),
    (
        "sku_unique_per_tenant",
        "sku is unique per tenant, not globally (§5)",
        ["products", "tenants"],
        "A global constraint would force SKU rewriting across tenants and break "
        "barcode scanning for anyone onboarding a second storefront.",
    ),
    (
        "email_unique_per_tenant",
        "email is unique per tenant, not globally (§3)",
        ["users", "tenants"],
        "A seller operating two storefronts is one identity with two tenant "
        "memberships, not two accounts.",
    ),
    (
        "domain_unique_for_security",
        "tenants.domain is unique (§2)",
        ["tenants"],
        "Two tenants sharing a domain means one seller's storefront is reachable "
        "under another's identity. A security constraint, not a convenience.",
    ),
    (
        "money_is_numeric",
        "Money is NUMERIC(12,2), never FLOAT (§5)",
        ["products", "order_items", "orders"],
        "Binary floating point cannot represent 0.10; summing float prices "
        "across an order produces reconciliation errors.",
    ),
    (
        "status_independent_of_payment",
        "status is independent of payment_status (§7.2)",
        ["orders"],
        "A COD order reaches `completed` while payment is still `pending`. "
        "Collapsing them makes 'is this paid?' unanswerable for COD.",
    ),
    (
        "redis_holds_queue_postgres_holds_truth",
        "Redis holds the queue, Postgres holds the truth (§8.1)",
        ["deliveries", "orders"],
        "The queue is transient dispatch state. A Redis flush delays dispatch; it "
        "does not erase it.",
    ),
    (
        "branch_scoping_is_a_column",
        "Branch scoping is a column, not a code path (§4)",
        ["users", "branches", "inventory"],
        "Enforcing 'Admin manages a single branch' in application code means "
        "every new query has to remember the rule.",
    ),
    (
        "demo_is_a_data_tenant",
        "Demo is a data tenant, not a bypass (§11)",
        ["tenants", "users", "products", "orders", "deliveries"],
        "The moment Demo mode skips isolation checks, it becomes a way to read "
        "production tenants.",
    ),
]

for entity, label, _targets, _why in RATIONALE:
    nodes.append(node(entity, label, file_type="rationale"))

for entity, _, targets, why in RATIONALE:
    for target in targets:
        edges.append(edge(entity, target, "rationale_for", why))

hyperedges = [
    {
        "id": "tenant_isolation_boundary",
        "label": "Tenant isolation boundary (§10)",
        "nodes": [
            f"{STEM}_tenants",
            f"{STEM}_orders",
            f"{STEM}_products",
            f"{STEM}_users",
            f"{STEM}_branches",
            f"{STEM}_roles",
            f"{STEM}_no_tenant_id_on_inventory",
        ],
        "relation": "form",
        "confidence": "EXTRACTED",
        "confidence_score": 1.0,
        "source_file": DOC,
        "why": "Every tenant-scoped query filters tenant_id; RLS is the backstop "
        "that makes a missed WHERE clause return nothing instead of another "
        "tenant's rows.",
    },
    {
        "id": "order_reservation_transaction",
        "label": "Order reservation is one ACID transaction (§7.3)",
        "nodes": [
            f"{STEM}_orders",
            f"{STEM}_order_items",
            f"{STEM}_inventory",
            f"{STEM}_reserved_quantity_invariant",
        ],
        "relation": "participate_in",
        "confidence": "EXTRACTED",
        "confidence_score": 1.0,
        "source_file": DOC,
        "why": "SELECT ... FOR UPDATE row locks are what make two simultaneous "
        "checkouts for the last unit impossible.",
    },
    {
        "id": "delivery_lifecycle",
        "label": "Dispatch lifecycle (§7.1, §8)",
        "nodes": [
            f"{STEM}_orders",
            f"{STEM}_deliveries",
            f"{STEM}_users",
            f"{STEM}_redis_holds_queue_postgres_holds_truth",
            f"{STEM}_one_delivery_per_order",
        ],
        "relation": "participate_in",
        "confidence": "EXTRACTED",
        "confidence_score": 1.0,
        "source_file": DOC,
        "why": "in_progress -> waiting_for_shipping -> out_for_delivery -> "
        "completed, with deliveries recording the durable agent assignment.",
    },
]

payload = {
    "nodes": nodes,
    "edges": edges,
    "hyperedges": hyperedges,
    "input_tokens": 0,
    "output_tokens": 0,
}

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"wrote {OUT} — {len(nodes)} nodes, {len(edges)} edges, {len(hyperedges)} hyperedges")

# The curated ER map. Committed, so the db test suite can assert it against live
# pg_constraint without needing graphify installed.
TABLES_OUT = [e for e, _label, _sec in TABLES]
rationale_by_table: dict[str, list[str]] = {t: [] for t in TABLES_OUT}
for entity, label, targets, _why in RATIONALE:
    for target in targets:
        if target in rationale_by_table:
            rationale_by_table[target].append(label)

er_map = {
    "_source": "docs/Database_Schema.md",
    "_generated_by": "scripts/build-db-semantic-fragment.py",
    "_note": (
        "Committed so packages/db/scripts/test-schema.mjs can assert it against "
        "live pg_constraint. Regenerate with "
        "`python3 scripts/build-db-semantic-fragment.py` after editing the doc."
    ),
    "tables": {
        t: {
            "section": next(sec for e, _l, sec in TABLES if e == t),
            "references": sorted(tgt for s, tgt, _n in FKS if s == t),
            "referenced_by": sorted(src for src, tgt, _n in FKS if tgt == t),
            "design_notes": sorted(rationale_by_table[t]),
        }
        for t in TABLES_OUT
    },
    "foreign_keys": [{"from": s, "to": t, "why": n} for s, t, n in FKS],
    "rationale": [
        {"id": e, "label": lbl, "applies_to": sorted(tg), "why": why}
        for e, lbl, tg, why in RATIONALE
    ],
}

ER_OUT = ROOT / "docs" / "db-relationships.json"
ER_OUT.write_text(json.dumps(er_map, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"wrote {ER_OUT} — {len(TABLES_OUT)} tables, {len(FKS)} foreign keys")
