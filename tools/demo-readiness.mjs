#!/usr/bin/env node
/**
 * Demo readiness preflight for the Andhrímnir runbook.
 *
 * The script only inspects the repository on disk. It never starts a service,
 * reads a secret value, or requires dependencies, so it can run in CI.
 *
 * Usage: node tools/demo-readiness.mjs [--strict]
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

export const REQUIRED_DEMO_DOCUMENTS = [
  "Docs/Quality/Andhrimnir_Demo_Runbook.md",
  "Docs/Quality/Andhrimnir_Demo_Strategy_and_Mock_Data_Structure.md",
  "Docs/Planning/Andhrimnir_Presentation_Plan.md",
  "README.md",
];

export const REQUIRED_DEMO_FILES = [
  "frontend/.env.example",
  "backend/.env.example",
  "backend/src/database/seed.cli.ts",
  ".github/workflows/ci.yml",
];

/** Committed secret files would break the "no secrets in Git" rule. */
export const FORBIDDEN_SECRET_FILES = [
  "frontend/.env",
  "frontend/.env.local",
  "backend/.env",
  ".env",
];

export function buildChecks(rootDir) {
  const checks = [];

  for (const relativePath of REQUIRED_DEMO_DOCUMENTS) {
    checks.push({
      id: `document:${relativePath}`,
      label: `Demo document present: ${relativePath}`,
      ok: existsSync(path.join(rootDir, relativePath)),
    });
  }

  for (const relativePath of REQUIRED_DEMO_FILES) {
    checks.push({
      id: `file:${relativePath}`,
      label: `Demo prerequisite present: ${relativePath}`,
      ok: existsSync(path.join(rootDir, relativePath)),
    });
  }

  for (const relativePath of FORBIDDEN_SECRET_FILES) {
    checks.push({
      id: `secret:${relativePath}`,
      label: `No committed environment file: ${relativePath}`,
      ok: !existsSync(path.join(rootDir, relativePath)),
    });
  }

  for (const packageName of ["frontend", "backend"]) {
    const packagePath = path.join(rootDir, packageName, "package.json");
    let pinned = false;
    if (existsSync(packagePath)) {
      try {
        const manifest = JSON.parse(readFileSync(packagePath, "utf8"));
        pinned = manifest?.engines?.node === "24.21.0";
      } catch {
        pinned = false;
      }
    }
    checks.push({
      id: `engine:${packageName}`,
      label: `${packageName} pins Node 24.21.0`,
      ok: pinned,
    });
  }

  return checks;
}

export function evaluateDemoReadiness(checks) {
  const failed = checks.filter((check) => !check.ok).map((check) => check.id);
  return { ok: failed.length === 0, total: checks.length, failed };
}

export function formatDemoReadinessReport(checks) {
  const lines = checks.map((check) => `${check.ok ? "PASS" : "FAIL"}  ${check.label}`);
  const summary = evaluateDemoReadiness(checks);
  lines.push("");
  lines.push(`${summary.total - summary.failed.length}/${summary.total} demo prerequisites satisfied.`);
  for (const id of summary.failed) lines.push(`Missing or invalid: ${id}`);
  return lines.join("\n");
}

function main(argv, stdout) {
  const strict = argv.includes("--strict");
  const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const checks = buildChecks(rootDir);
  const summary = evaluateDemoReadiness(checks);

  stdout.write(`${formatDemoReadinessReport(checks)}\n`);
  return strict && !summary.ok ? 1 : 0;
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  process.exitCode = main(process.argv.slice(2), process.stdout);
}
