import { Request, Response, NextFunction } from 'express';
import * as admin from 'firebase-admin';

export interface AuthedRequest extends Request {
  uid?: string;
}

/**
 * Requires a valid Firebase Auth ID token in the Authorization header.
 * This is a plain auth gate — it does not scope any Firestore access itself
 * (persistence happens client-side under firestore.rules' owner-only checks).
 */
export async function verifyFirebaseAuth(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }

  const idToken = header.slice('Bearer '.length);
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.uid = decoded.uid;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
