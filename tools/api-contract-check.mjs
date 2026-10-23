#!/usr/bin/env node
/**
 * Static API contract check (S3-07 bug triage).
 *
 * Frontend code can drift from the routes the API actually mounts. This tool reads
 * both sides and reports the difference:
 *
 *   - every `fetchWithTimeout(...)` call in `frontend/src` (URL template + method),
 *     plus the dashboard's `useApiResource(path)` and `apiSend(path, token, method)` helpers
 *   - every route registered in the routers mounted by `backend/src/app.ts`
 *
 * Template placeholders (`${id}`) and Express params (`:id`) both normalise to a
 * wildcard, so dynamic paths still match. A call is "unmatched" when no mounted
 * route accepts its method on a path with the same segment shape.
 *
 * Usage:
 *   node tools/api-contract-check.mjs [--strict] [--json]
 *
 * `--strict` exits non-zero when a call has no matching route, or when the
 * backend exposes no routes at all (which means the scan failed, not that the
 * API is empty).
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const WILDCARD = "*";

function walk(directory, filter) {
	const results = [];
	for (const entry of readdirSync(directory)) {
		const target = path.join(directory, entry);
		if (statSync(target).isDirectory()) {
			if (entry === "node_modules" || entry === ".next" || entry === "dist")
				continue;
			results.push(...walk(target, filter));
		} else if (filter(target)) {
			results.push(target);
		}
	}
	return results;
}

const isSource = (file) => /\.(ts|tsx)$/.test(file) && !file.endsWith(".d.ts");
const isRouter = (file) => file.endsWith(".router.ts");

function normalizeSegments(value) {
	return value
		.split("?")[0]
		.split("/")
		.filter((segment) => segment.length > 0)
		.map((segment) =>
			/^\$\{|{|:|^\[.*\]$/.test(segment) ? WILDCARD : segment,
		);
}

/** Reads the mount prefixes and their router factories out of app.ts. */
export function collectMounts(appSource) {
	const mounts = [];
	const pattern =
		/app\.use\(\s*["']([^"']+)["'],\s*create([A-Za-z0-9]+)Router\(/g;
	for (const match of appSource.matchAll(pattern)) {
		mounts.push({ prefix: match[1], factory: `create${match[2]}Router` });
	}
	return mounts;
}

/** Reads method/path pairs out of a router module. */
export function collectRoutes(routerSource) {
	const routes = [];
	// Only Express registrations: the path must start with a slash, which skips
	// handler-internal calls such as `request.get("origin")`.
	const pattern = /router\.(get|post|put|patch|delete)\(\s*["'](\/[^"']*)["']/g;
	for (const match of routerSource.matchAll(pattern)) {
		routes.push({ method: match[1].toUpperCase(), path: match[2] });
	}
	return routes;
}

/** Reads every frontend fetchWithTimeout call: url template plus init method. */
export function collectCalls(source) {
	const calls = [];
	const pattern = /fetchWithTimeout\(\s*([\s\S]{0,400}?)\)\s*(?:\.|;|\n)/g;
	for (const match of source.matchAll(pattern)) {
		const body = match[1];
		const urlMatch =
			body.match(/`\$\{API_BASE\}([^`]*)`/) ??
			body.match(/["'](\/api\/v1[^"']*)["']/);
		if (!urlMatch) continue;
		// A bare `${API_BASE}${path}` is the shared helper; its callers are read below.
		if (/^\$\{[A-Za-z_]+\}$/.test(urlMatch[1] ?? "")) continue;
		const methodMatch = body.match(/method:\s*["']([A-Z]+)["']/);
		calls.push({
			url: urlMatch[1] || "",
			method: (methodMatch?.[1] ?? "GET").toUpperCase(),
		});
	}
	// Dashboard helpers: useApiResource(path, ...) reads, apiSend(path, token, method, ...) writes.
	const helperPattern =
		/\b(useApiResource|apiSend)(?:<[^>(]*>)?\(\s*(["'`])(\/[^"'`]*)\2\s*(?:,\s*[A-Za-z_.]+\s*(?:,\s*["']([A-Z]+)["'])?)?/g;
	for (const match of source.matchAll(helperPattern)) {
		calls.push({
			url: match[3],
			method: match[1] === "apiSend" ? (match[4] ?? "GET") : "GET",
		});
	}
	return calls;
}

export function buildRouteTable(
	appPath = path.join(root, "backend", "src", "app.ts"),
) {
	const appSource = readFileSync(appPath, "utf8");
	const routerFiles = walk(path.join(root, "backend", "src"), isRouter);
	const byFactory = new Map();
	for (const file of routerFiles) {
		const source = readFileSync(file, "utf8");
		for (const match of source.matchAll(
			/export function (create[A-Za-z0-9]+Router)/g,
		)) {
			byFactory.set(match[1], { file: path.relative(root, file), source });
		}
	}

	const table = [];
	const missingFactories = [];
	for (const mount of collectMounts(appSource)) {
		const entry = byFactory.get(mount.factory);
		if (!entry) {
			missingFactories.push(mount.factory);
			continue;
		}
		for (const route of collectRoutes(entry.source)) {
			const segments = [
				...normalizeSegments(mount.prefix),
				...normalizeSegments(route.path),
			];
			table.push({
				method: route.method,
				path: `${mount.prefix}${route.path === "/" ? "" : route.path}`,
				segments,
				file: entry.file,
			});
		}
	}
	return { table, missingFactories };
}

export function collectFrontendCalls(
	frontendDir = path.join(root, "frontend", "src"),
) {
	const calls = [];
	for (const file of walk(frontendDir, isSource)) {
		const source = readFileSync(file, "utf8");
		for (const call of collectCalls(source)) {
			calls.push({
				file: path.relative(root, file),
				url: call.url,
				method: call.method,
				segments: [
					...normalizeSegments("/api/v1"),
					...normalizeSegments(call.url),
				],
			});
		}
	}
	return calls;
}

function segmentsMatch(callSegments, routeSegments) {
	if (callSegments.length !== routeSegments.length) return false;
	return callSegments.every(
		(segment, index) =>
			segment === routeSegments[index] ||
			segment === WILDCARD ||
			routeSegments[index] === WILDCARD,
	);
}

export function evaluate() {
	const { table, missingFactories } = buildRouteTable();
	const calls = collectFrontendCalls();

	const unmatched = [];
	for (const call of calls) {
		const hit = table.some(
			(route) =>
				route.method === call.method &&
				segmentsMatch(call.segments, route.segments),
		);
		if (!hit) unmatched.push(call);
	}

	const used = new Set();
	for (const call of calls) {
		for (const route of table) {
			if (
				route.method === call.method &&
				segmentsMatch(call.segments, route.segments)
			) {
				used.add(`${route.method} ${route.path}`);
			}
		}
	}
	const unused = table
		.filter((route) => !used.has(`${route.method} ${route.path}`))
		.map((route) => `${route.method} ${route.path}`);

	return {
		routeCount: table.length,
		callCount: calls.length,
		unmatched,
		unused,
		missingFactories,
	};
}

function report(result) {
	const lines = [
		`Mounted API routes: ${result.routeCount}`,
		`Frontend API calls: ${result.callCount}`,
		`Unmatched calls:    ${result.unmatched.length}`,
	];
	for (const call of result.unmatched) {
		lines.push(`  - ${call.method} /api/v1${call.url}  (${call.file})`);
	}
	if (result.missingFactories.length > 0) {
		lines.push(
			`Router factories not found: ${result.missingFactories.join(", ")}`,
		);
	}
	lines.push(`Routes not called from the frontend: ${result.unused.length}`);
	for (const route of result.unused) lines.push(`  · ${route}`);
	return lines.join("\n");
}

const argv = process.argv.slice(2);
const result = evaluate();

if (argv.includes("--json")) {
	console.log(JSON.stringify(result, null, 2));
} else {
	console.log(report(result));
}

if (argv.includes("--strict")) {
	const broken =
		result.unmatched.length > 0 ||
		result.routeCount === 0 ||
		result.missingFactories.length > 0;
	process.exitCode = broken ? 1 : 0;
}
