import type { DbClient } from "../../client";
import type { CreateInvoiceBody } from "@contracts/invoices.contract";
import { InvoiceRepository } from "./invoice.repository";

export class InvoicesService {
  private invoiceRepository: InvoiceRepository;

  constructor(db: DbClient) {
    this.invoiceRepository = new InvoiceRepository(db);
  }

  async createInvoice(data: CreateInvoiceBody) {
    const existingInvoice = await this.invoiceRepository.findByDesc(data.desc);

    if (existingInvoice) {
      throw new Error(`Invoice with description "${data.desc}" already exists`);
    }

    const now = new Date().toISOString();

    return this.invoiceRepository.create({
      id: crypto.randomUUID(),
      ...data,
      createdAt: now,
      updatedAt: now,
    });
  }

  async listInvoices() {
    return this.invoiceRepository.list();
  }
}
