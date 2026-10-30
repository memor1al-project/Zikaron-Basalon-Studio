import { Request, Response, NextFunction } from 'express';

/**
 * Security headers middleware.
 * Sets standard security headers on all responses.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  // Prevent MIME-type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // XSS protection (legacy, but still useful for older browsers)
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Enforce HTTPS
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions policy — disable unused browser features
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  // Content Security Policy — this API only returns JSON, kept for defense-in-depth
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "connect-src 'self' https://generativelanguage.googleapis.com",
      "frame-ancestors 'none'",
    ].join('; ')
  );

  next();
}
