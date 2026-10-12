import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  FORBIDDEN_SECRET_FILES,
  REQUIRED_DEMO_DOCUMENTS,
  REQUIRED_DEMO_FILES,
  buildChecks,
  evaluateDemoReadiness,
  formatDemoReadinessReport,
} from "./demo-readiness.mjs";

function write(rootDir, relativePath, contents = "placeholder\n") {
  const target = path.join(rootDir, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function seedCompleteRepo(rootDir) {
  for (const relativePath of [...REQUIRED_DEMO_DOCUMENTS, ...REQUIRED_DEMO_FILES]) {
    write(rootDir, relativePath);
  }
  write(
    rootDir,
    "frontend/package.json",
    JSON.stringify({ name: "frontend", engines: { node: "24.21.0" } }),
  );
  write(
    rootDir,
    "backend/package.json",
    JSON.stringify({ name: "backend", engines: { node: "24.21.0" } }),
  );
}

test("a fully prepared repository passes every prerequisite", () => {
  const rootDir = mkdtempSync(path.join(tmpdir(), "andhrimnir-demo-"));
  seedCompleteRepo(rootDir);

  const checks = buildChecks(rootDir);
  const summary = evaluateDemoReadiness(checks);
  assert.deepEqual(summary.failed, []);
  assert.equal(summary.ok, true);
  assert.equal(summary.total, REQUIRED_DEMO_DOCUMENTS.length + REQUIRED_DEMO_FILES.length + 6);
});

test("missing documents, files, wrong engines, and committed env files are reported", () => {
  const rootDir = mkdtempSync(path.join(tmpdir(), "andhrimnir-demo-"));
  seedCompleteRepo(rootDir);
  write(rootDir, "backend/package.json", JSON.stringify({ name: "backend", engines: {} }));
  write(rootDir, "backend/.env", "MONGODB_URI=should-not-be-committed\n");

  const summary = evaluateDemoReadiness(buildChecks(rootDir));
  assert.equal(summary.ok, false);
  assert.ok(summary.failed.includes("engine:backend"));
  assert.ok(summary.failed.includes("secret:backend/.env"));
  assert.ok(!summary.failed.includes("engine:frontend"));
  assert.ok(!summary.failed.includes("document:README.md"));
});

test("an empty directory fails every required check but no secret check", () => {
  const rootDir = mkdtempSync(path.join(tmpdir(), "andhrimnir-demo-"));
  const summary = evaluateDemoReadiness(buildChecks(rootDir));

  assert.equal(summary.ok, false);
  for (const relativePath of REQUIRED_DEMO_DOCUMENTS) {
    assert.ok(summary.failed.includes(`document:${relativePath}`));
  }
  for (const relativePath of REQUIRED_DEMO_FILES) {
    assert.ok(summary.failed.includes(`file:${relativePath}`));
  }
  for (const relativePath of FORBIDDEN_SECRET_FILES) {
    assert.ok(!summary.failed.includes(`secret:${relativePath}`));
  }
});

test("the report lists one line per check and names every failure", () => {
  const rootDir = mkdtempSync(path.join(tmpdir(), "andhrimnir-demo-"));
  const checks = buildChecks(rootDir);
  const report = formatDemoReadinessReport(checks);

  const lines = report.split("\n").filter((line) => line.startsWith("PASS") || line.startsWith("FAIL"));
  assert.equal(lines.length, checks.length);
  assert.match(report, /\d+\/\d+ demo prerequisites satisfied\./);
  assert.match(report, /Missing or invalid: document:README\.md/);
});
