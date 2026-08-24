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
import {
  getBatch,
  listBatches,
  markBatchReverted,
  type PushBatchSummary,
} from "../push-batches.server";
import { toShopContext } from "../shop-context.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const batches = await listBatches(session.shop);
  return { batches };
};

interface UndoResponse {
  restored: number;
  batchId: string;
}

interface UndoError {
  error: string;
}

type ActionResponse = UndoResponse | UndoError;

export const action = async ({
  request,
}: ActionFunctionArgs): Promise<ActionResponse> => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const batchId = String(formData.get("batchId"));

  try {
    const batch = await getBatch(session.shop, batchId);
    if (!batch) {
      return { error: "That push no longer exists." } satisfies UndoError;
    }
    // Guards against a double-click or a second tab racing the first undo —
    // without this, restoring an already-reverted batch a second time would
    // silently re-apply the same "before" values on top of whatever else
    // has changed since.
    if (batch.reverted) {
      return { error: "This push was already undone." } satisfies UndoError;
    }

    const shopContext = toShopContext(session);
    const result = await undoBatch(shopContext, batch.entries);
    await markBatchReverted(batchId);
    return { restored: result.restored, batchId } satisfies UndoResponse;
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    } satisfies UndoError;
  }
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

const UNDO_MODAL_ID = "undo-batch-modal";

export default function History() {
  const shopify = useAppBridge();
  const { batches } = useLoaderData<typeof loader>();
  const undoFetcher = useFetcher<typeof action>();

  const [pendingBatch, setPendingBatch] = useState<PushBatchSummary | null>(null);

  const isUndoing =
    ["loading", "submitting"].includes(undoFetcher.state) &&
    undoFetcher.formMethod === "POST";

  const askToUndo = (batch: PushBatchSummary) => {
    setPendingBatch(batch);
    shopify.modal.show(UNDO_MODAL_ID);
  };

  const confirmUndo = () => {
    if (!pendingBatch) return;
    undoFetcher.submit({ batchId: pendingBatch.id }, { method: "POST" });
  };

  useEffect(() => {
    if (!undoFetcher.data) return;

    shopify.modal.hide(UNDO_MODAL_ID);

    if ("error" in undoFetcher.data) {
      shopify.toast.show(undoFetcher.data.error, { isError: true });
      return;
    }
    shopify.toast.show(`Restored ${undoFetcher.data.restored} variant(s).`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoFetcher.data]);

  // The database only reflects a batch as reverted after the next
  // navigation/reload — read the ID back off the fetcher's own response
  // (not pendingBatch, which changes as soon as a *different* row's Undo is
  // clicked) so the row that was actually just undone disables immediately.
  const justRevertedId =
    undoFetcher.data && !("error" in undoFetcher.data)
      ? undoFetcher.data.batchId
      : undefined;

  return (
    <s-page heading="History">
      {batches.length === 0 ? (
        <s-section heading="No pushes yet">
          <s-paragraph>
            Every time you push price/cost changes to Shopify from the
            dashboard, it shows up here with an Undo button, so you can
            reverse it later if something looks wrong.
          </s-paragraph>
        </s-section>
      ) : (
        <s-section heading="Past pushes">
          <s-table>
            <s-table-header-row>
              <s-table-header>Date</s-table-header>
              <s-table-header format="numeric">Changes</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Action</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {batches.map((batch) => {
                const reverted = batch.reverted || batch.id === justRevertedId;
                return (
                  <s-table-row key={batch.id}>
                    <s-table-cell>{formatDate(batch.createdAt)}</s-table-cell>
                    <s-table-cell>{batch.changeCount}</s-table-cell>
                    <s-table-cell>
                      {reverted ? (
                        <s-badge tone="info">Reverted</s-badge>
                      ) : (
                        <s-badge tone="success">Applied</s-badge>
                      )}
                    </s-table-cell>
                    <s-table-cell>
                      {!reverted && (
                        <s-button onClick={() => askToUndo(batch)}>Undo</s-button>
                      )}
                    </s-table-cell>
                  </s-table-row>
                );
              })}
            </s-table-body>
          </s-table>
        </s-section>
      )}

      <s-modal id={UNDO_MODAL_ID} heading="Undo this push?">
        {pendingBatch && (
          <s-paragraph>
            This restores{" "}
            <s-text type="strong">{pendingBatch.changeCount}</s-text>{" "}
            variant(s) to the price/cost they had right before this push, on
            your live Shopify store.
          </s-paragraph>
        )}
        <s-button
          slot="primary-action"
          variant="primary"
          tone="critical"
          onClick={confirmUndo}
          disabled={!pendingBatch || isUndoing}
          {...(isUndoing ? { loading: true } : {})}
        >
          Undo
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
