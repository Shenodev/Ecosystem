# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root, or
- **`GLOSSARY-MAP.md`** at the repo root if it exists: it points at one `GLOSSARY.md` per context. Read each one relevant to the topic.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

This repo is **single-context**: one `GLOSSARY.md` and one `docs/adr/` at the root.

```
/
├── GLOSSARY.md
├── docs/
│   ├── adr/
│   │   ├── 0001-....md
│   │   └── 0002-....md
│   ├── agents/          ← agent skill config (issue tracker, triage labels)
│   └── *.md             ← project docs: PRD, TRD, Rules, App_Flow, …
└── apps/ packages/
```

**Revisit this decision** once `packages/db`, `packages/ui`, or the three apps contain real source. At that point per-context glossaries and `src/<context>/docs/adr/` may be worth splitting out — at present `apps/*` and `packages/*` are empty placeholders.

Note that `docs/` serves two purposes: project documents that govern *what gets built*, and `docs/agents/` + `docs/adr/` which govern *how agents work*. Both are in scope for a task that touches them.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

Terms already defined in prose, and candidates for the glossary when it is created: `tenant`, `demo_tenant_id`, `quantity`, `reserved_quantity`, `available`, the four order statuses (`in_progress`, `waiting_for_shipping`, `out_for_delivery`, `completed`), and the Owner/Admin/Staff roles.

## Existing terminology of record

Until a `GLOSSARY.md` exists, these documents define the vocabulary. Read them before naming a domain concept:

| Document | Defines |
|----------|---------|
| `docs/PRD.md` | Scope, the three apps, roles, out-of-scope |
| `docs/TRD.md` | Architecture, framework choices, infrastructure |
| `docs/Database_Schema.md` | Tables, columns, constraints, tenant isolation |
| `docs/App_Flow.md` | Journeys and status transitions |
| `docs/Rules.md` | Binding agent rules |

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_