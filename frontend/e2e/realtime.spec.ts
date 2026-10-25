import { API_ORIGIN, seedDemoData } from "./fixtures/demo";
import { apiToken, expect, signInAs, test } from "./fixtures/test";

const TOMATO_ID = "710000000000000000000013";

test.afterAll(() => seedDemoData());

function unreadCount(label: string | null): number {
  const match = label?.match(/(\d+) unread/);
  return match ? Number(match[1]) : 0;
}

test("the notification bell updates over the WebSocket without a reload", async ({
  page,
  request,
}) => {
  const manager = await apiToken(request, "Manager");
  const setTomato = (quantity: number) =>
    request.put(`${API_ORIGIN}/api/v1/inventory/${TOMATO_ID}`, {
      headers: { authorization: `Bearer ${manager}` },
      data: { quantity, lowStockThreshold: 4 },
    });
  // A healthy count first, so the depletion below opens a fresh incident.
  expect((await setTomato(20)).status()).toBe(200);

  const socketOpened = page.waitForEvent("websocket", (socket) =>
    socket.url().includes("/api/v1/notifications/socket"),
  );
  const feedLoaded = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/v1/notifications" && response.ok(),
  );
  await signInAs(page, "Manager");
  const socket = await socketOpened;
  await feedLoaded;
  const bell = page.getByRole("button", { name: /^Notifications/ });
  await expect(bell).toBeVisible();
  const before = unreadCount(await bell.getAttribute("aria-label"));

  const pushed = socket.waitForEvent("framereceived", (frame) =>
    String(frame.payload).includes("notification"),
  );
  let reloaded = false;
  page.on("load", () => {
    reloaded = true;
  });

  // Another device depletes stock; the incident notifier alerts the manager.
  expect((await setTomato(0)).status()).toBe(200);
  await pushed;

  await expect
    .poll(async () => unreadCount(await bell.getAttribute("aria-label")), { timeout: 15_000 })
    .toBeGreaterThan(before);
  expect(reloaded).toBe(false);
  // Screen-reader users hear the alert once through the polite live region.
  await expect(
    page.locator('[aria-live="polite"]').filter({ hasText: /^New notification/ }),
  ).toHaveCount(1);

  await bell.click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/Tomato|inventory/i).first()).toBeVisible();
});
