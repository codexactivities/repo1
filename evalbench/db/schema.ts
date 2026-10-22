import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const evalRuns = sqliteTable('eval_runs', {
  id: text('id').primaryKey(),
  snapshot: text('snapshot').notNull(),
  reviews: text('reviews').notNull().default('{}'),
  provider: text('provider').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  archived: integer('archived').notNull().default(0),
  control: text('control').notNull().default('active'),
  stopReason: text('stop_reason'),
  concurrency: integer('concurrency').notNull().default(2),
  budgetUsd: real('budget_usd'),
  maxRequests: integer('max_requests').notNull().default(10000),
});

export const evalTasks = sqliteTable('eval_tasks', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => evalRuns.id),
  ordinal: integer('ordinal').notNull(),
  caseId: text('case_id').notNull(),
  side: text('side').notNull(),
  state: text('state').notNull().default('pending'),
  leaseUntil: integer('lease_until').notNull().default(0),
  result: text('result'),
  kind: text('kind').notNull().default('generation'),
  repeatNo: integer('repeat_no').notNull().default(0),
  attempt: integer('attempt').notNull().default(0),
  reserveCost: real('reserve_cost'),
  chargedCost: real('charged_cost'),
  priorCost: real('prior_cost').notNull().default(0),
}, t => [index('eval_tasks_run_state').on(t.runId, t.state)]);

export const evalSettings = sqliteTable('eval_settings', {
  id:text('id').primaryKey(), value:text('value').notNull(), secret:text('secret'),
});
export const evalAssets = sqliteTable('eval_assets', {
  id:text('id').primaryKey(), familyId:text('family_id').notNull(), kind:text('kind').notNull(),
  name:text('name').notNull(), version:integer('version').notNull(), content:text('content').notNull(),
  createdAt:text('created_at').notNull(),
}, t=>[uniqueIndex('eval_assets_family_version').on(t.familyId,t.version)]);
