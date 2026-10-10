"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BrandMark } from "../brand-mark";

type Category = "Tiffin" | "Plates" | "Sides" | "Drinks";

interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: Category;
  vegetarian: boolean;
  popular?: boolean;
  art: string;
}

interface CartLine {
  item: MenuItem;
  quantity: number;
}

const MENU: MenuItem[] = [
  {
    id: "podi-dosa",
    name: "Podi ghee dosa",
    description: "Golden crisp dosa, house podi, a little cultured ghee.",
    price: 285,
    category: "Tiffin",
    vegetarian: true,
    popular: true,
    art: "dosa",
  },
  {
    id: "paneer-tikka",
    name: "Paneer tikka",
    description: "Charred cottage cheese, mint chutney, pickled onion.",
    price: 365,
    category: "Plates",
    vegetarian: true,
    popular: true,
    art: "tikka",
  },
  {
    id: "lemon-rice",
    name: "Lemon rice bowl",
    description: "Bright lemon rice, roasted peanuts, crisp curry leaves.",
    price: 245,
    category: "Plates",
    vegetarian: true,
    art: "rice",
  },
  {
    id: "filter-coffee",
    name: "Saffron filter coffee",
    description: "Slow-pulled decoction, warm milk, just the right foam.",
    price: 95,
    category: "Drinks",
    vegetarian: true,
    popular: true,
    art: "coffee",
  },
  {
    id: "crispy-okra",
    name: "Crispy okra",
    description: "Lightly spiced, crisp at the edges, made for sharing.",
    price: 210,
    category: "Sides",
    vegetarian: true,
    art: "okra",
  },
  {
    id: "masala-dosa",
    name: "Classic masala dosa",
    description: "Potato masala tucked inside a buttery golden dosa.",
    price: 260,
    category: "Tiffin",
    vegetarian: true,
    art: "masala",
  },
  {
    id: "mango-lassi",
    name: "Seasonal mango lassi",
    description: "Thick, cool, and made with Alphonso mango.",
    price: 175,
    category: "Drinks",
    vegetarian: true,
    art: "mango",
  },
  {
    id: "rasam-rice",
    name: "Pepper rasam rice",
    description: "Slow-simmered tomato rasam, pepper, steamed rice.",
    price: 230,
    category: "Plates",
    vegetarian: true,
    art: "rasam",
  },
];

const CATEGORIES = ["All dishes", "Tiffin", "Plates", "Sides", "Drinks"] as const;

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
    close: (
      <>
        <path d="m6 6 12 12M18 6 6 18" {...common} />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" {...common} />,
    minus: <path d="M5 12h14" {...common} />,
    "arrow-right": (
      <>
        <path d="M4 12h15M13 6l6 6-6 6" {...common} />
      </>
    ),
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

function currency(value: number): string {
  return `₹${value.toLocaleString("en-IN")}`;
}

export default function MenuPage() {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All dishes");
  const [search, setSearch] = useState("");
  const [vegetarianOnly, setVegetarianOnly] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [toast, setToast] = useState("");

  const items = useMemo(
    () =>
      MENU.filter((item) => {
        const matchesCategory = category === "All dishes" || item.category === category;
        const matchesSearch = `${item.name} ${item.description}`
          .toLowerCase()
          .includes(search.toLowerCase());
        return matchesCategory && matchesSearch && (!vegetarianOnly || item.vegetarian);
      }),
    [category, search, vegetarianOnly],
  );

  const quantity = cart.reduce((sum, line) => sum + line.quantity, 0);
  const total = cart.reduce((sum, line) => sum + line.item.price * line.quantity, 0);

  const changeCart = (item: MenuItem, change: number) => {
    setCart((current) => {
      const existing = current.find((line) => line.item.id === item.id);
      if (!existing && change > 0) return [...current, { item, quantity: 1 }];
      return current
        .map((line) =>
          line.item.id === item.id ? { ...line, quantity: line.quantity + change } : line,
        )
        .filter((line) => line.quantity > 0);
    });
  };

  const addItem = (item: MenuItem) => {
    changeCart(item, 1);
    setToast(`${item.name} added to your bag.`);
    window.setTimeout(() => setToast(""), 2600);
  };

  const quantityFor = (id: string) => cart.find((line) => line.item.id === id)?.quantity ?? 0;

  return (
    <main className="menu-page" id="main-content">
      <header className="menu-header">
        <Link className="menu-brand" href="/">
          <BrandMark />
          <span>DineSmart</span>
        </Link>
        <div className="menu-restaurant">
          <span className="menu-restaurant-mark">S</span>
          <span>
            <strong>Saffron &amp; Co.</strong>
            <small>Adyar · Chennai</small>
          </span>
          <i className="menu-open-dot" />
        </div>
        <div className="menu-header-actions">
          <Link href="/" className="menu-back-link">
            Workspace
          </Link>
          <button type="button" className="menu-cart-button" onClick={() => setCartOpen(true)}>
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
              Today’s menu · Dinner service · <strong>Ready in about 20–30 min</strong>
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
            <div className="menu-section-eyebrow">THE SAFFRON TABLE</div>
            <h2>Made for this moment.</h2>
          </div>
          <span className="menu-preview-label">
            <i /> PREVIEW MENU
          </span>
        </div>
        <div className="menu-toolbar">
          <div className="menu-categories" role="tablist" aria-label="Menu categories">
            {CATEGORIES.map((item) => (
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
            onClick={() => setVegetarianOnly(!vegetarianOnly)}
          >
            <MenuIcon name="leaf" size={14} />
            <span>Vegetarian only</span>
            <i />
          </button>
          <span>{items.length} dishes, prepared fresh</span>
        </div>
        {items.length ? (
          <div className="menu-grid">
            {items.map((item) => (
              <article className="menu-item-card" key={item.id}>
                <div className={`menu-item-art menu-art-${item.art}`} aria-hidden="true">
                  <div className="dish-plate">
                    <span className="dish-food" />
                    <i className="dish-garnish" />
                  </div>
                  {item.popular ? <span className="menu-popular">GUEST FAVOURITE</span> : null}
                  <span className="menu-veg-dot" title="Vegetarian" />
                </div>
                <div className="menu-item-copy">
                  <div className="menu-item-meta">
                    <span>{item.category.toUpperCase()}</span>
                    <span>·</span>
                    <span>VEGETARIAN</span>
                  </div>
                  <div className="menu-item-title-row">
                    <h3>{item.name}</h3>
                    <strong>{currency(item.price)}</strong>
                  </div>
                  <p>{item.description}</p>
                  <div className="menu-item-footer">
                    <span>
                      <MenuIcon name="clock" size={13} /> 15–20 min
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
                          onClick={() => changeCart(item, 1)}
                        >
                          <MenuIcon name="plus" size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        className="menu-add-button"
                        type="button"
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
            <strong>Nothing on the menu by that name.</strong>
            <p>Try another search or browse a different category.</p>
          </div>
        )}
        <div className="menu-preview-foot">
          <span>
            <MenuIcon name="leaf" size={15} /> Made fresh, with ingredients we’re proud of.
          </span>
          <span>Illustrative menu · Prices shown in INR</span>
        </div>
      </section>
      <footer className="menu-footer">
        <span>SAFFRON &amp; CO. · ADYAR</span>
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
            {quantity} items · {currency(total)}
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
                <div className="menu-section-eyebrow">SAFFRON &amp; CO.</div>
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
                          {currency(line.item.price)} · {line.quantity} item
                          {line.quantity > 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="cart-line-actions">
                        <strong>{currency(line.item.price * line.quantity)}</strong>
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
                    <span>Subtotal</span>
                    <strong>{currency(total)}</strong>
                  </div>
                  <div>
                    <span>Taxes &amp; service</span>
                    <span>Calculated at checkout</span>
                  </div>
                  <button
                    className="menu-checkout-button"
                    type="button"
                    onClick={() => {
                      setCartOpen(false);
                      setToast("Your preview bag is ready. Online checkout is not connected yet.");
                      window.setTimeout(() => setToast(""), 3200);
                    }}
                  >
                    Continue to checkout <MenuIcon name="arrow-right" size={15} />
                  </button>
                  <p>Preview only · Your order won’t be sent to the restaurant.</p>
                </div>
              </>
            ) : (
              <div className="cart-empty">
                <span>
                  <MenuIcon name="bag" size={24} />
                </span>
                <strong>A little room for something good.</strong>
                <p>Add a favourite from the menu to get started.</p>
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
          {toast}
        </div>
      ) : null}
    </main>
  );
}
