import app from '../server';

/**
 * Vercel serves the Vite build as static files and sends only /api/* here.
 *
 * vercel.json rewrites:
 *   /api/facebook/status
 * -> /api?__pm_path=facebook/status
 *
 * Rebuild the original Express URL so all existing routes keep working without
 * duplicating every API endpoint as a separate Vercel Function.
 */
export default function handler(req: any, res: any) {
  try {
    const parsed = new URL(req.url || '/api', 'http://pagemanager.local');
    const rewrittenPath = parsed.searchParams.get('__pm_path');

    if (rewrittenPath !== null) {
      parsed.searchParams.delete('__pm_path');
      const query = parsed.searchParams.toString();
      const cleanPath = String(rewrittenPath)
        .replace(/^\/+/, '')
        .replace(/\/+$/, '');

      req.url = `/api${cleanPath ? `/${cleanPath}` : ''}${query ? `?${query}` : ''}`;
    }
  } catch (error) {
    console.error('[Vercel API router] Không thể khôi phục request URL:', error);
  }

  return app(req, res);
}
