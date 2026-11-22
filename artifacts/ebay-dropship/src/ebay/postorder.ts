// Returns, cancellation requests and item-not-received inquiries through the
// eBay Post-Order API v2. OAuth user token is sent as "Authorization: IAF <token>".
// NOTE: written from eBay's Post-Order reference without live verification;
// field names are read defensively and errors are surfaced in the logs.

import { requestJson } from "../http.ts";
import type { EbayClient } from "./client.ts";

export type CaseKind = "return" | "cancel" | "inquiry";

export type EbayCase = {
  kind: CaseKind;
  caseId: string;
  orderId: string;
  buyer: string;
  reason: string;
  comment: string;
  state: string;
  amount: number | null;
  open: boolean;
  openedAt: string;
};

type Any = Record<string, any>;

const money = (v: Any | undefined): number | null => {
  const n = Number(v?.value ?? v?.amount ?? NaN);
  return Number.isFinite(n) ? n : null;
};
const dateOf = (v: unknown): string => (typeof v === "object" && v ? String((v as Any).value ?? "") : String(v ?? ""));

const CLOSED = /CLOSED|CANCELLED|REFUNDED|COMPLETED|REJECTED|CLOSE|DENIED|APPROVED|ESCALATED_CLOSED/i;

export class PostOrderApi {
  private ebay: EbayClient;

  constructor(ebay: EbayClient) {
    this.ebay = ebay;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.ebay.userToken();
    return requestJson<T>(this.ebay.fetcher, `${this.ebay.config.ebay.apiBase}/post-order/v2${path}`, {
      method,
      headers: {
        Authorization: `IAF ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-EBAY-C-MARKETPLACE-ID": this.ebay.config.ebay.marketplaceId,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async returns(): Promise<EbayCase[]> {
    const r = await this.call<Any>("GET", "/return/search?limit=50&sort=FILED_DATE_DESC");
    return ((r.members ?? r.returns ?? []) as Any[]).map((m) => {
      const state = String(m.state ?? m.status ?? "");
      return {
        kind: "return" as const,
        caseId: String(m.returnId),
        orderId: String(m.orderId ?? ""),
        buyer: String(m.buyerLoginName ?? ""),
        reason: String(m.creationInfo?.reason ?? ""),
        comment: String(m.creationInfo?.comments?.content ?? ""),
        state,
        amount: money(m.sellerTotalRefund?.estimatedRefundAmount ?? m.buyerTotalRefund?.estimatedRefundAmount),
        open: !CLOSED.test(state),
        openedAt: dateOf(m.creationInfo?.creationDate),
      };
    });
  }

  async cancellations(): Promise<EbayCase[]> {
    const r = await this.call<Any>("GET", "/cancellation/search?limit=50");
    return ((r.cancellations ?? r.members ?? []) as Any[]).map((c) => {
      const state = String(c.cancelState ?? c.cancelStatus ?? "");
      return {
        kind: "cancel" as const,
        caseId: String(c.cancelId),
        orderId: String(c.legacyOrderId ?? c.orderId ?? ""),
        buyer: String(c.buyerLoginName ?? c.requestorType ?? ""),
        reason: String(c.cancelReason ?? ""),
        comment: "",
        state,
        amount: money(c.requestRefundAmount),
        open: /REQUEST|PENDING|OPEN|INITIATED/i.test(state) && !CLOSED.test(state),
        openedAt: dateOf(c.cancelRequestDate),
      };
    });
  }

  async inquiries(): Promise<EbayCase[]> {
    const r = await this.call<Any>("GET", "/inquiry/search?limit=50");
    return ((r.members ?? r.inquiries ?? []) as Any[]).map((i) => {
      const state = String(i.inquiryStatusEnum ?? i.state ?? i.status ?? "");
      return {
        kind: "inquiry" as const,
        caseId: String(i.inquiryId),
        orderId: String(i.orderId ?? (i.itemId && i.transactionId ? `${i.itemId}-${i.transactionId}` : "")),
        buyer: String(i.buyer ?? i.buyerLoginName ?? ""),
        reason: "item not received",
        comment: "",
        state,
        amount: money(i.claimAmount),
        open: !CLOSED.test(state),
        openedAt: dateOf(i.creationDate),
      };
    });
  }

  async approveCancellation(cancelId: string): Promise<void> {
    await this.call("POST", `/cancellation/${cancelId}/approve`, {});
  }

  async acceptReturn(returnId: string): Promise<void> {
    await this.call("POST", `/return/${returnId}/decide`, { decision: "ACCEPT" });
  }

  async provideShipment(inquiryId: string, carrier: string, tracking: string): Promise<void> {
    await this.call("POST", `/inquiry/${inquiryId}/provide_shipment_info`, {
      shippingCarrierName: carrier,
      trackingNumber: tracking,
    });
  }
}
