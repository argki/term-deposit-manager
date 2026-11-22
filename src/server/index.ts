import { serve } from '@hono/node-server';
import path from 'node:path';
import { createApp } from './app.js';
import { createStoreRepository } from './store.js';

const port = Number(process.env.PORT ?? 3457);
const dataDir = process.env.DATA_DIR ?? path.resolve(process.cwd(), 'data');
const clientDistDir = path.resolve(process.cwd(), 'dist', 'client');

const repo = createStoreRepository(dataDir);
const app = createApp(repo, clientDistDir);

serve(
  {
    fetch: app.fetch,
    port,
    hostname: '0.0.0.0',
  },
  (info) => {
    console.log(`Term Deposit Manager server listening on http://127.0.0.1:${info.port}`);
  },
);
