import { Request, Response, NextFunction } from 'express';
import { getAdminAuth, isFirebaseAdminConfigured } from '../services/firebaseAdmin';

export interface AuthenticatedUser {
  id: string; // Firebase Auth UID
  uid: string;
  email?: string;
  displayName?: string;
}

export async function authenticateRequest(req: Request): Promise<AuthenticatedUser | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split('Bearer ')[1]?.trim();
  if (!token) return null;

  try {
    if (isFirebaseAdminConfigured()) {
      const decoded = await getAdminAuth().verifyIdToken(token);
      return {
        id: decoded.uid,
        uid: decoded.uid,
        email: decoded.email,
        displayName: decoded.name,
      };
    }
  } catch (err: any) {
    console.error('Firebase verifyIdToken error:', err.message);
  }

  return null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = await authenticateRequest(req);
  if (!user) {
    return res.status(401).json({ error: 'Chưa xác thực hoặc phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' });
  }
  (req as any).user = user;
  next();
}
