import { useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { fetchShopEmail } from "~lib/shopify/queries.js";
import { getShopSettings, saveShopSettings } from "../shop-settings.server";
import { toShopContext } from "../shop-context.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await getShopSettings(session.shop);

  // Best-effort: the settings page should still render (with the alert
  // email field simply blank) even if this call fails, rather than 500ing
  // the whole page over a non-essential GraphQL lookup.
  let shopifyEmail: string | null = null;
  try {
    shopifyEmail = await fetchShopEmail(toShopContext(session));
  } catch (error) {
    console.error(`[app.settings] failed to fetch shop email for ${session.shop}`, error);
  }

  return { settings, shopifyEmail };
};

interface SaveResult {
  saved: true;
}

interface SaveError {
  error: string;
}

export const action = async ({
  request,
}: ActionFunctionArgs): Promise<SaveResult | SaveError> => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  try {
    // Unchecked HTML checkboxes aren't included in FormData at all, so
    // presence (not value) is what "on" means here.
    const emailAlerts = formData.has("emailAlerts");
    const rawAlertEmail = String(formData.get("alertEmail") ?? "").trim();

    await saveShopSettings(session.shop, {
      emailAlerts,
      alertEmail: rawAlertEmail === "" ? null : rawAlertEmail,
    });

    return { saved: true } satisfies SaveResult;
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    } satisfies SaveError;
  }
};

export default function Settings() {
  const shopify = useAppBridge();
  const { settings, shopifyEmail } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const isSaving =
    ["loading", "submitting"].includes(fetcher.state) && fetcher.formMethod === "POST";

  useEffect(() => {
    if (!fetcher.data) return;
    if ("error" in fetcher.data) {
      shopify.toast.show(fetcher.data.error, { isError: true });
      return;
    }
    shopify.toast.show("Settings saved.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.data]);

  return (
    <s-page heading="Settings">
      <s-section heading="Weekly margin alerts">
        <s-paragraph>
          Every week, Margin Tracker re-checks your products and compares
          them to the previous check. If anything newly sells below cost or
          drops below your margin threshold, you can get an email listing
          exactly what changed.
        </s-paragraph>

        <fetcher.Form method="POST">
          <s-stack direction="block" gap="base">
            <s-checkbox
              name="emailAlerts"
              label="Email me when something newly drops below cost or margin threshold"
              {...(settings.emailAlerts ? { defaultChecked: true } : {})}
            />
            <s-email-field
              name="alertEmail"
              label="Alert email (optional)"
              defaultValue={settings.alertEmail ?? ""}
              placeholder={shopifyEmail ?? "you@example.com"}
              details={
                shopifyEmail
                  ? `Leave blank to use your Shopify account email (${shopifyEmail}).`
                  : "Leave blank to use your Shopify account email."
              }
            />
            <s-button
              type="submit"
              variant="primary"
              {...(isSaving ? { loading: true } : {})}
            >
              Save
            </s-button>
          </s-stack>
        </fetcher.Form>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
