import { useEffect, useRef } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect, Form, Link, useLoaderData } from "react-router";

import { login } from "../../shopify.server";
import { SUBSCRIPTION_PRICE, SUBSCRIPTION_TRIAL_DAYS } from "../../billing-plan";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export const meta: MetaFunction = () => [
  { title: "Margin Tracker: catch products selling below cost on Shopify" },
  {
    name: "description",
    content:
      "Margin Tracker checks every product's cost against its price and recent sales, reports the results in a Google Sheet in your own Drive, and lets you push fixes back to Shopify with a preview and one-click undo.",
  },
];

/**
 * There is no live Shopify App Store listing yet: shopify.app.toml has
 * never been linked to a real Partner Dashboard app (client_id is still
 * blank). Every "install" call to action on this page points at the same
 * on-page connect form instead of a guessed apps.shopify.com URL, so the
 * button always leads somewhere real. Swap this for the real listing URL
 * once one exists.
 */
const CONNECT_ANCHOR = "#connect";

/**
 * No dedicated support inbox exists yet either. Rather than publish an
 * address nobody's monitoring, Support links to the privacy policy's own
 * Questions section, which is honest about that.
 */
const SUPPORT_HREF = "/privacy#questions";

/**
 * Arms scroll-triggered reveals on mount, but only when JS runs and the
 * visitor hasn't asked for reduced motion — CSS defaults every [data-reveal]
 * element to fully visible, so no-JS and reduced-motion visitors never see
 * hidden content that depends on a script to appear.
 */
function useScrollReveal() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const targets = container.querySelectorAll("[data-reveal]");
    container.classList.add(styles.revealArmed!);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.revealVisible!);
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.2, rootMargin: "0px 0px -40px 0px" },
    );
    targets.forEach((target) => observer.observe(target));

    return () => observer.disconnect();
  }, []);

  return containerRef;
}

function SyncIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M8 12a8 8 0 0 1 14-5.3M24 20a8 8 0 0 1-14 5.3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M22 4v4h-4M10 28v-4h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SheetIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="5" y="6" width="22" height="20" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M5 13h22M5 20h22M14 6v20" stroke="currentColor" strokeWidth="2" />
      <rect x="16" y="14" width="9" height="6" fill="currentColor" opacity="0.18" />
    </svg>
  );
}

function PushIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M6 17.5 12.5 24 26 8"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M16 8v8l6 3.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.5 12A9.5 9.5 0 1 1 6 17"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M6 9v5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="4" y="8" width="24" height="17" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M5 9.5 16 18l11-8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8.5 6.3 12 13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const PILLARS = [
  {
    icon: SyncIcon,
    title: "Sync & Diagnose",
    body: "Pulls every product's cost, price, and the last 30 days of sales straight from Shopify, and flags anything selling below cost or at a thin margin automatically.",
  },
  {
    icon: SheetIcon,
    title: "Your Own Google Sheet",
    body: "Results land in a spreadsheet in your own Google Drive, not a shared one. Fully editable: type a new price or cost right there, next to the numbers that flagged it.",
  },
  {
    icon: PushIcon,
    title: "Push, Preview, Undo",
    body: "See exactly what's about to change, including anything that would still land below cost, before you confirm it. Push to Shopify with one click, and undo any push later if something looks wrong.",
  },
];

const FREE_FEATURES = ["Sync from Shopify", "Full dashboard", "Your own Google Sheet, fully editable"];

const PAID_FEATURES = [
  "Everything in Free",
  "Push changes back to Shopify",
  "Full history of every push",
  "One-click Undo",
  "Weekly email alert (coming soon)",
];

const FAQ_ITEMS = [
  {
    question: "How does this connect to my store?",
    answer:
      "You install it like any Shopify app: log in with your store's domain, and Shopify asks you to approve the specific permissions it needs, reading products, inventory, and orders, and writing product price and inventory only when you push a change. Nothing is written back to Shopify until you explicitly confirm a push.",
  },
  {
    question: "Where does my data live?",
    answer:
      "Diagnostic results and any price or cost edits you make go into a Google Sheet created in your own Google Drive, not a shared one, using Google's drive.file permission, which only gives the app access to the one file it created. Your Shopify access token and Google refresh token are encrypted at rest and never sent to your browser.",
  },
  {
    question: "What happens if I uninstall?",
    answer:
      "Uninstalling deletes your store's session, cached diagnostic results, Google connection, push history, and email settings from our database. Shopify also sends a backstop webhook roughly two days later, which we handle the same way in case anything was missed.",
  },
  {
    question: "Is my Google Sheet private?",
    answer:
      "Yes. It lives in your own Drive, not ours, and the app can only see the one spreadsheet it created there. We never request broader access to your Drive or your other files.",
  },
  {
    question: "Can I undo a mistake?",
    answer:
      "Yes. Every push is saved to the History page along with the previous price and cost for each variant that changed. Click Undo on any past push to restore those values.",
  },
  {
    question: "Does this change prices automatically without me approving?",
    answer:
      "No. A sync only reads data from Shopify; it never writes anything on its own. You review and edit numbers in the Google Sheet yourself, and pushing shows you a preview of every change, including anything that would land below cost, before you confirm it.",
  },
];

function LedgerCard({ className }: { className?: string }) {
  return (
    <div className={`${styles.ledgerCard} ${className ?? ""}`} aria-hidden="true">
      <p className={styles.ledgerLabel}>Illustrative example, not a real store&apos;s data</p>
      <div className={styles.ledgerTable}>
        <div className={`${styles.ledgerRow} ${styles.ledgerHead}`}>
          <span>Product</span>
          <span>Price</span>
          <span>Cost</span>
          <span>Margin</span>
        </div>
        <div className={`${styles.ledgerRow} ${styles.ledgerBad}`}>
          <span>Ceramic Mug</span>
          <span>$18.00</span>
          <span>$21.50</span>
          <span>&minus;16%</span>
        </div>
        <div className={styles.ledgerRow}>
          <span>Canvas Tote</span>
          <span>$24.00</span>
          <span>$9.00</span>
          <span>+62%</span>
        </div>
        <div className={`${styles.ledgerRow} ${styles.ledgerBad}`}>
          <span>Wool Scarf</span>
          <span>$32.00</span>
          <span>$34.00</span>
          <span>&minus;6%</span>
        </div>
        <div className={styles.ledgerRow}>
          <span>Steel Flask</span>
          <span>$28.00</span>
          <span>$11.00</span>
          <span>+61%</span>
        </div>
      </div>
      <p className={styles.ledgerStamp}>
        Two products here are selling below cost. Margin Tracker would have flagged both the moment they
        crossed.
      </p>
    </div>
  );
}

function MarginMeter() {
  const rows = [
    { name: "Ceramic Mug", pct: -16, bad: true },
    { name: "Wool Scarf", pct: -6, bad: true },
    { name: "Canvas Tote", pct: 62, bad: false },
    { name: "Steel Flask", pct: 61, bad: false },
  ];
  return (
    <div className={styles.meterCard} aria-hidden="true">
      <p className={styles.miniCardLabel}>Illustrative example, margin by product</p>
      <div className={styles.meterList}>
        {rows.map((row) => (
          <div className={styles.meterRow} key={row.name}>
            <span className={styles.meterName}>{row.name}</span>
            <div className={styles.meterTrack}>
              <div
                className={`${styles.meterFill} ${row.bad ? styles.meterFillBad : styles.meterFillGood}`}
                style={{ width: `${Math.min(Math.abs(row.pct), 70)}%` }}
              />
            </div>
            <span className={`${styles.meterPct} ${row.bad ? styles.meterPctBad : styles.meterPctGood}`}>
              {row.pct > 0 ? "+" : ""}
              {row.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryTimeline() {
  const batches = [
    { label: "14 changes pushed", when: "2 days ago", status: "Applied" as const },
    { label: "6 changes pushed", when: "9 days ago", status: "Reverted" as const },
    { label: "21 changes pushed", when: "16 days ago", status: "Applied" as const },
  ];
  return (
    <div className={styles.historyCard} aria-hidden="true">
      <div className={styles.emailHeader}>
        <span className={styles.emailIcon}>
          <HistoryIcon />
        </span>
        <span>Push history</span>
      </div>
      <p className={styles.miniCardLabel}>Illustrative example, not a real store&apos;s data</p>
      <ul className={styles.timeline}>
        {batches.map((batch) => (
          <li className={styles.timelineRow} key={batch.label}>
            <span
              className={`${styles.timelineDot} ${batch.status === "Reverted" ? styles.timelineDotReverted : ""}`}
            />
            <div className={styles.timelineText}>
              <strong>{batch.label}</strong>
              <span>{batch.when}</span>
            </div>
            <span
              className={`${styles.timelineBadge} ${batch.status === "Reverted" ? styles.timelineBadgeReverted : ""}`}
            >
              {batch.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmailPreview() {
  return (
    <div className={styles.emailCard} aria-hidden="true">
      <div className={styles.emailHeader}>
        <span className={styles.emailIcon}>
          <MailIcon />
        </span>
        <span>Weekly margin alert</span>
        <span className={styles.comingSoonBadge}>Coming soon</span>
      </div>
      <div className={styles.emailBody}>
        <p className={styles.emailLine}>
          <strong>2 products</strong> newly dropped below cost this week.
        </p>
        <p className={styles.emailLine}>
          <strong>1 product</strong> newly crossed under your margin threshold.
        </p>
      </div>
    </div>
  );
}

function LoginForm({ compact }: { compact?: boolean }) {
  return (
    <Form
      className={`${styles.form} ${compact ? styles.formCompact : ""}`}
      method="post"
      action="/auth/login"
    >
      <label className={styles.label}>
        <span>Shop domain</span>
        <input
          className={styles.input}
          type="text"
          name="shop"
          placeholder="my-shop-domain.myshopify.com"
        />
      </label>
      <button className={styles.button} type="submit">
        Connect your store
      </button>
    </Form>
  );
}

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();
  const revealRef = useScrollReveal();

  return (
    <div className={styles.page} ref={revealRef}>
      <header className={styles.topbar}>
        <Link to="/" className={styles.logo}>
          <img src="/logo.png" alt="Margin Tracker" className={styles.logoMarkWrap} />
        </Link>
        <nav className={styles.navLinks} aria-label="Page sections">
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </nav>
        <a className={styles.navCta} href={CONNECT_ANCHOR}>
          Install on Shopify
        </a>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.heroText}>
            <p className={styles.eyebrow}>For Shopify merchants</p>
            <h1 className={styles.heading}>
              Some of your products are quietly <span className={styles.headingLoss}>losing money</span> on
              every sale.
            </h1>
            <p className={styles.text}>
              Margin Tracker checks every product&apos;s cost against its price and recent sales, then
              builds a report in a Google Sheet in your own Drive, not a shared one. Type in new prices or
              costs, and push them back to Shopify with a clear preview and one-click undo.
            </p>
            <a className={styles.heroCta} href={CONNECT_ANCHOR}>
              Connect your store
            </a>
          </div>
          <LedgerCard className={styles.heroCard} />
        </section>

        <section className={styles.features} id="features" aria-label="What Margin Tracker does">
          <p className={styles.sectionEyebrow}>What it does</p>
          <h2 className={styles.sectionHeading}>Three pieces, working together.</h2>
          <ul className={styles.pillarList}>
            {PILLARS.map((pillar, index) => {
              const Icon = pillar.icon;
              return (
                <li
                  key={pillar.title}
                  className={styles.pillarCard}
                  data-reveal
                  style={{ transitionDelay: `${index * 90}ms` }}
                >
                  <span className={styles.pillarIcon}>
                    <Icon />
                  </span>
                  <h3 className={styles.pillarTitle}>{pillar.title}</h3>
                  <p className={styles.pillarBody}>{pillar.body}</p>
                </li>
              );
            })}
          </ul>
        </section>

        <section className={styles.detailSection} aria-label="A closer look">
          <div className={styles.detailRow} data-reveal>
            <div className={styles.detailIllustration}>
              <MarginMeter />
            </div>
            <div className={styles.detailText}>
              <p className={styles.sectionEyebrow}>See problems before they cost you</p>
              <h3 className={styles.detailHeading}>Know exactly which products are underpriced</h3>
              <p className={styles.detailBody}>
                Every sync checks each product&apos;s price against its cost and flags anything selling
                below cost or under your margin threshold. It shows up right next to the product, not
                buried in a spreadsheet full of unrelated numbers.
              </p>
            </div>
          </div>

          <div className={`${styles.detailRow} ${styles.detailRowReverse}`} data-reveal>
            <div className={styles.detailIllustration}>
              <HistoryTimeline />
            </div>
            <div className={styles.detailText}>
              <p className={styles.sectionEyebrow}>A safety net for every push</p>
              <h3 className={styles.detailHeading}>Every push is logged, and reversible</h3>
              <p className={styles.detailBody}>
                Each time you push changes to Shopify, Margin Tracker saves the previous price and cost for
                every variant that changed. The History page lists every past push. If something looks
                wrong, click Undo and it restores exactly what was there before.
              </p>
            </div>
          </div>

          <div className={styles.detailRow} data-reveal>
            <div className={styles.detailIllustration}>
              <EmailPreview />
            </div>
            <div className={styles.detailText}>
              <p className={styles.sectionEyebrow}>A nudge before it adds up</p>
              <h3 className={styles.detailHeading}>Weekly email alerts, still rolling out</h3>
              <p className={styles.detailBody}>
                Turn this on and Margin Tracker checks in on its own schedule, emailing you only when a
                product newly drops below cost or under your margin threshold, not a full re-report every
                week. This feature is still rolling out and isn&apos;t live for every shop yet.
              </p>
            </div>
          </div>
        </section>

        <section className={styles.pricing} id="pricing" aria-label="Pricing">
          <p className={styles.sectionEyebrow}>Pricing</p>
          <h2 className={styles.sectionHeading}>Simple, and honest about what&apos;s free.</h2>
          <p className={styles.pricingSubhead}>
            Sync, the full dashboard, and your Google Sheet are free for as long as you use the app.
          </p>
          <div className={styles.pricingGrid}>
            <div className={styles.priceCard} data-reveal>
              <h3 className={styles.priceCardTitle}>Free</h3>
              <p className={styles.priceCardPrice}>
                $0<span className={styles.priceCardPeriod}>/month</span>
              </p>
              <ul className={styles.priceCardFeatures}>
                {FREE_FEATURES.map((feature) => (
                  <li key={feature}>
                    <CheckIcon />
                    {feature}
                  </li>
                ))}
              </ul>
              <a className={styles.priceCardCta} href={CONNECT_ANCHOR}>
                Get started
              </a>
            </div>
            <div className={`${styles.priceCard} ${styles.priceCardHighlight}`} data-reveal>
              <h3 className={styles.priceCardTitle}>Margin Tracker</h3>
              <p className={styles.priceCardPrice}>
                ${SUBSCRIPTION_PRICE}
                <span className={styles.priceCardPeriod}>/month</span>
              </p>
              <p className={styles.priceCardTrial}>after a {SUBSCRIPTION_TRIAL_DAYS}-day free trial</p>
              <ul className={styles.priceCardFeatures}>
                {PAID_FEATURES.map((feature) => (
                  <li key={feature}>
                    <CheckIcon />
                    {feature}
                  </li>
                ))}
              </ul>
              <a className={`${styles.priceCardCta} ${styles.priceCardCtaPrimary}`} href={CONNECT_ANCHOR}>
                Start free trial
              </a>
            </div>
          </div>
        </section>

        <section className={styles.faq} id="faq" aria-label="Frequently asked questions">
          <p className={styles.sectionEyebrow}>FAQ</p>
          <h2 className={styles.sectionHeading}>Questions merchants actually ask.</h2>
          <div className={styles.faqList}>
            {FAQ_ITEMS.map((item) => (
              <details className={styles.faqItem} key={item.question}>
                <summary className={styles.faqQuestion}>{item.question}</summary>
                <p className={styles.faqAnswer}>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        {showForm && (
          <section className={styles.cta} id="connect" data-reveal>
            <h2 className={styles.ctaHeading}>Connect your store.</h2>
            <p className={styles.ctaText}>
              Log in with your shop domain to connect Margin Tracker. Nothing is written back to Shopify
              until you review and confirm it, and Push, History, and Undo start after a{" "}
              {SUBSCRIPTION_TRIAL_DAYS}-day free trial.
            </p>
            <LoginForm compact />
          </section>
        )}
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <img src="/logo.png" alt="Margin Tracker" className={styles.logoMarkWrap} />
        </div>
        <div className={styles.footerLinks}>
          <Link to="/privacy">Privacy policy</Link>
          <a href={SUPPORT_HREF}>Support</a>
        </div>
        <p className={styles.footerCopyright}>© {new Date().getFullYear()} Margin Tracker</p>
      </footer>
    </div>
  );
}
