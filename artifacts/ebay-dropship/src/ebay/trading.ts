// Buyer messages through the eBay Trading API (XML), authenticated with the
// same OAuth user token (X-EBAY-API-IAF-TOKEN header).
// Calls used: GetMemberMessages, AddMemberMessageRTQ, AddMemberMessageAAQToPartner.
// NOTE: written from eBay's Trading API reference without live verification;
// errors are surfaced in the dashboard logs.

import { XMLBuilder, XMLParser } from "fast-xml-parser";
import { HttpError } from "../http.ts";
import type { EbayClient } from "./client.ts";

const COMPAT_LEVEL = "1193";
const NS = "urn:ebay:apis:eBLBaseComponents";

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  isArray: (name) => ["MemberMessageExchange", "Errors"].includes(name),
});
const builder = new XMLBuilder({ ignoreAttributes: false, format: false });

export type InboxMessage = {
  messageId: string;
  sender: string;
  recipient: string;
  itemId: string;
  itemTitle: string;
  subject: string;
  body: string;
  status: string; // Unanswered | Answered
  createdAt: string;
};

type Exchange = {
  Item?: { ItemID?: string; Title?: string };
  Question?: { MessageID?: string; SenderID?: string; RecipientID?: string | string[]; Subject?: string; Body?: string };
  MessageStatus?: string;
  CreationDate?: string;
};

export class TradingApi {
  private ebay: EbayClient;

  constructor(ebay: EbayClient) {
    this.ebay = ebay;
  }

  private async call(callName: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const token = await this.ebay.userToken();
    const xml =
      `<?xml version="1.0" encoding="utf-8"?>` +
      builder.build({ [`${callName}Request`]: { "@_xmlns": NS, ...body } });
    const res = await this.ebay.fetcher(`${this.ebay.config.ebay.apiBase}/ws/api.dll`, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml",
        "X-EBAY-API-CALL-NAME": callName,
        "X-EBAY-API-SITEID": "0", // US
        "X-EBAY-API-COMPATIBILITY-LEVEL": COMPAT_LEVEL,
        "X-EBAY-API-IAF-TOKEN": token,
      },
      body: xml,
    });
    const text = await res.text();
    if (!res.ok) throw new HttpError(res.status, text, callName);
    const doc = parser.parse(text) as Record<string, Record<string, unknown>>;
    const resp = doc[`${callName}Response`] ?? {};
    if (resp.Ack === "Failure") {
      const errs = (resp.Errors as { LongMessage?: string; ShortMessage?: string }[] | undefined) ?? [];
      throw new Error(`${callName}: ${errs.map((e) => e.LongMessage ?? e.ShortMessage).join("; ") || "Failure"}`);
    }
    return resp;
  }

  /** Messages from buyers in the last `days` days (eBay allows up to 30 days per query). */
  async getMessages(days = 14): Promise<InboxMessage[]> {
    const end = new Date();
    const start = new Date(end.getTime() - Math.min(days, 30) * 86400_000);
    const out: InboxMessage[] = [];
    for (let page = 1; page <= 5; page++) {
      const resp = await this.call("GetMemberMessages", {
        MailMessageType: "All",
        StartCreationTime: start.toISOString(),
        EndCreationTime: end.toISOString(),
        Pagination: { EntriesPerPage: 100, PageNumber: page },
      });
      const exchanges = ((resp.MemberMessage as { MemberMessageExchange?: Exchange[] } | undefined)?.MemberMessageExchange ?? []);
      for (const ex of exchanges) {
        const q = ex.Question ?? {};
        if (!q.MessageID) continue;
        out.push({
          messageId: String(q.MessageID),
          sender: String(q.SenderID ?? ""),
          recipient: Array.isArray(q.RecipientID) ? String(q.RecipientID[0]) : String(q.RecipientID ?? ""),
          itemId: String(ex.Item?.ItemID ?? ""),
          itemTitle: String(ex.Item?.Title ?? ""),
          subject: String(q.Subject ?? ""),
          body: String(q.Body ?? ""),
          status: String(ex.MessageStatus ?? "Unanswered"),
          createdAt: String(ex.CreationDate ?? ""),
        });
      }
      if (String(resp.HasMoreItems) !== "true") break;
    }
    return out;
  }

  /** Reply to a buyer's question. */
  async reply(input: { itemId: string; parentMessageId: string; recipient: string; body: string }): Promise<void> {
    const msg: Record<string, unknown> = {
      Body: input.body.slice(0, 2000),
      ParentMessageID: input.parentMessageId,
      RecipientID: input.recipient,
    };
    await this.call("AddMemberMessageRTQ", input.itemId ? { ItemID: input.itemId, MemberMessage: msg } : { MemberMessage: msg });
  }

  /** Start a new message to a buyer you have an order with. */
  async messageBuyer(input: { itemId: string; buyer: string; subject: string; body: string }): Promise<void> {
    await this.call("AddMemberMessageAAQToPartner", {
      ItemID: input.itemId,
      MemberMessage: {
        Subject: input.subject.slice(0, 100),
        Body: input.body.slice(0, 2000),
        QuestionType: "General",
        RecipientID: input.buyer,
      },
    });
  }
}
