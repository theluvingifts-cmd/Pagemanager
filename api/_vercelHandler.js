import serverBundle from '../.vercel-build/server.cjs';

// esbuild --format=cjs exposes an ESM default export as `default`.
// Node's CJS/ESM interop can also hand us the app directly, so support both.
const app = serverBundle?.default ?? serverBundle;

export default app;
