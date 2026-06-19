import { sqliteTable, text, numeric } from "drizzle-orm/sqlite-core";

export const invoices = sqliteTable("invoices", {
  id: text("id").primaryKey(),
  amount: numeric("amount").notNull(),
  dueDate: text("due_date").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
