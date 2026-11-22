import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/** Vexora AI data model. Credits are never stored as a mutable balance: balance = SUM(credit_ledger.delta). */

export const usersTable = pgTable('vx_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  name: text('name').notNull().default(''),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['user', 'admin'] }).notNull().default('user'),
  planId: text('plan_id', { enum: ['free', 'starter', 'creator', 'studio'] }).notNull().default('free'),
  billingCycle: text('billing_cycle', { enum: ['monthly', 'yearly'] }),
  planRenewsAt: timestamp('plan_renews_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('vx_users_email_uq').on(t.email)]);

export const sessionsTable = pgTable('vx_sessions', {
  /** sha256 of the cookie token — the raw token is never stored */
  id: text('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('vx_sessions_user_idx').on(t.userId)]);

export const creditLedgerTable = pgTable('vx_credit_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  delta: integer('delta').notNull(),
  reason: text('reason', { enum: ['signup_bonus', 'purchase', 'generation', 'generation_refund', 'payment_refund', 'admin_adjust'] }).notNull(),
  refId: text('ref_id'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('vx_ledger_user_idx').on(t.userId)]);

export const paymentsTable = pgTable('vx_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => usersTable.id),
  provider: text('provider').notNull(),
  /** id of the checkout/transaction at the provider; unique so webhooks are idempotent */
  providerRef: text('provider_ref'),
  item: jsonb('item').notNull(),
  currency: text('currency').notNull(),
  amountMinor: integer('amount_minor').notNull(),
  credits: integer('credits').notNull(),
  status: text('status', { enum: ['pending', 'paid', 'failed', 'refunded'] }).notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  refundedAt: timestamp('refunded_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('vx_payments_provider_ref_uq').on(t.provider, t.providerRef),
  index('vx_payments_status_idx').on(t.status),
  index('vx_payments_user_idx').on(t.userId),
]);

export const generationsTable = pgTable('vx_generations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  params: jsonb('params').notNull(),
  provider: text('provider').notNull(),
  providerJobId: text('provider_job_id'),
  status: text('status', { enum: ['queued', 'running', 'done', 'failed', 'cancelled'] }).notNull().default('running'),
  cost: integer('cost').notNull(),
  results: jsonb('results').notNull().default([]),
  error: text('error'),
  /** mock provider: when the simulated job completes */
  finishAt: timestamp('finish_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('vx_generations_user_idx').on(t.userId, t.createdAt)]);

export type UserRow = typeof usersTable.$inferSelect;
export type PaymentRow = typeof paymentsTable.$inferSelect;
export type GenerationRow = typeof generationsTable.$inferSelect;
