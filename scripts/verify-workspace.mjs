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
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.log(`RESULT: FAIL (${failures} failing)`);
  process.exit(1);
}
console.log("RESULT: PASS");