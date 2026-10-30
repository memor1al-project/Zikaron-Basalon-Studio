import { Request, Response, NextFunction } from 'express';

/**
 * Input validation middleware.
 * Rejects oversized payloads and validates content types.
 * These routes receive either small JSON bodies (text content) or a base64-encoded
 * audio clip (client-side compressed/chunked to Gemini's ~20MB inline-audio ceiling,
 * which becomes ~27MB once base64-encoded — see transcriptionService.ts on the client).
 */

const MAX_JSON_SIZE = 30 * 1024 * 1024; // 30MB — fits a 20MB audio clip base64-encoded (~27MB) plus headroom

export function validateInput(req: Request, res: Response, next: NextFunction): void {
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);

  if (contentLength > MAX_JSON_SIZE) {
    res.status(413).json({
      error: 'Payload too large',
      message: `Maximum size: ${MAX_JSON_SIZE / (1024 * 1024)}MB`,
    });
    return;
  }

  if (['POST', 'PUT', 'PATCH'].includes(req.method || '')) {
    const contentType = req.headers['content-type'] || '';
    if (contentLength > 0 && !contentType.includes('application/json')) {
      res.status(415).json({
        error: 'Unsupported media type',
        message: 'Content-Type must be application/json',
      });
      return;
    }
  }

  next();
}
