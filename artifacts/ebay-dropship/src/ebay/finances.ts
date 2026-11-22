// eBay Sell Finances API: real fees per order and payouts to your bank.
// Host is apiz.ebay.com (not api.ebay.com). Scope: sell.finances.

import { requestJson } from "../http.ts";
import type { EbayClient } from "./client.ts";

export type FinanceTx = {
  txId: string;
  orderId: string;
  type: string; // SALE | REFUND | SHIPPING_LABEL | NON_SALE_CHARGE | ...
  booking: string; // CREDIT | DEBIT
  amount: number;
  fees: number;
  date: string;
};

export type Payout = { payoutId: string; status: string; amount: number; date: string };

type Any = Record<string, any>;

export class FinancesApi {
  private ebay: EbayClient;

  constructor(ebay: EbayClient) {
    this.ebay = ebay;
  }

  private base(): string {
    return this.ebay.config.ebay.apiBase.replace("://api.", "://apiz.");
  }

  private async get<T>(path: string): Promise<T> {
    const token = await this.ebay.userToken();
    return requestJson<T>(this.ebay.fetcher, `${this.base()}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "X-EBAY-C-MARKETPLACE-ID": this.ebay.config.ebay.marketplaceId,
      },
    });
  }

  async transactions(days = 30): Promise<FinanceTx[]> {
    const from = new Date(Date.now() - days * 86400_000).toISOString();
    const out: FinanceTx[] = [];
    for (let offset = 0; offset < 1000; offset += 200) {
      const filter = encodeURIComponent(`transactionDate:[${from}..]`);
      const r = await this.get<Any>(`/sell/finances/v1/transaction?filter=${filter}&limit=200&offset=${offset}`);
      const txs = (r.transactions ?? []) as Any[];
      for (const t of txs) {
        out.push({
          txId: String(t.transactionId),
          orderId: String(t.orderId ?? ""),
          type: String(t.transactionType ?? ""),
          booking: String(t.bookingEntry ?? ""),
          amount: Number(t.amount?.value ?? 0),
          fees: Number(t.totalFeeAmount?.value ?? 0),
          date: String(t.transactionDate ?? ""),
        });
      }
      if (txs.length < 200) break;
    }
    return out;
  }

  async payouts(): Promise<Payout[]> {
    const r = await this.get<Any>("/sell/finances/v1/payout?limit=20&sort=-payoutDate");
    return ((r.payouts ?? []) as Any[]).map((p) => ({
      payoutId: String(p.payoutId),
      status: String(p.payoutStatus ?? ""),
      amount: Number(p.amount?.value ?? 0),
      date: String(p.payoutDate ?? ""),
    }));
  }
}
