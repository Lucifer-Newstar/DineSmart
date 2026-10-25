import { seedDemoData } from "./fixtures/demo";

/**
 * Seeds the demo restaurant into the e2e database before the suite runs, so
 * every run starts from the same Saffron & Co. records.
 */
export default function globalSetup(): void {
  seedDemoData();
}
