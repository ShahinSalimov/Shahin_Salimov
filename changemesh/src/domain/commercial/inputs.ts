import { z } from "zod";
import { CHECKOUT_PLANS } from "../billing/stripe-sync";

export const INVITABLE_ROLES = ["admin", "editor", "viewer"] as const;

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).email("Enter a valid email address."),
  role: z.enum(INVITABLE_ROLES, { message: "Choose a role." }),
});
export type InviteInput = z.output<typeof inviteSchema>;

export const API_SCOPES = ["read", "write"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const apiKeySchema = z.object({
  name: z.string().trim().min(2, "Name the key (at least 2 characters).").max(80),
  access: z.enum(["read", "read_write"]),
  expiresInDays: z
    .enum(["30", "90", "365", "never"])
    .default("90")
    .transform((v) => (v === "never" ? null : Number(v))),
});
export type ApiKeyInput = z.output<typeof apiKeySchema>;

export const organizationNameSchema = z.object({
  name: z.string().trim().min(2, "Use at least 2 characters.").max(80),
});

const slugify = (v: string) =>
  v
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

export const createWorkspaceSchema = z
  .object({ name: z.string().trim().min(2, "Use at least 2 characters.").max(80) })
  .transform((v) => ({ name: v.name, slug: slugify(v.name) || "workspace" }));

export const checkoutSchema = z.object({ plan: z.enum(CHECKOUT_PLANS) });
