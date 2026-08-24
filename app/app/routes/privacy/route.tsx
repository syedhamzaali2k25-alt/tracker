import { Link } from "react-router";
import styles from "./styles.module.css";

export default function Privacy() {
  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link to="/" className={styles.logo}>
          <img src="/logo.svg" alt="" className={styles.logoMark} />
          <span className={styles.wordmark}>Margin Tracker</span>
        </Link>
        <Link to="/" className={styles.topbarLink}>
          Home
        </Link>
      </header>

      <main className={styles.content}>
        <p className={styles.eyebrow}>Legal</p>
        <h1 className={styles.heading}>Privacy policy</h1>
        <p className={styles.updated}>Last updated: August 2026</p>

        <p className={styles.lede}>
          Margin Tracker is a Shopify app that finds products selling below cost or at a thin margin, and
          lets you push price and cost fixes back to Shopify. This page explains what data the app
          accesses, how it&apos;s stored, and what happens to it if you uninstall.
        </p>

        <section>
          <h2>What we access from your Shopify store</h2>
          <p>When you install Margin Tracker, Shopify grants it these permissions.</p>
          <ul>
            <li>
              <strong>Products and inventory</strong> (read and write). Reads each product variant&apos;s
              title, SKU, price, and cost, and writes back a new price or cost only when you explicitly
              confirm a push in the app.
            </li>
            <li>
              <strong>Orders</strong> (read-only). Counts units sold and revenue per variant over a
              lookback window, so the app can estimate how much a below-cost product is costing you. We
              only read line item quantities and prices from orders, never customer names, emails,
              addresses, or payment details.
            </li>
          </ul>
          <p>
            Margin Tracker does not access, store, or process any customer personal information. The
            mandatory <code>customers/data_request</code> and <code>customers/redact</code> compliance
            webhooks are no-ops in this app for exactly that reason: there is no customer data to return
            or delete.
          </p>
        </section>

        <section>
          <h2>The Google Sheet we create</h2>
          <p>
            If you connect a Google account, Margin Tracker creates one spreadsheet in{" "}
            <strong>your own</strong> Google Drive to report the numbers and collect any price or cost
            edits you type in. The Google permission we request is limited to <code>drive.file</code>:
            access to only the file this app itself created, not your wider Drive. We never ask for or
            use broader Google Sheets or Drive access.
          </p>
        </section>

        <section>
          <h2>How your data is stored</h2>
          <ul>
            <li>
              Your Shopify access token and your Google refresh token are encrypted at rest
              (AES-256-GCM) before being written to our database. Neither is ever logged or sent to your
              browser.
            </li>
            <li>
              Every time you push a price or cost change, we store the previous values for the variants
              that change, so you can undo that specific push later from the app&apos;s History page.
            </li>
            <li>
              If you turn on weekly email alerts, we store whether that setting is on and, optionally, an
              email address you choose to send them to instead of your Shopify account email.
            </li>
          </ul>
        </section>

        <section>
          <h2>What happens when you uninstall</h2>
          <p>
            Uninstalling the app deletes your store&apos;s session, cached diagnostic results, Google
            connection, push history, and email settings from our database. Shopify also sends a
            mandatory <code>shop/redact</code> webhook roughly 48 hours after uninstall as a backstop,
            which we handle the same way, in case anything was missed.
          </p>
        </section>

        <section>
          <h2>Questions</h2>
          <p>You can reach us through the contact information on our Shopify App Store listing.</p>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>Margin Tracker</span>
        <Link to="/">Back to Margin Tracker</Link>
      </footer>
    </div>
  );
}
