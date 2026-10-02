#!/usr/bin/env python3
"""
Build the graphify fragment and committed map for the SSO login flow.

The LLM extraction subagent failed to write output on the previous task, so
this encodes the flow from the documents directly. Every edge below cites the
section it comes from, and claims are copied from TRD §8 rather than invented.

Covers:
  PRD §3.1    unified SSO across *.shenodev.tech
  TRD §7      JWT in an HTTP-only cookie, each app verifies locally
  TRD §8      session claim shape is a cross-app contract owned by packages/auth
  Plan Ph2    the auth route tasks and the Argon2id requirement

Writes:
  graphify-out/.graphify_sem_sso.json  — the graphify chunk
  docs/sso-flow.json                   — committed map, merged with the AST pass
                                         into graphify-out/graph.json
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
CHUNK = ROOT / "graphify-out" / ".graphify_sem_sso.json"
MAP = ROOT / "docs" / "sso-flow.json"

TRD = str(ROOT / "docs" / "TRD.md")
PRD = str(ROOT / "docs" / "PRD.md")
PLAN = str(ROOT / "docs" / "Implementation_Plan.md")
SCHEMA = str(ROOT / "docs" / "Database_Schema.md")
UI = str(ROOT / "docs" / "UI_UX_Brief.md")

nodes: list[dict] = []
edges: list[dict] = []


def node(entity: str, label: str, file_type: str, source_file: str) -> dict:
    return {
        "id": f"sso_{entity}",
        "label": label,
        "file_type": file_type,
        "source_file": source_file,
        "source_location": None,
        "source_url": None,
        "captured_at": None,
        "author": None,
        "contributor": None,
    }


def edge(source: str, target: str, relation: str, source_file: str, why: str) -> dict:
    return {
        "source": f"sso_{source}",
        "target": f"sso_{target}",
        "relation": relation,
        "confidence": "EXTRACTED",
        "confidence_score": 1.0,
        "source_file": source_file,
        "source_location": None,
        "weight": 1.0,
        "why": why,
    }


# ------------------------------------------------------------------ the hosts
HOSTS = [
    ("host_shenostore", "shenostore.shenodev.tech — storefront + owns the account lifecycle (TRD §4)"),
    ("host_shenoinventory", "shenoinventory.shenodev.tech — sellers and branch staff (PRD §1)"),
    ("host_shenoflow", "shenoflow.shenodev.tech — delivery agents and order tracking (PRD §1)"),
]
for entity, label in HOSTS:
    nodes.append(node(entity, label, "document", PRD))

# --------------------------------------------------------- the shared session
CONCEPTS = [
    ("cookie_sso_session", "SSO session cookie — HttpOnly, Secure, SameSite=Lax, Domain=.shenodev.tech", TRD),
    ("jwt_token", "JWT — the token is the proof, the cookie is only the transport (TRD §7)", TRD),
    ("claim_shape", "Session claim shape — a cross-app contract owned by packages/auth (TRD §8)", TRD),
    ("mint_session", "mintSession — signs a JWT for a verified user", TRD),
    ("verify_session", "verifySession — each app verifies the signature locally", TRD),
    ("no_cross_app_calls", "No app calls another app to check 'am I logged in' (TRD §7)", TRD),
    ("login_route", "POST /api/auth/login — the central auth route on ShenoStore", PLAN),
    ("password_hashing", "Argon2id password hashing (Plan Ph2, schema §3)", PLAN),
    ("users_table", "users — password_hash, tenant_id, role_id (schema §3)", SCHEMA),
    ("demo_tenant_session", "Demo mode mints a session carrying demo_tenant_id (TRD §7, RULE 5)", TRD),
    ("tenant_from_session", "tenant_id comes from the session, never from client input (schema §3)", SCHEMA),
    ("http_only", "Token unreadable from client JS — HttpOnly (Plan Ph2 exit criteria)", TRD),
]
for entity, label, src in CONCEPTS:
    nodes.append(node(entity, label, "concept", src))

EDGES = [
    ("host_shenostore", "login_route", "references", PLAN,
     "Auth / session / SSO is first-party and lives on ShenoStore (TRD §4)."),
    ("login_route", "password_hashing", "references", PLAN,
     "Credentials are checked against users.password_hash before any token exists."),
    ("login_route", "users_table", "references", SCHEMA,
     "The route looks the user up by (tenant_id, email)."),
    ("login_route", "mint_session", "references", TRD,
     "A successful password check mints the session."),
    ("mint_session", "jwt_token", "references", TRD, "Mint signs a JWT."),
    ("mint_session", "claim_shape", "references", TRD,
     "The minted token carries the shared claim shape (TRD §8)."),
    ("jwt_token", "cookie_sso_session", "references", TRD,
     "The token is transported in the cookie; the cookie is not the proof."),
    ("cookie_sso_session", "http_only", "rationale_for", TRD,
     "HttpOnly is what makes the token unreadable from client JS."),
    ("cookie_sso_session", "host_shenoinventory", "references", PRD,
     "Domain=.shenodev.tech is what makes the browser send the cookie to every host."),
    ("cookie_sso_session", "host_shenoflow", "references", PRD,
     "Same cookie domain, so ShenoFlow receives it without a second login."),
    ("host_shenoinventory", "verify_session", "references", TRD,
     "Each app verifies the signature and reads claims."),
    ("host_shenoflow", "verify_session", "references", TRD,
     "Each app verifies the signature and reads claims."),
    ("host_shenostore", "verify_session", "references", TRD,
     "ShenoStore verifies too; it is not special-cased as the issuer."),
    ("verify_session", "no_cross_app_calls", "rationale_for", TRD,
     "A cross-app check turns every request into a cross-region round trip."),
    ("verify_session", "claim_shape", "references", TRD,
     "Verification reads the shared claim shape (TRD §8)."),
    ("claim_shape", "tenant_from_session", "rationale_for", SCHEMA,
     "tenant_id is never taken from client input — it is read from the session."),
    ("demo_tenant_session", "claim_shape", "references", TRD,
     "Demo mode mints the same claim shape carrying demo_tenant_id."),
    ("demo_tenant_session", "tenant_from_session", "references", SCHEMA,
     "Demo is a data tenant: the same tenant_id path, pointed at demo_tenant_id."),
    ("jwt_token", "http_only", "rationale_for", TRD,
     "Never read the token into app state or expose it to client JS."),
]
for s, t, rel, src, why in EDGES:
    edges.append(edge(s, t, rel, src, why))

HYPEREDGES = [
    {
        "id": "sso_one_credential_three_hosts",
        "label": "One credential, three hosts (PRD §3.1)",
        "nodes": [f"sso_{h}" for h, _ in HOSTS] + ["sso_cookie_sso_session", "sso_jwt_token"],
        "relation": "form",
        "confidence": "EXTRACTED",
        "confidence_score": 1.0,
        "source_file": PRD,
        "why": "The cookie domain is the whole mechanism: scope it to "
        ".shenodev.tech and the browser presents it to all three apps, so no "
        "per-app login exists.",
    },
    {
        "id": "sso_login_request_path",
        "label": "Login request path",
        "nodes": [
            "sso_login_route", "sso_users_table", "sso_password_hashing",
            "sso_mint_session", "sso_jwt_token", "sso_cookie_sso_session",
        ],
        "relation": "participate_in",
        "confidence": "EXTRACTED",
        "confidence_score": 1.0,
        "source_file": PLAN,
        "why": "Look up user -> verify Argon2id hash -> mint JWT -> set the "
        "shared cookie. Nothing is minted before the hash verifies.",
    },
    {
        "id": "sso_demo_mode_session",
        "label": "Demo mode session (RULE 5)",
        "nodes": [
            "sso_demo_tenant_session", "sso_tenant_from_session",
            "sso_claim_shape", "sso_cookie_sso_session",
        ],
        "relation": "participate_in",
        "confidence": "EXTRACTED",
        "confidence_score": 1.0,
        "source_file": TRD,
        "why": "Demo bypasses the password, never the tenant boundary: the "
        "session carries demo_tenant_id and every downstream query filters on "
        "it exactly as for any other tenant.",
    },
]

payload = {
    "nodes": nodes,
    "edges": edges,
    "hyperedges": HYPEREDGES,
    "input_tokens": 0,
    "output_tokens": 0,
}
CHUNK.parent.mkdir(parents=True, exist_ok=True)
CHUNK.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"wrote {CHUNK} — {len(nodes)} nodes, {len(edges)} edges, {len(HYPEREDGES)} hyperedges")

sso_map = {
    "_source": "docs/TRD.md §7-§8, docs/PRD.md §3.1, docs/Implementation_Plan.md Phase 2",
    "_generated_by": "scripts/build-sso-flow-fragment.py",
    "_note": (
        "Committed so the flow can be reviewed without running graphify. The "
        "graphify graph merges this with an AST pass over the implementation."
    ),
    "hosts": {e: label for e, label in HOSTS},
    "cookie": {
        "name": "sheno_session",
        "domain": ".shenodev.tech",
        "http_only": True,
        "secure": True,
        "same_site": "Lax",
        "rationale": "Domain=.shenodev.tech is what makes one login work on all "
        "three hosts; HttpOnly keeps the token out of client JS.",
    },
    "claims": {
        "sub": "user id (UUID)",
        "tenant_id": "tenant the session is scoped to — never from client input",
        "role_id": "role assignment driving branch scoping",
        "email": "for display only",
        "demo": "true when this is the reserved Demo-mode session",
        "note": "Owned by packages/auth and imported by all three apps (TRD §8). "
        "A redeclared copy in a second framework is the same divergence bug as "
        "a redeclared order-status enum.",
    },
    "flow": [
        "POST /api/auth/login with email + password to shenostore",
        "look up users by (tenant_id, email) — schema §3",
        "verify users.password_hash with Argon2id — nothing is minted before this passes",
        "mint a JWT carrying the shared claim shape",
        "Set-Cookie: sheno_session=<jwt>; Domain=.shenodev.tech; HttpOnly; Secure; SameSite=Lax",
        "the browser presents the cookie to shenostore, shenoinventory and shenoflow",
        "each app verifies the signature locally — no cross-app auth call (TRD §7)",
    ],
    "nodes": [{"id": n["id"], "label": n["label"], "file_type": n["file_type"]} for n in nodes],
    "edges": [
        {"source": e["source"], "target": e["target"], "relation": e["relation"], "why": e["why"]}
        for e in edges
    ],
    "hyperedges": HYPEREDGES,
}
MAP.write_text(json.dumps(sso_map, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"wrote {MAP} — {len(HOSTS)} hosts, {len(sso_map['flow'])} flow steps")
