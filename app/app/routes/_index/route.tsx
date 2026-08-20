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

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.page}>
      <main className={styles.hero}>
        <p className={styles.eyebrow}>Margin Tracker</p>
        <h1 className={styles.heading}>
          Some of your products are probably selling at a loss — and right
          now, you don&apos;t know which ones.
        </h1>
        <p className={styles.text}>
          Margin Tracker checks every product&apos;s cost against its price
          and recent sales, then builds a report in a Google Sheet in your
          own Drive — not a shared one. Type in new prices or costs, and
          push them back to Shopify with a clear before/after preview and
          one-click undo if anything looks wrong.
        </p>

        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
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
        )}
      </main>

      <section className={styles.features} aria-label="What Margin Tracker does">
        <div className={styles.feature}>
          <h2>Find what&apos;s losing money</h2>
          <p>
            Syncs product costs, prices, and the last 30 days of sales
            straight from Shopify, then flags anything selling below cost
            or under your margin threshold.
          </p>
        </div>
        <div className={styles.feature}>
          <h2>Review it in a sheet you own</h2>
          <p>
            Builds a Google Sheet in your own Drive with the numbers laid
            out, plus a Fix tab where you type in the new price or cost for
            anything you want to change.
          </p>
        </div>
        <div className={styles.feature}>
          <h2>Push changes safely</h2>
          <p>
            See exactly what will change — including anything that would
            still land below cost — before you confirm. Every push is
            logged, so you can undo it later if something looks wrong.
          </p>
        </div>
      </section>

      <footer className={styles.footer}>
        <Link to="/privacy">Privacy policy</Link>
      </footer>
    </div>
  );
}
