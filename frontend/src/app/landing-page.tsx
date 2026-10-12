import Link from "next/link";
import { BrandMark } from "./brand-mark";

function ArrowIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 12h15M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M7 3v3m10-3v3M4.5 9h15M6 5h12a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 18 20H6a1.5 1.5 0 0 1-1.5-1.5v-12A1.5 1.5 0 0 1 6 5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8 12h2m4 0h2m-8 4h2m4 0h2" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export default function LandingPage() {
  return (
    <main className="landing-page" id="main-content">
      <div className="landing-shell">
        <header className="landing-header">
          <Link className="customer-brand landing-brand" href="/" aria-label="DineSmart home">
            <BrandMark />
            <span>DineSmart</span>
          </Link>
          <nav className="landing-nav" aria-label="Explore DineSmart">
            <Link href="/menu">Menu</Link>
            <Link href="/book">Reservations</Link>
            <Link href="/login?next=%2Fdashboard">For restaurant teams</Link>
          </nav>
          <div className="landing-account-actions">
            <Link className="landing-login-link" href="/login">
              Sign in
            </Link>
            <Link className="landing-account-cta" href="/register">
              Create account
            </Link>
          </div>
        </header>

        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero-copy">
            <span className="landing-eyebrow">SAFFRON &amp; CO. · ADYAR, CHENNAI</span>
            <h1 id="landing-title">
              Good food.
              <br />
              <em>Good company.</em>
            </h1>
            <p>
              Find a new favourite, ask for a table, and keep your plans together from one welcoming
              place.
            </p>
            <div className="landing-hero-actions">
              <Link className="landing-button landing-button-dark" href="/menu">
                Explore the menu <ArrowIcon />
              </Link>
              <Link className="landing-button landing-button-light" href="/book">
                <CalendarIcon /> Request a table
              </Link>
            </div>
            <ul className="landing-promise-list">
              <li>
                <i aria-hidden="true">✓</i>
                <span>Current menu from the restaurant</span>
              </li>
              <li>
                <i aria-hidden="true">✓</i>
                <span>Clear reservation-request status</span>
              </li>
            </ul>
          </div>

          <div className="landing-art" aria-hidden="true">
            <div className="landing-art-sun" />
            <div className="landing-art-ring landing-art-ring-one" />
            <div className="landing-art-ring landing-art-ring-two" />
            <div className="landing-art-plate">
              <div className="landing-art-food landing-art-food-one" />
              <div className="landing-art-food landing-art-food-two" />
              <div className="landing-art-food landing-art-food-three" />
              <span className="landing-art-herb">✦</span>
            </div>
            <div className="landing-art-caption">
              <span>MADE FOR THE MOMENT</span>
              <strong>
                A little more
                <br />
                comfort, please.
              </strong>
            </div>
            <span className="landing-art-location">ADYAR · CHENNAI</span>
          </div>
        </section>

        <section className="landing-highlights" aria-labelledby="landing-highlights-title">
          <div className="landing-section-intro">
            <span className="landing-eyebrow">FROM FIRST LOOK TO FIRST BITE</span>
            <h2 id="landing-highlights-title">Make room for the good part.</h2>
            <p>Useful details, without the guesswork.</p>
          </div>
          <div className="landing-feature-grid">
            <article className="landing-feature-card">
              <span className="landing-feature-index">01 / THE MENU</span>
              <span className="landing-feature-mark landing-feature-mark-green" aria-hidden="true">
                ✦
              </span>
              <h3>See what’s available.</h3>
              <p>
                Browse the current restaurant menu, with prices and dietary details from the live
                catalogue.
              </p>
              <Link href="/menu">
                Browse the menu <ArrowIcon />
              </Link>
            </article>
            <article className="landing-feature-card">
              <span className="landing-feature-index">02 / YOUR TABLE</span>
              <span className="landing-feature-mark landing-feature-mark-coral" aria-hidden="true">
                <CalendarIcon />
              </span>
              <h3>Make a table request.</h3>
              <p>
                Send your preferred time and party size. A request is not a confirmed booking until
                the restaurant responds.
              </p>
              <Link href="/book">
                Request a table <ArrowIcon />
              </Link>
            </article>
            <article className="landing-feature-card">
              <span className="landing-feature-index">03 / YOUR ACCOUNT</span>
              <span className="landing-feature-mark landing-feature-mark-gold" aria-hidden="true">
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <h3>Keep your plans close.</h3>
              <p>
                Sign in to find your saved orders and reservations together in your customer
                account.
              </p>
              <Link href="/login">
                Visit your account <ArrowIcon />
              </Link>
            </article>
          </div>
        </section>

        <footer className="landing-footer">
          <Link className="customer-brand landing-brand" href="/" aria-label="DineSmart home">
            <BrandMark />
            <span>DineSmart</span>
          </Link>
          <span>Thoughtful service, in rhythm.</span>
          <div>
            <Link href="/menu">Explore the menu</Link>
            <Link href="/login?next=%2Fdashboard">Restaurant team sign in</Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
