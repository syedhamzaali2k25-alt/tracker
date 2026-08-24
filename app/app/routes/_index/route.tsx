import { useEffect, useRef } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, Link, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

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

const STEPS = [
  {
    icon: SyncIcon,
    title: "Sync your catalogue",
    body: "Pulls every product's cost, price, and the last 30 days of sales straight from Shopify. Nothing in your store changes; this step only reads.",
  },
  {
    icon: SheetIcon,
    title: "Review the numbers",
    body: "Everything lands in a Google Sheet in your own Drive: cost, price, margin, and exactly which products are selling below cost. Type a new price or cost anywhere you want to fix it.",
  },
  {
    icon: PushIcon,
    title: "Push it back, safely",
    body: "See exactly what will change, including anything that would still land below cost, before you confirm. Every push is logged, so you can undo it later.",
  },
];

function LedgerCard({ className }: { className?: string }) {
  return (
    <div className={`${styles.ledgerCard} ${className ?? ""}`} aria-hidden="true">
      <p className={styles.ledgerLabel}>Sample sync result</p>
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
        You&apos;re losing <strong>$340</strong> in the last 30 days on 2 products.
      </p>
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
        Log in
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
          <img src="/logo.svg" alt="" className={styles.logoMark} />
          <span className={styles.wordmark}>Margin Tracker</span>
        </Link>
        <Link to="/privacy" className={styles.topbarLink}>
          Privacy
        </Link>
      </header>

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
            costs, and push them back to Shopify with a clear before/after preview and one-click undo.
          </p>
          {showForm && (
            <div className={styles.heroForm}>
              <LoginForm />
            </div>
          )}
        </div>
        <LedgerCard className={styles.heroCard} />
      </section>

      <section className={styles.steps} aria-label="How Margin Tracker works">
        <p className={styles.sectionEyebrow}>How it works</p>
        <h2 className={styles.sectionHeading}>Three steps, in order, every time you run it.</h2>
        <ol className={styles.stepList}>
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <li key={step.title} className={styles.stepCard} data-reveal style={{ transitionDelay: `${index * 90}ms` }}>
                <span className={styles.stepNumber}>{String(index + 1).padStart(2, "0")}</span>
                <span className={styles.stepIcon}>
                  <Icon />
                </span>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.stepBody}>{step.body}</p>
              </li>
            );
          })}
        </ol>
      </section>

      {showForm && (
        <section className={styles.cta} data-reveal>
          <h2 className={styles.ctaHeading}>See what it&apos;s costing you.</h2>
          <p className={styles.ctaText}>
            Log in with your shop domain to connect your store. Nothing is written back to Shopify until
            you review and confirm it.
          </p>
          <LoginForm compact />
        </section>
      )}

      <footer className={styles.footer}>
        <span>Margin Tracker</span>
        <Link to="/privacy">Privacy policy</Link>
      </footer>
    </div>
  );
}
