import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * Guards the presentation deck. The file is opened from disk and projected, so
 * it must stay dependency-free: no external stylesheets, scripts, fonts, or
 * images, and no network calls in its own JavaScript.
 */
const deckPath = path.join(import.meta.dirname, "andhrimnir-deck.html");
const deck = readFileSync(deckPath, "utf8");

const slides = [
	...deck.matchAll(
		/<section class="slide[^"]*" data-slide="(\d+)">([\s\S]*?)<\/section>/g,
	),
];

test("the deck has eleven ordered slides, each with a title", () => {
	assert.equal(slides.length, 11);
	slides.forEach((match, position) => {
		assert.equal(
			Number(match[1]),
			position + 1,
			"slides must be numbered in order",
		);
		const body = match[2];
		assert.match(body, /<h1>|<h2>/, `slide ${match[1]} needs a heading`);
		assert.ok(body.trim().length > 200, `slide ${match[1]} needs real content`);
	});
});

test("the deck never loads an external resource", () => {
	assert.doesNotMatch(
		deck,
		/https?:\/\//,
		"no absolute URLs may appear in the deck",
	);
	assert.doesNotMatch(deck, /<link\b/i);
	assert.doesNotMatch(deck, /<img\b/i);
	assert.doesNotMatch(deck, /@import/);
	assert.doesNotMatch(deck, /srcset|fonts\.googleapis|cdn\./i);
});

test("the deck carries its own styles, script, and keyboard navigation", () => {
	assert.match(deck, /<style>/);
	assert.match(deck, /<script>/);
	for (const control of [
		'id="prev"',
		'id="next"',
		'id="counter"',
		'id="notes"',
	]) {
		assert.match(deck, new RegExp(control), `${control} control is missing`);
	}
	assert.match(deck, /ArrowRight/);
	assert.match(deck, /ArrowLeft/);
	assert.match(
		deck,
		/fetch\(|XMLHttpRequest|WebSocket/,
		"deck must not make network calls",
	);
});

test("the deck states the honest limits rather than overclaiming", () => {
	const combined = slides.map((match) => match[2]).join("\n");
	assert.match(
		combined,
		/advisory/i,
		"AI output must be described as advisory",
	);
	assert.match(
		combined,
		/not verified|Not verified/i,
		"live verification limits must appear",
	);
	assert.match(combined, /payment capture is out of scope|not revenue/i);
	assert.match(combined, /deployment/i, "deployment status must appear");
});

test("slide six lists every rule-managed incident type", () => {
	const slideSix = slides[5][2];
	for (const type of [
		"kitchen_delay",
		"order_delay",
		"kitchen_congestion",
		"inventory_shortage",
		"reservation_conflict",
		"queue_congestion",
		"table_congestion",
	]) {
		assert.match(slideSix, new RegExp(type), `${type} must be listed`);
	}
});

test("the deck is printable and has a presenter note on every slide", () => {
	assert.match(deck, /@media print/);
	for (const match of slides) {
		assert.match(
			match[2],
			/class="note"/,
			`slide ${match[1]} needs a presenter note`,
		);
	}
});
