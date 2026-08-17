import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { undoBatch } from "~lib/pipeline/undo.js";
import type { ShopContext } from "~lib/shopify/client.js";
import {
  getPushBatch,
  listPushBatches,
  markPushBatchReverted,
  type PushBatchSummary,
} from "../push-batch.server";

/** authenticate.admin() always returns an active session with a token; the check is defensive. */
function toShopContext(session: { shop: string; accessToken?: string }): ShopContext {
  if (!session.accessToken) {
    throw new Error("No access token on the current session — try reinstalling the app.");
  }
  return { shop: session.shop, accessToken: session.accessToken };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const batches = await listPushBatches(session.shop);
  return { batches };
};

interface UndoResponse {
  undone: { batchId: string; restored: number };
}

interface ActionError {
  error: string;
}

type ActionResponse = UndoResponse | ActionError;

export const action = async ({ request }: ActionFunctionArgs): Promise<ActionResponse> => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const batchId = String(formData.get("batchId"));

  try {
    const batch = await getPushBatch(session.shop, batchId);
    if (!batch) {
      return { error: "That push no longer exists." };
    }
    if (batch.reverted) {
      return { error: "That push was already undone." };
    }

    const shopContext = toShopContext(session);
    const result = await undoBatch(shopContext, batch.entries);
    await markPushBatchReverted(batchId);

    return { undone: { batchId, restored: result.restored } } satisfies UndoResponse;
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    } satisfies ActionError;
  }
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

const UNDO_MODAL_ID = "undo-batch-modal";

export default function History() {
  const shopify = useAppBridge();
  const { batches } = useLoaderData<typeof loader>();
  const undoFetcher = useFetcher<typeof action>();

  const [selectedBatch, setSelectedBatch] = useState<PushBatchSummary | null>(null);

  const isUndoing =
    ["loading", "submitting"].includes(undoFetcher.state) &&
    undoFetcher.formMethod === "POST";

  const openConfirm = (batch: PushBatchSummary) => {
    setSelectedBatch(batch);
    shopify.modal.show(UNDO_MODAL_ID);
  };

  const confirmUndo = () => {
    if (!selectedBatch) return;
    undoFetcher.submit({ batchId: selectedBatch.id }, { method: "POST" });
  };

  // Report the undo outcome and close the modal, whether it succeeded or not.
  useEffect(() => {
    if (!undoFetcher.data) return;

    shopify.modal.hide(UNDO_MODAL_ID);

    if ("error" in undoFetcher.data) {
      shopify.toast.show(undoFetcher.data.error, { isError: true });
      return;
    }

    shopify.toast.show(
      `Restored ${pluralize(undoFetcher.data.undone.restored, "variant")} to their previous price/cost.`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoFetcher.data]);

  return (
    <s-page heading="History">
      {batches.length === 0 ? (
        <s-section heading="No pushes yet">
          <s-paragraph>
            Every time you push price/cost changes to Shopify, the batch will
            show up here — with an Undo button to restore it if something
            goes wrong.
          </s-paragraph>
        </s-section>
      ) : (
        <s-section heading="Past pushes">
          <s-table>
            <s-table-header-row>
              <s-table-header>Date</s-table-header>
              <s-table-header format="numeric">Changes</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header></s-table-header>
            </s-table-header-row>
            <s-table-body>
              {batches.map((batch) => (
                <s-table-row key={batch.id}>
                  <s-table-cell>{formatDate(batch.createdAt)}</s-table-cell>
                  <s-table-cell>{batch.changeCount}</s-table-cell>
                  <s-table-cell>
                    {batch.reverted ? (
                      <s-text tone="neutral">Reverted</s-text>
                    ) : (
                      "Applied"
                    )}
                  </s-table-cell>
                  <s-table-cell>
                    <s-button
                      disabled={batch.reverted}
                      {...(isUndoing && selectedBatch?.id === batch.id
                        ? { loading: true }
                        : {})}
                      onClick={() => openConfirm(batch)}
                    >
                      Undo
                    </s-button>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        </s-section>
      )}

      <s-modal id={UNDO_MODAL_ID} heading="Undo this push?">
        {selectedBatch && (
          <s-paragraph>
            This restores {pluralize(selectedBatch.changeCount, "variant")} to
            the price/cost they had before this push, from{" "}
            {formatDate(selectedBatch.createdAt)}. This writes directly to
            Shopify and can&apos;t be applied a second time once confirmed.
          </s-paragraph>
        )}
        <s-button
          slot="primary-action"
          variant="primary"
          tone="critical"
          onClick={confirmUndo}
          disabled={!selectedBatch || isUndoing}
          {...(isUndoing ? { loading: true } : {})}
        >
          Restore previous values
        </s-button>
        <s-button
          slot="secondary-actions"
          onClick={() => shopify.modal.hide(UNDO_MODAL_ID)}
        >
          Cancel
        </s-button>
      </s-modal>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
