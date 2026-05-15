import { z } from 'zod';

export const ValidatorResultSchema = z.object({
  ok: z.boolean(),
  errors: z.array(z.string()),
});

export type ValidatorResult = z.infer<typeof ValidatorResultSchema>;

export const ok = (): ValidatorResult => ({ ok: true, errors: [] });
export const fail = (...errors: string[]): ValidatorResult => ({ ok: false, errors });
