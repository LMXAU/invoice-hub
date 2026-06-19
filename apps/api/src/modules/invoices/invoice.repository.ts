import type { DbClient } from "../../client";
import { invoices, type NewInvoice } from "@database/schema";
import { eq } from "drizzle-orm";

export class InvoiceRepository {
  constructor(private db: DbClient) {}

  async create(data: NewInvoice) {
    const result = await this.db.insert(invoices).values(data).returning();
    return result[0];
  }

  async findByDesc(desc: string) {
    const result = await this.db
      .select()
      .from(invoices)
      .where(eq(invoices.desc, desc))
      .limit(1);

    return result[0] ?? null;
  }

  async list() {
    return this.db.select().from(invoices).limit(100);
  }
}
