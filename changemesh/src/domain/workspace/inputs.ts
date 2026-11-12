import { z } from "zod";
import { WORKSPACE_ROLES } from "../rbac/roles";
import { ASSET_TYPES, CHANGE_TYPES } from "./model";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

/** Structural URL check only. Network-level checks (private IPs, DNS) happen at scan time (Stage 3). */
export const httpUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => {
    try {
      const u = new URL(v);
      return (u.protocol === "https:" || u.protocol === "http:") && Boolean(u.hostname) && !u.username && !u.password;
    } catch {
      return false;
    }
  }, "Enter a full http(s) URL without credentials, e.g. https://example.com/menu.");

export const createAssetSchema = z
  .object({
    type: z.enum(ASSET_TYPES),
    name: z.string().trim().min(1, "Enter a name.").max(200),
    description: optionalText(2000),
    sourceUrl: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v : null))
      .pipe(httpUrlSchema.nullable()),
  })
  .superRefine((v, ctx) => {
    if (v.type === "website" && !v.sourceUrl) ctx.addIssue({ code: "custom", path: ["sourceUrl"], message: "Websites need a URL." });
  });
export type CreateAssetInput = z.output<typeof createAssetSchema>;

export const createChangeSchema = z.object({
  title: z.string().trim().min(2, "Enter a short title.").max(200),
  type: z.enum(CHANGE_TYPES),
  entityName: optionalText(200),
  attributeName: optionalText(200),
  oldValue: optionalText(4000),
  newValue: optionalText(4000),
  description: optionalText(4000),
  sourceAssetId: optionalText(64),
});
export type CreateChangeInput = z.output<typeof createChangeSchema>;

export const decisionSchema = z
  .object({
    proposalId: z.string().min(1).max(64),
    decision: z.enum(["approved", "rejected", "needs_revision"]),
    comment: optionalText(2000),
  })
  .superRefine((v, ctx) => {
    if (v.decision !== "approved" && !v.comment) ctx.addIssue({ code: "custom", path: ["comment"], message: "Explain the reason so the editor knows what to fix." });
  });
export type DecisionInput = z.output<typeof decisionSchema>;

export const relationshipReviewSchema = z.object({
  relationshipId: z.string().min(1).max(64),
  status: z.enum(["confirmed", "rejected"]),
});

export const memberRoleSchema = z.object({
  userId: z.string().min(1).max(64),
  role: z.enum(WORKSPACE_ROLES),
});

export const removeMemberSchema = z.object({ userId: z.string().min(1).max(64) });

export const renameWorkspaceSchema = z.object({ name: z.string().trim().min(2, "Must be at least 2 characters.").max(80) });

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name.").max(100),
  locale: z.enum(["en", "az", "tr"]),
});
