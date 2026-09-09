let appPromise: Promise<any> | null = null;

async function loadApp() {
  if (!appPromise) {
    appPromise = import('../.vercel-build/server.cjs').then((mod: any) => {
      let app = mod?.default ?? mod;

      // esbuild CJS bundle of an ESM default export can be wrapped twice:
      // import(CJS) -> { default: { default: expressApp } }
      if (app && typeof app !== 'function' && typeof app.default === 'function') {
        app = app.default;
      }

      if (typeof app !== 'function') {
        throw new TypeError(
          `[PAGE MANAGER] Invalid backend export: expected Express app function, got ${typeof app}`
        );
      }

      return app;
    });
  }

  return appPromise;
}

export default async function handler(req: any, res: any) {
  try {
    const app = await loadApp();
    return app(req, res);
  } catch (error: any) {
    console.error('[PAGE MANAGER] Vercel API boot failed:', error);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: error?.message || 'Vercel API boot failed',
        code: error?.code || 'API_BOOT_FAILED',
      });
    }

    throw error;
  }
}
