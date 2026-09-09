import { Request, Response, NextFunction } from 'express';
import { verifyFirebaseIdToken } from '../services/firebaseRest.js';

export interface AuthenticatedUser {
  id: string;
  uid: string;
  email?: string;
  displayName?: string;
  /** Raw Firebase ID token used by server-side Firebase REST calls. */
  idToken: string;
}

export async function authenticateRequest(req: Request): Promise<AuthenticatedUser | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;

  try {
    const identity = await verifyFirebaseIdToken(token);
    return {
      id: identity.uid,
      uid: identity.uid,
      email: identity.email,
      displayName: identity.displayName,
      idToken: token,
    };
  } catch (err: any) {
    console.error('Firebase ID token verification error:', err?.message || err);
    return null;
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = await authenticateRequest(req);
  if (!user) {
    return res.status(401).json({
      error: 'Chưa xác thực hoặc phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    });
  }
  (req as any).user = user;
  next();
}
