import { formatDemoFixtureSummary, summarizeDemoFixtures } from "./demo-fixtures.js";

/**
 * Prints what the seeded demo scenario contains without connecting to a
 * database, so a presenter can rehearse the narrative from the fixture set.
 */
process.stdout.write(`${formatDemoFixtureSummary(summarizeDemoFixtures())}\n`);
