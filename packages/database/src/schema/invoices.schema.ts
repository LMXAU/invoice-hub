import { sqliteTable, text, numeric } from "drizzle-orm/sqlite-core";

export const invoices = sqliteTable("invoices", {
  id: text().primaryKey(),
  amount: numeric({ mode: "number" }).notNull(),
  desc: text().notNull(),
  dueDate: text().notNull(),
  createdAt: text().notNull(),
  updatedAt: text().notNull(),
});

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
