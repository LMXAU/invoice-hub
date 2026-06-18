import { z } from 'zod';

export const ErrorResponseSchema = z.object({
  statusCode: z.number(),
  message: z.string(),
  error: z.string(),
  timestamp: z.string().datetime(),
  path: z.string().optional(),
});


export const commonErrors = {
  400: ErrorResponseSchema.describe('Bad Request'),
  401: ErrorResponseSchema.describe('Unauthorized'),
  403: ErrorResponseSchema.describe('Forbidden'),
  404: ErrorResponseSchema.describe('Not Found'),
  500: ErrorResponseSchema.describe('Internal Server Error'),
};