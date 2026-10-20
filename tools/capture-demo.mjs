#!/usr/bin/env node
/**
 * Backup-demo capture tool (S3-12).
 *
 * Walks the browser-visible steps of the demo runbook, captures a screenshot
 * per step, and writes a single self-contained HTML walkthrough
 * (`index.html`, screenshots embedded as data URIs) that can be presented when
 * the live environment is unavailable.
 *
 * Playwright is intentionally NOT a project dependency: this is an optional
 * presenter tool. Install it on demand with
 *   npm i -D playwright && npx playwright install chromium
 *
 * Usage:
 *   node tools/capture-demo.mjs [--base-url http://127.0.0.1:3000] \
 *     [--out demo-capture] [--viewport 1440x900] [--settle 2200]
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const STEPS = [
	{
		file: "01-landing",
		route: "/",
		title: "Public landing page",
		narration:
			"Signed out, the product opens on the customer landing route with menu, reservation, and sign-in entry points. This step needs no database.",
	},
	{
		file: "02-menu",
		route: "/menu",
		title: "Live menu browsing",
		narration:
			"The menu is server-priced and tenant-scoped. With no database the UI shows its explicit unavailable state rather than inventing dishes — narrate the fallback, never a fake menu.",
	},
	{
		file: "03-orders-signed-out",
		route: "/orders",
		title: "Order history asks for identity",
		narration:
			"Order history is owner-scoped. Signed out, the screen prompts for sign-in instead of showing a shared list.",
	},
	{
		file: "04-register",
		route: "/register",
		title: "Registration with OTP verification",
		narration:
			"Registration requires an emailed OTP. Locally the email adapter is a mock provider, so no credential is needed to show this step.",
	},
	{
		file: "05-login",
		route: "/login",
		title: "Sign-in",
		narration:
			"Sign-in accepts email and password or Google OAuth. Role switching is the strongest evidence of the permission model: sign in per role rather than describing the matrix.",
	},
	{
		file: "06-booking",
		route: "/book",
		title: "Table reservation",
		narration:
			"A customer books a table; the reservation starts as awaiting confirmation. Reception confirms it in the next step of the live run.",
	},
	{
		file: "07-dashboard-overview",
		route: "/dashboard",
		title: "Operational workspace overview",
		narration:
			"The staff workspace is role-aware. Without a database it opens in an explicit preview state, and every sample card is labelled as preview data.",
	},
	{
		file: "08-dashboard-kitchen",
		route: "/dashboard",
		click: "Kitchen",
		title: "Kitchen queue",
		narration:
			"Kitchen Staff advance items from created to preparing to ready. The queue is bounded and tenant-scoped, and preparation states are the only field they may change.",
	},
	{
		file: "09-dashboard-incidents",
		route: "/dashboard",
		click: "Incidents",
		title: "Incidents with trigger evidence",
		narration:
			"The incidents workspace is Manager/Administrator only. This database-less capture shows its labelled preview records; with a seeded database the same view lists rule-managed incidents with a bounded trigger snapshot and a severity. Incidents resolve automatically when the condition clears, and a recurrence opens a fresh identifier — there is no manual close control, so do not promise one.",
	},
	{
		file: "10-dashboard-insights",
		route: "/dashboard",
		click: "Insights",
		title: "Advisory recommendations",
		narration:
			"Recommendations are advisory: Gemini produces summary, priority, actions, and confidence, and a deterministic fallback keeps the flow usable without a key. This capture shows the preview card; with live data the Generate insight action labels its source — gemini, fallback, or seeded demo.",
	},
	{
		file: "11-dashboard-analytics",
		route: "/dashboard",
		click: "Analytics",
		title: "Operational analytics",
		narration:
			"Charts are tenant-scoped and operational: counts and preparation times, not revenue. This database-less capture shows the empty state; with a seeded database the same route renders 7d/30d series, and capped series carry an explicit truncation notice.",
	},
	{
		file: "12-dashboard-mobile",
		route: "/dashboard",
		viewport: { width: 390, height: 844 },
		title: "Phone-sized workspace",
		narration:
			"The same workspace at 390 px. Horizontal overflow and sub-24 px controls were fixed in S3-07; this capture is the regression evidence.",
	},
];

function parseArguments(argv) {
	const options = {
		baseUrl: "http://127.0.0.1:3000",
		out: "demo-capture",
		viewport: { width: 1440, height: 900 },
		settle: 2200,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--base-url") options.baseUrl = argv[index + 1];
		else if (argument === "--out") options.out = argv[index + 1];
		else if (argument === "--settle") options.settle = Number(argv[index + 1]);
		else if (argument === "--viewport") {
			const [width, height] = String(argv[index + 1])
				.split("x")
				.map(Number);
			options.viewport = { width, height };
		} else if (argument === "--help" || argument === "-h") {
			options.help = true;
		}
	}
	return options;
}

function escapeHtml(value) {
	return String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

function renderIndex(captures) {
	const slides = captures
		.map(
			(
				capture,
				position,
			) => `      <section class="slide${position === 0 ? " active" : ""}" data-slide="${position + 1}">
        <p class="eyebrow">Backup demo · step ${position + 1} of ${captures.length}</p>
        <h2>${escapeHtml(capture.title)}</h2>
        <p class="route"><code>${escapeHtml(capture.url)}</code></p>
        <img src="data:image/png;base64,${capture.dataUri}" alt="${escapeHtml(capture.title)}" />
        <p class="note">${escapeHtml(capture.narration)}</p>
      </section>`,
		)
		.join("\n");

	return `<!doctype html>
<html lang="en-IN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Andhrímnir — recorded backup demo</title>
    <style>
      :root { --ink: #14180f; --paper: #fbfaf6; --muted: #5d6455; --brand: #2f6f3e; --line: #d9d7cc; }
      * { box-sizing: border-box; }
      body { margin: 0; background: #20241c; color: var(--ink);
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
      .stage { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
      .slide { display: none; width: min(1080px, 100%); background: var(--paper);
        border-radius: 18px; padding: 40px 48px 88px; box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45); }
      .slide.active { display: block; }
      .eyebrow { font-size: 13px; letter-spacing: 0.18em; text-transform: uppercase;
        color: #b4551d; font-weight: 700; margin: 0; }
      h2 { font-size: 32px; margin: 12px 0 6px; }
      .route { margin: 0 0 16px; color: var(--muted); font-size: 14px; }
      img { width: 100%; border: 1px solid var(--line); border-radius: 10px; background: #fff; }
      .note { margin: 18px 0 0; font-size: 17px; line-height: 1.55; color: var(--muted); font-style: italic; }
      .bar { position: fixed; left: 0; right: 0; bottom: 0; display: flex; gap: 14px;
        align-items: center; justify-content: center; padding: 14px;
        background: rgba(20, 24, 15, 0.92); color: #f2f2ea; font-size: 14px; }
      button { font: inherit; color: #f2f2ea; background: #33382a; border: 1px solid #4c5340;
        border-radius: 8px; padding: 8px 16px; cursor: pointer; min-height: 36px; }
      .counter { min-width: 92px; text-align: center; }
      @media print { body { background: #fff; } .bar { display: none; }
        .slide { display: block !important; box-shadow: none; page-break-after: always; } }
    </style>
  </head>
  <body>
    <main class="stage">
${slides}
    </main>
    <nav class="bar" aria-label="Demo controls">
      <button type="button" id="prev">Previous</button>
      <span class="counter" id="counter">1 / ${captures.length}</span>
      <button type="button" id="next">Next</button>
    </nav>
    <script>
      (function () {
        var slides = Array.prototype.slice.call(document.querySelectorAll(".slide"));
        var counter = document.getElementById("counter");
        var index = 0;
        function show(next) {
          index = Math.min(Math.max(next, 0), slides.length - 1);
          slides.forEach(function (slide, position) {
            slide.classList.toggle("active", position === index);
          });
          counter.textContent = index + 1 + " / " + slides.length;
        }
        document.getElementById("prev").addEventListener("click", function () { show(index - 1); });
        document.getElementById("next").addEventListener("click", function () { show(index + 1); });
        document.addEventListener("keydown", function (event) {
          if (event.key === "ArrowRight" || event.key === " ") { event.preventDefault(); show(index + 1); }
          else if (event.key === "ArrowLeft") { event.preventDefault(); show(index - 1); }
        });
        show(0);
      })();
    </script>
  </body>
</html>
`;
}

async function main() {
	const options = parseArguments(process.argv.slice(2));
	if (options.help) {
		console.log(
			"Usage: node tools/capture-demo.mjs [--base-url URL] [--out DIR] [--viewport WxH] [--settle MS]",
		);
		return;
	}

	let chromium;
	try {
		({ chromium } = await import("playwright"));
	} catch {
		console.error(
			"Playwright is not installed. This optional presenter tool needs it:\n" +
				"  npm i -D playwright && npx playwright install chromium",
		);
		process.exitCode = 2;
		return;
	}

	const outDir = path.resolve(options.out);
	mkdirSync(outDir, { recursive: true });
	const browser = await chromium.launch();
	const captures = [];
	const manifest = [];

	for (const step of STEPS) {
		const viewport = step.viewport ?? options.viewport;
		const page = await browser.newPage({ viewport });
		const url = `${options.baseUrl}${step.route}`;
		const statuses = [];
		page.on("response", (response) => {
			if (response.status() >= 400)
				statuses.push(`${response.status()} ${response.url()}`);
		});
		await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
		await page.waitForTimeout(options.settle);

		// Dashboard sections are component state, not routes: click the sidebar item.
		let navigationApplied = null;
		if (step.click) {
			const item = page
				.locator("button.nav-item", { hasText: step.click })
				.first();
			await item.waitFor({ state: "visible", timeout: 20_000 });
			await item.click({ timeout: 10_000 });
			await page.waitForTimeout(900);
			navigationApplied = await item.evaluate((element) =>
				element.className.includes("nav-item-active"),
			);
		}
		const file = path.join(outDir, `${step.file}.png`);
		await page.screenshot({ path: file, fullPage: false });
		const buffer = await page.screenshot({ fullPage: false });
		captures.push({
			...step,
			url,
			dataUri: buffer.toString("base64"),
		});
		manifest.push({
			step: step.file,
			title: step.title,
			url,
			viewport,
			clicked: step.click ?? null,
			navigationApplied,
			nonOkResponses: statuses,
		});
		console.log(
			`captured ${step.file} (${viewport.width}x${viewport.height}) ${url}`,
		);
		await page.close();
	}

	await browser.close();

	writeFileSync(path.join(outDir, "index.html"), renderIndex(captures));
	writeFileSync(
		path.join(outDir, "manifest.json"),
		`${JSON.stringify({ baseUrl: options.baseUrl, capturedAt: new Date().toISOString(), steps: manifest }, null, 2)}\n`,
	);
	console.log(`\nWrote ${captures.length} steps to ${outDir}/index.html`);
	console.log(
		"Open index.html offline: it embeds every screenshot and needs no network access.",
	);
}

await main();
