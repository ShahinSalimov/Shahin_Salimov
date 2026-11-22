import type { z } from 'zod/v4';
import { HttpError } from './http';

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, 'invalid_input');
  return r.data;
}
