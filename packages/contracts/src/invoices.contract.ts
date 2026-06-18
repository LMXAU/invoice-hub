import { commonErrors } from './errors';
import { z } from 'zod';

export const createInvoiceBodySchema = z.object({
    desc: z.string(),
    amount: z.number().positive(),
    dueDate: z.string(),
});

export const invoiceResponseSchema = z.object({
    id: z.uuid(),
    desc: z.string(),
    amount: z.number().positive(),
    dueDate: z.string(),
    createdAt: z.iso.datetime(),
});

export type CreateInvoiceBody = z.infer<typeof createInvoiceBodySchema>;
export type InvoiceResponse = z.infer<typeof invoiceResponseSchema>;