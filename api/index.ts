import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const serverModule = require('../.vercel-build/server.cjs');
const app = serverModule?.default ?? serverModule;

export default app;
