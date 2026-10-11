"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth-provider";
import { BrandMark } from "../brand-mark";
import { formatMinorCurrency } from "../currency";

type MenuStatus = "loading" | "ready" | "error";

type Category = string;

interface MenuItem {
  id: string;
  name: string;
  description: string;
  priceMinor: number;
  category: Category;
  vegetarian: boolean;
  allergenLabels: string[];
  art: string;
}

interface RestaurantMenu {
  id: string;
  name: string;
  currency: string;
  items: MenuItem[];
  truncated: boolean;
}

interface CartLine {
  item: MenuItem;
  quantity: number;
}

interface PlacedOrder {
  id: string;
  status: string;
  totalMinor: number;
  currency: string;
}

const API_BASE = "/api/v1";
const RESTAURANT_ID = process.env.NEXT_PUBLIC_DEMO_RESTAURANT_ID ?? "710000000000000000000001";
const CART_STORAGE_KEY = "dinesmart.pending-order-cart.v1";
const MAX_ORDER_LINES = 20;
const MAX_ITEM_QUANTITY = 20;
const MAX_ORDER_UNITS = 50;
const ALL_DISHES = "All dishes";
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function artForItem(name: string): string {
  const normalized = name.toLowerCase();
  if (normalized.includes("dosa")) return normalized.includes("masala") ? "masala" : "dosa";
  if (normalized.includes("paneer") || normalized.includes("tikka")) return "tikka";
  if (normalized.includes("coffee")) return "coffee";
  if (normalized.includes("mango") || normalized.includes("lassi")) return "mango";
  if (normalized.includes("okra")) return "okra";
  if (normalized.includes("rasam")) return "rasam";
  return "rice";
}

function parseMenu(value: unknown): RestaurantMenu | null {
  if (!isRecord(value) || !isRecord(value.restaurant) || !Array.isArray(value.items)) return null;
  const restaurant = value.restaurant;
  if (
    typeof restaurant.id !== "string" ||
    !OBJECT_ID_PATTERN.test(restaurant.id) ||
    typeof restaurant.name !== "string" ||
    !restaurant.name.trim() ||
    typeof restaurant.currency !== "string" ||
    !/^[A-Z]{3}$/.test(restaurant.currency) ||
    typeof value.truncated !== "boolean"
  ) {
    return null;
  }

  const items: MenuItem[] = [];
  for (const entry of value.items) {
    if (
      !isRecord(entry) ||
      typeof entry.id !== "string" ||
      !OBJECT_ID_PATTERN.test(entry.id) ||
      typeof entry.name !== "string" ||
      !entry.name.trim() ||
      typeof entry.category !== "string" ||
      !entry.category.trim() ||
      typeof entry.priceMinor !== "number" ||
      !Number.isSafeInteger(entry.priceMinor) ||
      entry.priceMinor <= 0 ||
      (entry.description !== undefined && typeof entry.description !== "string") ||
      !Array.isArray(entry.dietaryLabels) ||
      !entry.dietaryLabels.every((label) => typeof label === "string") ||
      !Array.isArray(entry.allergenLabels) ||
      !entry.allergenLabels.every((label) => typeof label === "string")
    ) {
      return null;
    }
    items.push({
      id: entry.id,
      name: entry.name,
      description:
        typeof entry.description === "string" && entry.description.trim()
          ? entry.description
          : "Prepared fresh by the kitchen.",
      priceMinor: entry.priceMinor,
      category: entry.category,
      vegetarian: entry.dietaryLabels.some((label) => label.toLowerCase() === "vegetarian"),
      allergenLabels: entry.allergenLabels,
      art: artForItem(entry.name),
    });
  }

  return {
    id: restaurant.id,
    name: restaurant.name,
    currency: restaurant.currency,
    items,
    truncated: value.truncated,
  };
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

function parsePendingCart(value: unknown, menu: RestaurantMenu): CartLine[] {
  if (
    !isRecord(value) ||
    value.restaurantId !== menu.id ||
    !Array.isArray(value.items) ||
    value.items.length > MAX_ORDER_LINES
  ) {
    return [];
  }
  const lines: CartLine[] = [];
  let totalUnits = 0;
  for (const entry of value.items) {
    if (
      !isRecord(entry) ||
      typeof entry.menuItemId !== "string" ||
      !Number.isInteger(entry.quantity) ||
      (entry.quantity as number) < 1 ||
      (entry.quantity as number) > MAX_ITEM_QUANTITY
    ) {
      return [];
    }
    const item = menu.items.find((candidate) => candidate.id === entry.menuItemId);
    if (!item || lines.some((line) => line.item.id === item.id)) return [];
    totalUnits += entry.quantity as number;
    if (totalUnits > MAX_ORDER_UNITS) return [];
    lines.push({ item, quantity: entry.quantity as number });
  }
  return lines;
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
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24">
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
        const response = await fetch(`${API_BASE}/menu?${query.toString()}`, {
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
  const cartTotalMinor = cart.reduce((sum, line) => sum + line.item.priceMinor * line.quantity, 0);
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
      const response = await fetch(`${API_BASE}/orders`, {
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
            Workspace
          </Link>
          <button
            type="button"
            className="menu-cart-button"
            onClick={() => {
              setCartError("");
              setCartOpen(true);
            }}
            aria-label={`Open bag, ${quantity} ${quantity === 1 ? "item" : "items"}`}
          >
            <MenuIcon name="bag" size={17} />
            <span>Your bag</span>
            <b>{quantity}</b>
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
                {categories.map((item) => (
                  <button
                    key={item}
                    className={category === item ? "menu-category-active" : ""}
                    type="button"
                    role="tab"
                    aria-selected={category === item}
                    onClick={() => setCategory(item)}
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
              <span>{filteredItems.length} available dishes</span>
            </div>
            {filteredItems.length ? (
              <div className="menu-grid">
                {filteredItems.map((item) => (
                  <article className="menu-item-card" key={item.id}>
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
                          <MenuIcon name="clock" size={13} /> Availability checked at order time
                        </span>
                        {quantityFor(item.id) ? (
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
              <div className="menu-empty">
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
            {currency(cartTotalMinor, displayCurrency)}
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
                          {currency(line.item.priceMinor * line.quantity, displayCurrency)}
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
                    <strong>{currency(cartTotalMinor, displayCurrency)}</strong>
                  </div>
                  <div>
                    <span>Taxes &amp; payment</span>
                    <span>Not included</span>
                  </div>
                  {cartError ? (
                    <p className="cart-error" role="alert">
                      {cartError}
                    </p>
                  ) : null}
                  <button
                    className="menu-checkout-button"
                    type="button"
                    disabled={submitting || menuStatus !== "ready" || authLoading}
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
