import type { Context } from "hono";
import type { AppEnv } from "../../context";
import { createDbClient } from "../../client";
import { InvoicesService } from "./invoices.service";

export async function listInvoicesHandler(c: Context<AppEnv>) {
  const db = createDbClient(c.env.DB);
  const service = new InvoicesService(db);

  try {
    const invoices = await service.listInvoices();
    return c.json(invoices);
  } catch (error) {
    console.error(error);
    return c.json({ error: "Failed to fetch invoices" }, 500);
  }
}

export async function createInvoiceHandler(c: Context<AppEnv>) {
  const db = createDbClient(c.env.DB);
  const service = new InvoicesService(db);

  try {
    const body = await c.req.json();
    const invoice = await service.createInvoice(body);
    return c.json(invoice, 201);
  } catch (error) {
    console.error(error);
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create invoice",
      },
      400,
    );
  }
}
