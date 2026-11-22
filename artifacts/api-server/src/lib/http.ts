import type { ErrorRequestHandler } from 'express';
import type { ApiErrorCode } from '@workspace/vexora-core';
import { logger } from './logger';

export class HttpError extends Error {
  constructor(public status: number, public code: ApiErrorCode) { super(code); }
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) { res.status(err.status).json({ error: err.code }); return; }
  if (err?.type === 'entity.parse.failed') { res.status(400).json({ error: 'invalid_input' }); return; }
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'server_error' });
};
