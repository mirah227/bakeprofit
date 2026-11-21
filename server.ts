import 'dotenv/config';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { createApiApp } from './server/app.ts';
import { getNovacConfig } from './server/config.ts';
import { getSupabaseEnv } from './server/supabase.ts';

function resolvePort(): number {
  const portFlagIndex = process.argv.indexOf('--port');
  if (portFlagIndex !== -1 && process.argv[portFlagIndex + 1]) {
    const parsed = Number(process.argv[portFlagIndex + 1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const eqPortArg = process.argv.find((arg) => arg.startsWith('--port='));
  if (eqPortArg) {
    const parsed = Number(eqPortArg.slice('--port='.length));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const envPort = process.env.PORT ? Number(process.env.PORT) : NaN;
  const isProd = process.env.NODE_ENV === 'production';
  // In Google AI Studio containers, PORT=8080 is bound by Nginx which proxies to Express on 3000.
  if (Number.isFinite(envPort) && envPort > 0 && (isProd || envPort !== 8080)) {
    return envPort;
  }
  return 3000;
}

function resolveHost(): string {
  const hostFlagIndex = process.argv.indexOf('--host');
  if (hostFlagIndex !== -1 && process.argv[hostFlagIndex + 1]) {
    return process.argv[hostFlagIndex + 1];
  }
  const eqHostArg = process.argv.find((arg) => arg.startsWith('--host='));
  if (eqHostArg) {
    return eqHostArg.slice('--host='.length) || '0.0.0.0';
  }
  return '0.0.0.0';
}

function resolvePreviewWsOptions(): {
  protocol?: 'wss' | 'ws';
  clientPort?: number;
} {
  const appUrl = process.env.APP_URL?.trim();
  if (!appUrl || !/^https?:\/\//i.test(appUrl)) {
    return {};
  }
  try {
    const parsed = new URL(appUrl);
    if (parsed.protocol === 'https:') {
      return {
        protocol: 'wss',
        clientPort: parsed.port ? Number(parsed.port) : 443,
      };
    }
    return {};
  } catch {
    return {};
  }
}

const PORT = resolvePort();
const HOST = resolveHost();

async function startServer() {
  const app = createApiApp();
  const httpServer = http.createServer(app);

  httpServer.on('error', (err) => {
    console.error(`BakeProfit HTTP server error on ${HOST}:${PORT}:`, err);
    process.exit(1);
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    process.env.VITE_CONFIG_NATIVE_IGNORE_WARNING ??= 'true';
    const previewWs = resolvePreviewWsOptions();

    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
        ws: {
          server: httpServer,
          ...previewWs,
        },
        allowedHosts: true,
      },
      appType: 'spa',
    });

    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        return res.sendFile(indexFile);
      }
      return res.status(404).send('Build not found. Run npm run build.');
    });
  }

  httpServer.listen(PORT, HOST, () => {
    const novacCfg = getNovacConfig();
    const sbEnv = getSupabaseEnv();
    console.log(
      `BakeProfit server listening on http://${HOST}:${PORT} (Supabase configured: ${sbEnv.isServerConfigured}, Novac mode: ${novacCfg.mode})`
    );
  });
}

startServer().catch((err) => {
  console.error('Failed to start BakeProfit server:', err);
  process.exit(1);
});
