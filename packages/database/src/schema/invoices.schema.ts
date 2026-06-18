import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const invoices = sqliteTable('invoices', {
  id: text('id').primaryKey(),
  amount: text('amount').notNull(),
  desc: text('desc'),
  duedate: text('duedate').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export type Invoice = typeof invoices.$inferSelect
export type NewInvoice = typeof invoices.$inferInsert