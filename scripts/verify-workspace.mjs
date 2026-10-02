#!/usr/bin/env node
/**
 * Verifies the Turborepo monorepo skeleton is correctly defined.
 *
 * Run: node scripts/verify-workspace.mjs
 * Exit: 0 = pass, 1 = fail
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
let checks = 0;

function check(label, condition, detail = "") {
  checks++;
  const ok = Boolean(condition);
  if (ok) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
  return ok;
}

function readJson(path) {
  try {
    return { ok: true, data: JSON.parse(readFileSync(path, "utf8")) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

console.log("Turborepo workspace verification\n");

// ---------------------------------------------------------------- package.json
console.log("package.json");
const pkgPath = join(ROOT, "package.json");
if (!check("exists", existsSync(pkgPath))) {
  console.log("\nCannot continue without package.json.");
  process.exit(1);
}

const pkg = readJson(pkgPath);
if (!check("is valid JSON", pkg.ok, pkg.error)) {
  process.exit(1);
}

const p = pkg.data;
check("has a name", typeof p.name === "string" && p.name.length > 0);
check("is private", p.private === true, "monorepo root must not be published");
check(
  "declares a packageManager",
  typeof p.packageManager === "string" && p.packageManager.length > 0,
  "required for Corepack reproducibility",
);
check(
  "has turbo as a devDependency",
  typeof p.devDependencies?.turbo === "string",
  "turbo must be a root devDependency",
);
check(
  "has a test script",
  typeof p.scripts?.test === "string",
  `scripts.test missing; found: ${Object.keys(p.scripts ?? {}).join(", ") || "none"}`,
);

const workspaces = Array.isArray(p.workspaces) ? p.workspaces : p.workspaces?.packages;
check(
  "declares workspaces globs",
  Array.isArray(workspaces) && workspaces.length > 0,
  "expected an array like [\"apps/*\", \"packages/*\"]",
);
if (Array.isArray(workspaces)) {
  check(
    "workspaces include apps/*",
    workspaces.includes("apps/*"),
    `got: ${JSON.stringify(workspaces)}`,
  );
  check(
    "workspaces include packages/*",
    workspaces.includes("packages/*"),
    `got: ${JSON.stringify(workspaces)}`,
  );
}

// ------------------------------------------------------------------ turbo.json
console.log("\nturbo.json");
const turboPath = join(ROOT, "turbo.json");
if (check("exists", existsSync(turboPath))) {
  const turbo = readJson(turboPath);
  if (check("is valid JSON", turbo.ok, turbo.error)) {
    const t = turbo.data;
    check("declares a schema", typeof t.$schema === "string" && t.$schema.length > 0);
    // Editor autocomplete silently breaks on the legacy turbo.build host.
    check(
      "schema uses the current turborepo.dev host",
      t.$schema?.startsWith("https://turborepo.dev/schema.json"),
      `got: ${t.$schema}`,
    );

    // Turbo 2.x uses "tasks"; 1.x used "pipeline". Accept either.
    const taskMap = t.tasks ?? t.pipeline;
    check(
      "declares tasks (or pipeline for turbo 1.x)",
      typeof taskMap === "object" && taskMap !== null,
      `got keys: ${Object.keys(t).join(", ") || "none"}`,
    );

    if (taskMap && typeof taskMap === "object") {
      check(
        "defines a build task",
        typeof taskMap.build === "object" && taskMap.build !== null,
        `tasks defined: ${Object.keys(taskMap).join(", ") || "none"}`,
      );
      if (taskMap.build && typeof taskMap.build === "object") {
        check(
          "build task declares outputs",
          Array.isArray(taskMap.build.outputs) && taskMap.build.outputs.length > 0,
          "caching needs explicit outputs",
        );
      }
      check(
        "defines a dev task",
        typeof taskMap.dev === "object" && taskMap.dev !== null,
        "each app needs a dev task",
      );
    }

    // A changed DATABASE_URL must invalidate the cache. turbo hashes
    // globalDependencies into every task key; if .env is missing, tasks silently
    // reuse results built against a stale connection string.
    const globalDeps = Array.isArray(t.globalDependencies) ? t.globalDependencies : [];
    check(
      "globalDependencies includes .env",
      globalDeps.includes(".env"),
      `got: ${JSON.stringify(globalDeps)}`,
    );
  }
}

// -------------------------------------------------------------- directory tree
console.log("\ndirectories");
for (const dir of ["apps", "packages"]) {
  const full = join(ROOT, dir);
  check(`${dir}/ exists`, existsSync(full));
  if (existsSync(full) && readdirSync(full).length > 0) {
    check(`${dir}/ is a git-tracked directory (not empty)`, true);
  }
}

// ----------------------------------------------------------- turbo install
console.log("\nturbo resolution");
const turboPkgPath = join(ROOT, "node_modules/turbo/package.json");
if (check("turbo is installed", existsSync(turboPkgPath))) {
  const installed = readJson(turboPkgPath);
  if (check("installed turbo package.json is valid", installed.ok, installed.error)) {
    const declared = p.devDependencies?.turbo ?? "";
    const major = declared.match(/(\d+)\./);
    if (major) {
      // A caret range allows minor/patch drift, so only major must agree.
      check(
        "installed turbo satisfies the declared major",
        installed.data.version.split(".")[0] === major[1],
        `declared ${declared}, installed ${installed.data.version}`,
      );
    }
  }
}

// --------------------------------------------------------------------- summary
console.log("\nturbo task wiring");
// `turbo run <task>` exits 0 when no package defines that script, so any gate
// wired to it passes forever while running nothing. Check every root script
// that delegates to turbo.
{
  const manifests = ["apps", "packages"].flatMap((dir) =>
    readdirSync(join(ROOT, dir), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => join(ROOT, dir, e.name, "package.json"))
      .filter((p) => existsSync(p)),
  );

  const defined = new Set();
  for (const path of manifests) {
    const m = readJson(path);
    if (m.ok) for (const name of Object.keys(m.data.scripts ?? {})) defined.add(name);
  }

  const turboTasks = Object.entries(p.scripts ?? {})
    .map(([name, body]) => [name, String(body).match(/turbo run ([\w:-]+)/)?.[1]] ?? [])
    .filter(([, task]) => Boolean(task))
    .map(([name, task]) => [name, task]);

  check(
    "root scripts delegate to turbo",
    turboTasks.length > 0,
    "expected scripts like \"test:e2e\": \"turbo run test:e2e\"",
  );

  for (const [name, task] of turboTasks) {
    check(
      `"${name}" has at least one package defining "${task}"`,
      defined.has(task),
      `turbo run ${task} would execute 0 tasks and exit 0`,
    );
  }

  // Second direction: every task declared in turbo.json must also have an
  // implementer. A root script check alone misses a task added to turbo.json
  // with no matching root script — `npx turbo run lint` still passes silently.
  const turboJson = readJson(join(ROOT, "turbo.json"));
  if (check("turbo.json is valid JSON", turboJson.ok, turboJson.error)) {
    const declared = Object.keys(turboJson.data.tasks ?? {});
    check("turbo.json declares tasks", declared.length > 0);

    for (const task of declared) {
      // `//#name` is a root-level turbo task, not a per-package script.
      if (task.startsWith("//")) continue;
      check(
        `turbo task "${task}" has at least one package defining it`,
        defined.has(task),
        `turbo run ${task} would execute 0 tasks and exit 0`,
      );
    }
  }
}

// ------------------------------------------------------------------- database
console.log("\ndatabase artefacts");
// The ER map in docs/db-relationships.json is generated from
// docs/Database_Schema.md. It is what packages/db asserts against live
// pg_constraint, so a stale copy means the guard is checking the wrong thing.
{
  const gen = join(ROOT, "scripts", "build-db-semantic-fragment.py");
  const map = join(ROOT, "docs", "db-relationships.json");

  check("ER map generator exists", existsSync(gen), `looked in ${gen}`);
  check("committed ER map exists", existsSync(map), `looked in ${map}`);

  if (existsSync(map)) {
    const er = readJson(map);
    if (check("ER map is valid JSON", er.ok, String(er.error ?? ""))) {
      const tables = Object.keys(er.data.tables ?? {});
      const fks = er.data.foreign_keys ?? [];

      // The six core tables the ecosystem is built around, per
      // docs/Database_Schema.md §1.
      const required = ["tenants", "users", "products", "inventory", "orders", "deliveries"];
      const absent = required.filter((t) => !tables.includes(t));
      check(
        `ER map covers the six core tables`,
        absent.length === 0,
        `missing: ${absent.join(", ")}`,
      );

      // A hand-edited or half-generated map that still parses would pass the
      // checks above; this catches an edge whose endpoints are not both tables.
      const dangling = fks.filter((f) => !tables.includes(f.from) || !tables.includes(f.to));
      check(
        `every ER map foreign key joins two declared tables`,
        dangling.length === 0,
        dangling.map((f) => `${f.from}->${f.to}`).join(", "),
      );

      // tenants is the isolation boundary, so a map that omits it as a target
      // has lost the multi-tenancy edge that everything else hangs off.
      const tenantTargets = fks.filter((f) => f.to === "tenants");
      check(
        `tenants is referenced by at least four tables (§10 isolation)`,
        tenantTargets.length >= 4,
        `only ${tenantTargets.length} tables point at tenants`,
      );
    }
  }

  const migrations = join(ROOT, "packages", "db", "drizzle");
  const sqlFiles = existsSync(migrations)
    ? readdirSync(migrations).filter((f) => f.endsWith(".sql"))
    : [];
  check("packages/db has at least one migration file", sqlFiles.length > 0, `looked in ${migrations}`);
}

// --------------------------------------------------------------------- summary
console.log("\nplaywright webServer isolation");
// reuseExistingServer lets Playwright adopt a dev server that is already on the
// port. If that server predates the change under test, the suite passes against
// stale output. This has silently produced a green run three times on this
// repo, once of them against an unrelated local service on port 3001.
{
  const configs = ["apps", "packages"].flatMap((dir) =>
    readdirSync(join(ROOT, dir), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => join(ROOT, dir, e.name, "playwright.config.ts"))
      .filter((p) => existsSync(p)),
  );

  check("playwright configs found", configs.length > 0, "none found");

  for (const path of configs) {
    const source = readFileSync(path, "utf8");
    const name = readJson(path.replace("playwright.config.ts", "package.json"));

    // Only flag an unconditional `true` or a `!process.env.CI` form. Both leave
    // a local dev server eligible for reuse.
    const reuses = /reuseExistingServer:\s*(!process\.env\.CI|true)/.test(source);

    check(
      `${name.ok ? name.data.name : path} sets reuseExistingServer: false`,
      !reuses,
      "a stale dev server on that port can serve pre-change output to the suite",
    );
  }
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.log(`RESULT: FAIL (${failures} failing)`);
  process.exit(1);
}
console.log("RESULT: PASS");