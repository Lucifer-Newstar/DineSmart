"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchWithTimeout } from "../api-client";
import { useAuth } from "../auth-provider";
import { BrandMark } from "../brand-mark";
import { formatMinorCurrency } from "../currency";
import { useDialogFocus } from "../dialog-focus";
import { tabId, tabIndexForKey } from "../roving-tabs";
import {
  ALL_DISHES,
  applyAvailability,
  type CartLine,
  calculateCartTotalMinor,
  MAX_ITEM_QUANTITY,
  MAX_ORDER_LINES,
  MAX_ORDER_UNITS,
  type MenuItem,
  OBJECT_ID_PATTERN,
  parseMenu,
  parsePendingCart,
  type RestaurantMenu,
  reconcileCart,
} from "./menu-data";
import { useLiveMenuAvailability } from "./use-live-menu";

type MenuStatus = "loading" | "ready" | "error";

interface PlacedOrder {
  id: string;
  status: string;
  totalMinor: number;
  currency: string;
}

const API_BASE = "/api/v1";
const RESTAURANT_ID = process.env.NEXT_PUBLIC_DEMO_RESTAURANT_ID ?? "710000000000000000000001";
const CART_STORAGE_KEY = "dinesmart.pending-order-cart.v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePlacedOrder(value: unknown): PlacedOrder | null {
  if (!isRecord(value) || !isRecord(value.order)) return null;
  const order = value.order;
  if (
    typeof order.id !== "string" ||
    !OBJECT_ID_PATTERN.test(order.id) ||
    typeof order.status !== "string" ||
    typeof order.totalMinor !== "number" ||
    !Number.isSafeInteger(order.totalMinor) ||
    order.totalMinor < 0 ||
    typeof order.currency !== "string" ||
    !/^[A-Z]{3}$/.test(order.currency)
  ) {
    return null;
  }
  return {
    id: order.id,
    status: order.status,
    totalMinor: order.totalMinor,
    currency: order.currency,
  };
}

async function responseError(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json();
    if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string") {
      return payload.error.message;
    }
  } catch {
    // Fall back to a stable message for non-JSON proxy/service errors.
  }
  return "We couldn't place the order. Please try again.";
}

function currency(valueMinor: number, currencyCode: string): string {
  return formatMinorCurrency(valueMinor, currencyCode);
}

function safeCurrency(
  valueMinor: number | null,
  currencyCode: string,
  unavailableLabel = "Amount unavailable",
): string {
  return valueMinor === null ? unavailableLabel : currency(valueMinor, currencyCode);
}

function MenuIcon({
  name,
  size = 18,
}: {
  name: "search" | "close" | "plus" | "minus" | "arrow-right" | "leaf" | "clock" | "bag";
  size?: number;
}) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const paths = {
    search: (
      <>
        <circle cx="10.8" cy="10.8" r="6.3" {...common} />
        <path d="m16 16 4.2 4.2" {...common} />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" {...common} />,
    plus: <path d="M12 5v14M5 12h14" {...common} />,
    minus: <path d="M5 12h14" {...common} />,
    "arrow-right": <path d="M4 12h15M13 6l6 6-6 6" {...common} />,
    leaf: (
      <>
        <path d="M19.5 4.5C11 4.5 5 7 5 13c0 3.5 2.3 6 5.5 6 6 0 8.5-6 9-14.5Z" {...common} />
        <path d="M4 21c2.5-5 6.5-8.5 12-11" {...common} />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" {...common} />
        <path d="M12 7v5l3.5 2" {...common} />
      </>
    ),
    bag: (
      <>
        <path d="M5 8h14l-1 12H6L5 8Z" {...common} />
        <path d="M9 8a3 3 0 0 1 6 0" {...common} />
      </>
    ),
  };
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24">
      {paths[name]}
    </svg>
  );
}

export default function MenuPage() {
  const router = useRouter();
  const { user, accessToken, isLoading: authLoading } = useAuth();
  const [menu, setMenu] = useState<RestaurantMenu | null>(null);
  const [menuStatus, setMenuStatus] = useState<MenuStatus>("loading");
  const [menuError, setMenuError] = useState("");
  const [reloadMenu, setReloadMenu] = useState(0);
  const [category, setCategory] = useState(ALL_DISHES);
  const [search, setSearch] = useState("");
  const [vegetarianOnly, setVegetarianOnly] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const cartRef = useRef<HTMLElement>(null);
  const closeCart = useCallback(() => setCartOpen(false), []);
  // Focus moves into the bag, stays there, and returns to the bag button on close.
  useDialogFocus(cartOpen, cartRef, closeCart);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartRestored, setCartRestored] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cartError, setCartError] = useState("");
  const [toast, setToast] = useState("");
  const [placedOrder, setPlacedOrder] = useState<PlacedOrder | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const loadMenu = async () => {
      setMenuStatus("loading");
      setMenuError("");
      if (!OBJECT_ID_PATTERN.test(RESTAURANT_ID)) {
        setMenuStatus("error");
        setMenuError("The demo restaurant is not configured with a valid ID.");
        return;
      }
      try {
        const query = new URLSearchParams({
          restaurantId: RESTAURANT_ID,
          refresh: String(reloadMenu),
        });
        const response = await fetchWithTimeout(`${API_BASE}/menu?${query.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(
            response.status === 404
              ? "This restaurant menu is not available right now."
              : await responseError(response),
          );
        }
        const parsed = parseMenu(await response.json());
        if (!parsed || parsed.id.toLowerCase() !== RESTAURANT_ID.toLowerCase()) {
          throw new Error("The restaurant returned an invalid menu response.");
        }
        setMenu(parsed);
        setMenuStatus("ready");
      } catch (error) {
        if (controller.signal.aborted) return;
        setMenu(null);
        setMenuStatus("error");
        setMenuError(
          error instanceof Error
            ? error.message
            : "The live menu is unavailable. No preview items can be ordered.",
        );
      }
    };
    void loadMenu();
    return () => controller.abort();
  }, [reloadMenu]);

  // Re-reads the menu in place (no loading state) so sold-out changes appear live.
  const resyncMenu = useCallback(async () => {
    if (!OBJECT_ID_PATTERN.test(RESTAURANT_ID)) return;
    try {
      const query = new URLSearchParams({
        restaurantId: RESTAURANT_ID,
        resync: String(Date.now()),
      });
      const response = await fetchWithTimeout(`${API_BASE}/menu?${query.toString()}`);
      if (!response.ok) return;
      const parsed = parseMenu(await response.json());
      if (parsed && parsed.id.toLowerCase() === RESTAURANT_ID.toLowerCase()) setMenu(parsed);
    } catch {
      // A failed background check keeps the current menu; the next one retries.
    }
  }, []);

  useLiveMenuAvailability({
    accessToken,
    enabled: menuStatus === "ready",
    onAvailability: (menuItemId, isAvailable) =>
      setMenu((current) =>
        current ? applyAvailability(current, menuItemId, isAvailable) : current,
      ),
    onResync: () => void resyncMenu(),
  });

  // A dish that sells out while it sits in the bag is taken out, and the guest is told.
  useEffect(() => {
    if (!menu) return;
    setCart((current) => {
      const { lines, removed } = reconcileCart(current, menu);
      if (removed.length === 0) return current;
      setCartError(
        `${removed.join(", ")} just sold out and ${removed.length === 1 ? "was" : "were"} removed from your bag.`,
      );
      return lines;
    });
  }, [menu]);

  useEffect(() => {
    if (menuStatus !== "ready" || !menu || cartRestored) return;
    try {
      const stored = window.sessionStorage.getItem(CART_STORAGE_KEY);
      if (stored) {
        const pending = parsePendingCart(JSON.parse(stored) as unknown, menu);
        if (pending.length) {
          setCart(pending);
          setCartOpen(true);
        }
        window.sessionStorage.removeItem(CART_STORAGE_KEY);
      }
    } catch {
      // Storage can be disabled; do not restore or submit an unverified cart.
    } finally {
      setCartRestored(true);
    }
  }, [cartRestored, menu, menuStatus]);

  const categories = useMemo(
    () => [ALL_DISHES, ...new Set(menu?.items.map((item) => item.category) ?? [])],
    [menu],
  );
  const filteredItems = useMemo(
    () =>
      (menu?.items ?? []).filter((item) => {
        const matchesCategory = category === ALL_DISHES || item.category === category;
        const matchesSearch = `${item.name} ${item.description}`
          .toLowerCase()
          .includes(search.toLowerCase());
        return matchesCategory && matchesSearch && (!vegetarianOnly || item.vegetarian);
      }),
    [category, menu, search, vegetarianOnly],
  );

  const quantity = cart.reduce((sum, line) => sum + line.quantity, 0);
  const cartTotalMinor = calculateCartTotalMinor(cart);
  const displayCurrency = menu?.currency ?? "INR";

  const canIncrease = (itemId: string) => {
    const line = cart.find((candidate) => candidate.item.id === itemId);
    return (
      quantity < MAX_ORDER_UNITS &&
      (line ? line.quantity < MAX_ITEM_QUANTITY : cart.length < MAX_ORDER_LINES)
    );
  };

  const changeCart = (item: MenuItem, change: number) => {
    setCart((current) => {
      const existing = current.find((line) => line.item.id === item.id);
      const currentUnits = current.reduce((sum, line) => sum + line.quantity, 0);
      if (
        change > 0 &&
        (currentUnits >= MAX_ORDER_UNITS ||
          (existing && existing.quantity >= MAX_ITEM_QUANTITY) ||
          (!existing && current.length >= MAX_ORDER_LINES))
      ) {
        return current;
      }
      if (!existing && change > 0) return [...current, { item, quantity: 1 }];
      if (!existing) return current;
      return current
        .map((line) =>
          line.item.id === item.id ? { ...line, quantity: line.quantity + change } : line,
        )
        .filter((line) => line.quantity > 0);
    });
  };

  const addItem = (item: MenuItem) => {
    if (!canIncrease(item.id)) {
      setCartError("Your bag reached the order limit. Remove an item to add something else.");
      setCartOpen(true);
      return;
    }
    setCartError("");
    changeCart(item, 1);
    setToast(`${item.name} added to your bag.`);
    window.setTimeout(() => setToast(""), 2600);
  };

  const quantityFor = (id: string) => cart.find((line) => line.item.id === id)?.quantity ?? 0;

  const saveCartAndSignIn = () => {
    if (!menu || cart.length === 0) return;
    try {
      window.sessionStorage.setItem(
        CART_STORAGE_KEY,
        JSON.stringify({
          restaurantId: menu.id,
          items: cart.map((line) => ({ menuItemId: line.item.id, quantity: line.quantity })),
        }),
      );
      router.push(`/login?next=${encodeURIComponent("/menu")}`);
    } catch {
      setCartError("Your bag could not be saved for sign-in. Please try again in this browser.");
    }
  };

  const placeOrder = async () => {
    setCartError("");
    setPlacedOrder(null);
    if (!menu || menuStatus !== "ready" || cart.length === 0) {
      setCartError("A live menu and at least one available item are required to place an order.");
      return;
    }
    if (cartTotalMinor === null) {
      setCartError(
        "This bag exceeds the supported safe total. Remove items before placing an order.",
      );
      return;
    }
    if (authLoading) {
      setCartError("Checking your sign-in status. Please try again in a moment.");
      return;
    }
    if (!user || !accessToken) {
      saveCartAndSignIn();
      return;
    }
    if (user.role !== "Customer") {
      setCartError("Place an order with a Customer account. Staff accounts cannot order here.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetchWithTimeout(`${API_BASE}/orders`, {
        method: "POST",
        credentials: "include",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          restaurantId: menu.id,
          items: cart.map((line) => ({ menuItemId: line.item.id, quantity: line.quantity })),
        }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const saved = parsePlacedOrder(await response.json());
      if (!saved) throw new Error("The order response was invalid; your bag has been kept.");
      setPlacedOrder(saved);
      setCart([]);
      setCartOpen(false);
      setToast(`Order placed with status ${saved.status}.`);
      window.setTimeout(() => setToast(""), 5000);
    } catch (error) {
      setCartError(
        error instanceof Error
          ? error.message
          : "Orders are unavailable. Your request was not confirmed.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="menu-page" id="main-content">
      <header className="menu-header">
        <Link className="menu-brand" href="/">
          <BrandMark />
          <span>DineSmart</span>
        </Link>
        <div className="menu-restaurant">
          <span className="menu-restaurant-mark">{menu?.name.slice(0, 1) ?? "S"}</span>
          <span>
            <strong>{menu?.name ?? "Restaurant menu"}</strong>
            <small>{menu?.currency ? `Prices in ${menu.currency}` : "Customer ordering"}</small>
          </span>
          <i className="menu-open-dot" />
        </div>
        <div className="menu-header-actions">
          <Link href="/orders" className="menu-back-link">
            Your orders
          </Link>
          <Link href="/" className="menu-back-link">
            Home
          </Link>
          <button
            type="button"
            className="menu-cart-button"
            onClick={() => {
              setCartError("");
              setCartOpen(true);
            }}
            aria-label={`Your bag, ${quantity} ${quantity === 1 ? "item" : "items"}`}
          >
            <MenuIcon name="bag" size={17} />
            <span>Your bag</span> <b>{quantity}</b>
          </button>
        </div>
      </header>

      <section className="menu-hero">
        <div className="menu-hero-copy">
          <div className="menu-eyebrow">
            <span /> MADE WITH CARE, SERVED WITH A SMILE
          </div>
          <h1>
            A good meal
            <br />
            starts <em>right here.</em>
          </h1>
          <p>South Indian favourites, a few new stories, and something warm for the road home.</p>
          <div className="menu-service-note">
            <MenuIcon name="clock" size={15} />
            <span>
              Browse what the restaurant is serving now. Availability is checked again at checkout.
            </span>
          </div>
        </div>
        <div className="menu-hero-art" aria-hidden="true">
          <div className="menu-art-sun" />
          <div className="menu-art-plate">
            <div className="menu-art-food menu-art-food-a" />
            <div className="menu-art-food menu-art-food-b" />
            <div className="menu-art-food menu-art-food-c" />
            <span>✦</span>
          </div>
          <div className="menu-art-copy">
            A little more
            <br />
            comfort, please.
          </div>
        </div>
      </section>

      <section className="menu-content">
        <div className="menu-section-heading">
          <div>
            <div className="menu-section-eyebrow">THE RESTAURANT MENU</div>
            <h2>Made for this moment.</h2>
          </div>
          <span className={`menu-preview-label menu-state-${menuStatus}`}>
            <i />
            {menuStatus === "ready"
              ? "LIVE MENU"
              : menuStatus === "loading"
                ? "LOADING"
                : "UNAVAILABLE"}
          </span>
        </div>
        {menuStatus === "ready" ? (
          <>
            <div className="menu-toolbar">
              <div className="menu-categories" role="tablist" aria-label="Menu categories">
                {categories.map((item, index) => (
                  <button
                    key={item}
                    id={tabId("menu-tab", item)}
                    className={category === item ? "menu-category-active" : ""}
                    type="button"
                    role="tab"
                    aria-selected={category === item}
                    aria-controls="menu-dishes"
                    tabIndex={category === item ? 0 : -1}
                    onClick={() => setCategory(item)}
                    onKeyDown={(event) => {
                      const next = tabIndexForKey(event.key, index, categories.length);
                      if (next === null) return;
                      event.preventDefault();
                      const target = categories[next];
                      if (!target) return;
                      setCategory(target);
                      document.getElementById(tabId("menu-tab", target))?.focus();
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <label className="menu-search">
                <MenuIcon name="search" size={16} />
                <span className="sr-only">Search the menu</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Find something good"
                />
              </label>
            </div>
            <div className="menu-filter-row">
              <button
                type="button"
                className={`veg-filter ${vegetarianOnly ? "veg-filter-active" : ""}`}
                aria-pressed={vegetarianOnly}
                onClick={() => setVegetarianOnly(!vegetarianOnly)}
              >
                <MenuIcon name="leaf" size={14} />
                <span>Vegetarian only</span>
                <i />
              </button>
              <span>
                {filteredItems.filter((item) => item.isAvailable).length} available dishes
              </span>
            </div>
            {filteredItems.length ? (
              <div
                className="menu-grid"
                id="menu-dishes"
                role="tabpanel"
                aria-labelledby={tabId("menu-tab", category)}
              >
                {filteredItems.map((item) => (
                  <article
                    className={`menu-item-card ${item.isAvailable ? "" : "menu-item-soldout"}`}
                    key={item.id}
                  >
                    <div className={`menu-item-art menu-art-${item.art}`} aria-hidden="true">
                      <div className="dish-plate">
                        <span className="dish-food" />
                        <i className="dish-garnish" />
                      </div>
                      {item.vegetarian ? (
                        <span className="menu-veg-dot" title="Vegetarian" />
                      ) : null}
                    </div>
                    <div className="menu-item-copy">
                      <div className="menu-item-meta">
                        <span>{item.category.toUpperCase()}</span>
                        {item.vegetarian ? (
                          <>
                            <span>·</span>
                            <span>VEGETARIAN</span>
                          </>
                        ) : null}
                      </div>
                      <div className="menu-item-title-row">
                        <h3>{item.name}</h3>
                        <strong>{currency(item.priceMinor, displayCurrency)}</strong>
                      </div>
                      <p>{item.description}</p>
                      {item.allergenLabels.length ? (
                        <p className="menu-allergens">Contains: {item.allergenLabels.join(", ")}</p>
                      ) : null}
                      <div className="menu-item-footer">
                        <span>
                          <MenuIcon name="clock" size={13} />{" "}
                          {item.isAvailable
                            ? "Availability checked at order time"
                            : "Sold out for now"}
                        </span>
                        {!item.isAvailable ? (
                          <span className="menu-soldout-badge">Sold out</span>
                        ) : quantityFor(item.id) ? (
                          <div className="menu-quantity-control">
                            <button
                              type="button"
                              aria-label={`Remove one ${item.name}`}
                              onClick={() => changeCart(item, -1)}
                            >
                              <MenuIcon name="minus" size={14} />
                            </button>
                            <strong>{quantityFor(item.id)}</strong>
                            <button
                              type="button"
                              aria-label={`Add one ${item.name}`}
                              disabled={!canIncrease(item.id)}
                              onClick={() => changeCart(item, 1)}
                            >
                              <MenuIcon name="plus" size={14} />
                            </button>
                          </div>
                        ) : (
                          <button
                            className="menu-add-button"
                            type="button"
                            disabled={!canIncrease(item.id)}
                            onClick={() => addItem(item)}
                          >
                            <MenuIcon name="plus" size={14} />
                            Add
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div
                className="menu-empty"
                id="menu-dishes"
                role="tabpanel"
                aria-labelledby={tabId("menu-tab", category)}
              >
                <span>
                  <MenuIcon name="search" size={22} />
                </span>
                <strong>
                  {menu?.items.length
                    ? "Nothing on the menu by that name."
                    : "No items are available right now."}
                </strong>
                <p>
                  {menu?.items.length
                    ? "Try another search or browse a different category."
                    : "Please check back with the restaurant later."}
                </p>
              </div>
            )}
            {menu?.truncated ? (
              <p className="menu-truncated-note" role="status">
                Showing the first 200 available items. Ask the restaurant for the full menu.
              </p>
            ) : null}
            <div className="menu-preview-foot">
              <span>
                <MenuIcon name="leaf" size={15} /> Prices and availability are confirmed when you
                place your order.
              </span>
              <span>Pre-bill subtotal only · No payment or tax capture</span>
            </div>
          </>
        ) : menuStatus === "loading" ? (
          <div className="menu-empty" role="status">
            <span>
              <MenuIcon name="clock" size={22} />
            </span>
            <strong>Checking today’s menu…</strong>
            <p>Only items returned by the restaurant can be ordered.</p>
          </div>
        ) : (
          <div className="menu-empty menu-unavailable" role="alert">
            <span>
              <MenuIcon name="clock" size={22} />
            </span>
            <strong>The live menu is unavailable.</strong>
            <p>{menuError} No preview items will be shown or submitted as an order.</p>
            <button
              className="menu-add-button"
              type="button"
              onClick={() => setReloadMenu((current) => current + 1)}
            >
              Try again
            </button>
          </div>
        )}
      </section>
      <footer className="menu-footer">
        <span>{menu?.name.toUpperCase() ?? "DINESMART"}</span>
        <span>© 2026 DineSmart</span>
        <Link href="/book">
          Save a table for later <MenuIcon name="arrow-right" size={13} />
        </Link>
      </footer>

      {quantity ? (
        <button className="menu-mobile-cart" type="button" onClick={() => setCartOpen(true)}>
          <span>
            <MenuIcon name="bag" size={16} /> View your bag
          </span>
          <strong>
            {quantity} {quantity === 1 ? "item" : "items"} ·{" "}
            {safeCurrency(cartTotalMinor, displayCurrency, "Subtotal unavailable")}
          </strong>
        </button>
      ) : null}
      {cartOpen ? (
        <div className="cart-overlay">
          <button
            className="cart-backdrop"
            type="button"
            aria-label="Close bag"
            onClick={() => setCartOpen(false)}
          />
          <aside
            ref={cartRef}
            className="cart-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cart-title"
          >
            <div className="cart-head">
              <div>
                <div className="menu-section-eyebrow">
                  {menu?.name.toUpperCase() ?? "YOUR ORDER"}
                </div>
                <h2 id="cart-title">
                  Your bag <span>{quantity}</span>
                </h2>
              </div>
              <button
                className="cart-close"
                type="button"
                aria-label="Close bag"
                onClick={() => setCartOpen(false)}
              >
                <MenuIcon name="close" size={18} />
              </button>
            </div>
            {cart.length ? (
              <>
                <div className="cart-lines">
                  {cart.map((line) => (
                    <div className="cart-line" key={line.item.id}>
                      <span className={`cart-line-art menu-art-${line.item.art}`}>
                        <span className="dish-food" />
                      </span>
                      <div className="cart-line-copy">
                        <strong>{line.item.name}</strong>
                        <span>
                          {currency(line.item.priceMinor, displayCurrency)} · {line.quantity} item
                          {line.quantity > 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="cart-line-actions">
                        <strong>
                          {safeCurrency(calculateCartTotalMinor([line]), displayCurrency)}
                        </strong>
                        <div className="menu-quantity-control">
                          <button
                            type="button"
                            aria-label={`Remove one ${line.item.name}`}
                            onClick={() => changeCart(line.item, -1)}
                          >
                            <MenuIcon name="minus" size={13} />
                          </button>
                          <span>{line.quantity}</span>
                          <button
                            type="button"
                            aria-label={`Add one ${line.item.name}`}
                            disabled={!canIncrease(line.item.id)}
                            onClick={() => changeCart(line.item, 1)}
                          >
                            <MenuIcon name="plus" size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="cart-summary">
                  <div>
                    <span>Estimated pre-bill subtotal</span>
                    <strong>
                      {safeCurrency(cartTotalMinor, displayCurrency, "Subtotal unavailable")}
                    </strong>
                  </div>
                  <div>
                    <span>Taxes &amp; payment</span>
                    <span>Not included</span>
                  </div>
                  {cartError ? (
                    <p className="cart-error" role="alert">
                      {cartError}
                    </p>
                  ) : cartTotalMinor === null ? (
                    <p className="cart-error" role="alert">
                      This bag exceeds the supported safe total. Remove items before checkout.
                    </p>
                  ) : null}
                  <button
                    className="menu-checkout-button"
                    type="button"
                    disabled={
                      submitting || menuStatus !== "ready" || authLoading || cartTotalMinor === null
                    }
                    onClick={() => void placeOrder()}
                  >
                    {submitting
                      ? "Sending order…"
                      : authLoading
                        ? "Checking sign-in…"
                        : user?.role === "Customer"
                          ? "Place order request"
                          : "Sign in to place order"}
                    <MenuIcon name="arrow-right" size={15} />
                  </button>
                  <p>
                    Restaurant prices are rechecked. This request does not take payment or confirm
                    acceptance.
                  </p>
                </div>
              </>
            ) : (
              <div className="cart-empty">
                <span>
                  <MenuIcon name="bag" size={24} />
                </span>
                <strong>A little room for something good.</strong>
                <p>Add an available item from the live menu to get started.</p>
                <button type="button" onClick={() => setCartOpen(false)}>
                  Browse the menu
                </button>
              </div>
            )}
          </aside>
        </div>
      ) : null}
      {toast ? (
        <div className="toast-message menu-toast" role="status">
          <div>{toast}</div>
          {placedOrder ? (
            <Link href="/orders">
              View order history <MenuIcon name="arrow-right" size={13} />
            </Link>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
