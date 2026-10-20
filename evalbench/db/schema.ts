import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const evalRuns = sqliteTable('eval_runs', {
  id: text('id').primaryKey(),
  snapshot: text('snapshot').notNull(),
  reviews: text('reviews').notNull().default('{}'),
  provider: text('provider').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  archived: integer('archived').notNull().default(0),
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
}, t => [index('eval_tasks_run_state').on(t.runId, t.state)]);
