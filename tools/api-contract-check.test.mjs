import assert from "node:assert/strict";
import test from "node:test";
import {
	buildRouteTable,
	collectCalls,
	collectFrontendCalls,
	collectMounts,
	collectRoutes,
	evaluate,
} from "./api-contract-check.mjs";

test("mounts are read from app.ts with their router factories", () => {
	const mounts = collectMounts(`
    app.use("/api/v1", sendNoStoreApiResponse);
    app.use(
      "/api/v1/orders",
      createOrderRouter({
        createRuntime: async () => ({}),
      }),
    );
  `);
	assert.deepEqual(mounts, [
		{ prefix: "/api/v1/orders", factory: "createOrderRouter" },
	]);
});

test("route scanning ignores handler-internal calls such as request.get", () => {
	const routes = collectRoutes(`
    const origin = request.get("origin");
    router.get("/", handler);
    router.post("/:id/cancel", handler);
    router.patch("/:orderId/status", handler);
  `);
	assert.deepEqual(routes, [
		{ method: "GET", path: "/" },
		{ method: "POST", path: "/:id/cancel" },
		{ method: "PATCH", path: "/:orderId/status" },
	]);
});

test("frontend calls keep the template path and default to GET", () => {
	const calls = collectCalls(`
    void fetchWithTimeout(\`\${API_BASE}/orders\`, {
      cache: "no-store",
      credentials: "include",
    }).then(handle);
    const response = await fetchWithTimeout(\`\${API_BASE}/orders/\${orderId}/cancel\`, {
      method: "POST",
      headers: { authorization: \`Bearer \${token}\` },
    });
  `);
	assert.deepEqual(calls, [
		{ url: "/orders", method: "GET" },
		{ url: "/orders/${orderId}/cancel", method: "POST" },
	]);
});

test("the live repository has no frontend call without a mounted route", () => {
	const result = evaluate();
	assert.ok(result.routeCount > 0, "the backend scan must find routes");
	assert.ok(result.callCount > 0, "the frontend scan must find calls");
	assert.deepEqual(
		result.missingFactories,
		[],
		"every mounted factory must resolve to a router",
	);
	assert.deepEqual(
		result.unmatched,
		[],
		"every frontend call must match a mounted route",
	);
	// Known, intentional: these surfaces are backend-only or not yet wired in the UI.
	assert.ok(
		result.unused.length > 0,
		"the report still lists uncalled routes for review",
	);
});

test("frontend call records carry the file that makes them", () => {
	const calls = collectFrontendCalls();
	assert.ok(calls.length > 0);
	for (const call of calls) {
		assert.match(call.file, /^frontend\/src\/.+\.tsx?$/);
		assert.ok(call.segments[0] === "api" && call.segments[1] === "v1");
		assert.match(call.method, /^(GET|POST|PUT|PATCH|DELETE)$/);
	}
});

test("the route table resolves every mount to a real router file", () => {
	const { table, missingFactories } = buildRouteTable();
	assert.deepEqual(missingFactories, []);
	assert.ok(table.length > 20);
	for (const route of table) {
		assert.match(route.path, /^\/api\/v1/);
		assert.match(route.file, /^backend\/src\/.+\.router\.ts$/);
	}
});
