import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { getNovacConfig, PREMIUM_PLANS } from './server/config.ts';
import type { PremiumPlanId } from './server/config.ts';
import {
  generateTransactionReference,
  initiateNovacCheckout,
  verifyNovacTransaction,
} from './server/novac.ts';
import {
  appendWebhookEvent,
  createPendingTransaction,
  findTransactionByReference,
  getUserPremiumState,
  markPendingTransactionStatus,
  updateTransactionAndSubscription,
  withTransactionLock,
} from './server/paymentStore.ts';
import type { PaymentTransactionRecord, TransactionStatus } from './server/paymentStore.ts';
import {
  checkSupabaseSchemaHealth,
  getAuthenticatedSupabaseUser,
  getSupabaseEnv,
} from './server/supabase.ts';

const PORT = Number(process.env.PORT || 3000);

function resolveAppOrigin(req: Request): string {
  const configured = process.env.APP_URL?.trim();
  if (configured && configured !== 'MY_APP_URL' && /^https?:\/\//i.test(configured)) {
    return configured.replace(/\/+$/, '');
  }
  const proto =
    String(req.headers['x-forwarded-proto'] || req.protocol || 'http')
      .split(',')[0]
      .trim();
  const host = String(req.headers['x-forwarded-host'] || req.get('host') || `localhost:${PORT}`)
    .split(',')[0]
    .trim();
  return `${proto}://${host}`;
}

function normalizeClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const rawIp =
    typeof forwarded === 'string' && forwarded.length > 0
      ? forwarded.split(',')[0].trim()
      : req.ip || req.socket.remoteAddress || '';
  return rawIp.replace(/^::ffff:/, '').trim();
}

async function verifyAndFinalizeTransaction(
  reference: string,
  source: 'callback' | 'webhook' | 'manual',
  expectedUserId?: string
): Promise<{
  outcome: 'successful' | 'pending' | 'failed' | 'abandoned' | 'reversed' | 'not_found' | 'error';
  message: string;
  transaction?: PaymentTransactionRecord;
}> {
  return withTransactionLock(reference, async () => {
    const existing = await findTransactionByReference(reference);
    if (!existing) {
      return {
        outcome: 'not_found',
        message: 'Transaction reference was not found in database records.',
      };
    }

    if (expectedUserId && existing.userId !== expectedUserId) {
      return {
        outcome: 'error',
        message: 'Transaction reference does not belong to the signed-in user.',
      };
    }

    // Prevent duplicate processing once verified successful (unless webhook checks reversal)
    if (existing.status === 'successful' && source !== 'webhook') {
      return {
        outcome: 'successful',
        message: 'Payment already verified.',
        transaction: existing,
      };
    }

    const config = getNovacConfig();
    if (!config.isConfigured) {
      return {
        outcome: 'error',
        message: config.keyMismatchError || `Novac keys missing: ${config.missingKeys.join(', ')}`,
      };
    }

    const verifyResponse = await verifyNovacTransaction(config, existing.transactionReference);
    if (!verifyResponse.status || !verifyResponse.data) {
      return {
        outcome: 'error',
        message: verifyResponse.message || 'Could not verify transaction with Novac.',
      };
    }

    const data = verifyResponse.data;
    const novacStatus = String(data.status || '').toLowerCase() as TransactionStatus;

    if (
      data.transactionReference &&
      data.transactionReference !== existing.transactionReference
    ) {
      return {
        outcome: 'error',
        message: 'Transaction reference mismatch during Novac verification.',
      };
    }

    const verifiedCurrency = String(data.currency || '').toUpperCase();
    if (verifiedCurrency && verifiedCurrency !== existing.currency) {
      return {
        outcome: 'error',
        message: `Currency mismatch: expected ${existing.currency}, got ${verifiedCurrency}.`,
      };
    }

    const verifiedAmount = Number(data.amount ?? 0);
    if (
      Number.isFinite(verifiedAmount) &&
      verifiedAmount > 0 &&
      verifiedAmount !== existing.expectedAmount
    ) {
      return {
        outcome: 'error',
        message: `Amount mismatch: expected ₦${existing.expectedAmount}, got ₦${verifiedAmount}.`,
      };
    }

    const verifiedDomain = String(data.domain || '').toLowerCase();
    if (verifiedDomain && verifiedDomain !== config.mode) {
      return {
        outcome: 'error',
        message: `Environment mismatch: server is in ${config.mode} mode but Novac returned ${verifiedDomain}.`,
      };
    }

    // Idempotency guard for concurrent webhook + callback
    if (existing.status === 'successful' && novacStatus === 'successful') {
      return {
        outcome: 'successful',
        message: 'Payment already verified.',
        transaction: existing,
      };
    }

    const now = new Date().toISOString();
    const mappedStatus: TransactionStatus =
      novacStatus === 'successful' ||
      novacStatus === 'failed' ||
      novacStatus === 'abandoned' ||
      novacStatus === 'reversed'
        ? novacStatus
        : 'pending';

    const updated = await updateTransactionAndSubscription({
      transactionReference: existing.transactionReference,
      userId: existing.userId,
      plan: existing.plan,
      expectedAmount: existing.expectedAmount,
      currency: existing.currency,
      environment: existing.environment,
      nextStatus: mappedStatus,
      novacTransactionId: data.id ?? existing.novacTransactionId,
      chargedAmount: data.chargedAmount ?? existing.chargedAmount,
      channel: data.channel ?? existing.channel,
      gatewayResponseCode: data.gatewayResponseCode ?? existing.gatewayResponseCode,
      gatewayResponseMessage: data.gatewayResponseMessage ?? existing.gatewayResponseMessage,
      verifiedAt: mappedStatus === 'successful' ? existing.verifiedAt || now : existing.verifiedAt,
      verificationSource:
        mappedStatus === 'successful' ? existing.verificationSource || source : existing.verificationSource,
    });

    return {
      outcome: updated.status,
      message:
        updated.status === 'successful'
          ? 'Payment verified successfully.'
          : updated.gatewayResponseMessage || `Transaction status is ${updated.status}.`,
      transaction: updated,
    };
  });
}

async function startServer() {
  const app = express();

  app.set('trust proxy', true);
  app.use(express.json());

  // Public Supabase client configuration (exposes ONLY url and publishableKey; NEVER secretKey)
  app.get('/api/supabase/config', (_req: Request, res: Response) => {
    const env = getSupabaseEnv();
    res.json({
      url: env.url,
      publishableKey: env.publishableKey,
      isConfigured: env.isClientConfigured,
      missingKeys: env.missingClientKeys,
    });
  });

  // Live Supabase database & schema check
  app.get('/api/supabase/health', async (_req: Request, res: Response) => {
    const health = await checkSupabaseSchemaHealth();
    res.status(health.connected ? 200 : 503).json(health);
  });

  // Safe Novac payment configuration summary
  app.get('/api/payments/config', (_req: Request, res: Response) => {
    const config = getNovacConfig();
    res.json({
      mode: config.mode,
      isConfigured: config.isConfigured,
      missingKeys: config.missingKeys,
      keyMismatchError: config.keyMismatchError,
      monthlyConfigured: config.monthlyConfigured,
      plans: Object.values(PREMIUM_PLANS),
    });
  });

  // Verified premium status retrieved from Supabase database for authenticated user
  app.get('/api/premium/status', async (req: Request, res: Response) => {
    try {
      const config = getNovacConfig();
      const supabaseEnv = getSupabaseEnv();

      if (!supabaseEnv.isServerConfigured) {
        return res.status(503).json({
          error: `Supabase server keys missing (${supabaseEnv.missingServerKeys.join(', ')}).`,
          mode: config.mode,
          isPremium: false,
          recentTransactions: [],
        });
      }

      const user = await getAuthenticatedSupabaseUser(req);
      if (!user) {
        return res.json({
          authenticated: false,
          mode: config.mode,
          isPremium: false,
          plan: null,
          transactionReference: null,
          amountPaid: null,
          currency: 'NGN',
          status: null,
          environment: config.mode,
          unlockedAt: null,
          recentTransactions: [],
        });
      }

      const { account, transactions } = await getUserPremiumState(user.id);
      return res.json({
        authenticated: true,
        mode: config.mode,
        isPremium: account.isPremium,
        plan: account.plan ?? null,
        transactionReference: account.transactionReference ?? null,
        amountPaid: account.amountPaid ?? null,
        currency: account.currency ?? 'NGN',
        status: account.status ?? null,
        environment: account.environment ?? config.mode,
        unlockedAt: account.unlockedAt ?? null,
        recentTransactions: transactions.map((t) => ({
          transactionReference: t.transactionReference,
          plan: t.plan,
          expectedAmount: t.expectedAmount,
          currency: t.currency,
          status: t.status,
          environment: t.environment,
          createdAt: t.createdAt,
          verifiedAt: t.verifiedAt ?? null,
        })),
      });
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Unable to fetch premium status from Supabase.',
      });
    }
  });

  // Initiate Novac checkout for authenticated Supabase user
  app.post('/api/payments/initiate', async (req: Request, res: Response) => {
    try {
      const supabaseEnv = getSupabaseEnv();
      if (!supabaseEnv.isServerConfigured) {
        return res.status(503).json({
          error: `Supabase server credentials are missing (${supabaseEnv.missingServerKeys.join(', ')}).`,
        });
      }

      const user = await getAuthenticatedSupabaseUser(req);
      if (!user) {
        return res.status(401).json({
          error: 'Please sign in to your BakeProfit account before upgrading to Premium.',
        });
      }

      const config = getNovacConfig();
      if (!config.isConfigured) {
        return res.status(503).json({
          error:
            config.keyMismatchError ||
            `Novac test credentials are missing on the server (${config.missingKeys.join(', ')}).`,
          missingKeys: config.missingKeys,
          mode: config.mode,
        });
      }

      const body = req.body as {
        plan?: string;
        email?: string;
        firstName?: string;
        lastName?: string;
        phoneNumber?: string;
      };

      const planId: PremiumPlanId = body.plan === 'monthly' ? 'monthly' : 'onetime';
      const plan = PREMIUM_PLANS[planId];

      const email = String(body.email || user.email || '').trim();
      const firstName = String(body.firstName || '').trim();
      const lastName = String(body.lastName || '').trim();
      const phoneNumber = String(body.phoneNumber || '').trim();

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
      }
      if (!firstName || !lastName) {
        return res.status(400).json({ error: 'Please enter your first and last name.' });
      }

      const generatedRef = generateTransactionReference();
      const origin = resolveAppOrigin(req);
      const redirectUrl = `${origin}/payment/callback`;

      const novacResult = await initiateNovacCheckout({
        config,
        transactionReference: generatedRef,
        amount: plan.amount,
        currency: plan.currency,
        redirectUrl,
        customer: {
          email,
          firstName,
          lastName,
          phoneNumber,
        },
        plan: plan.id,
        accountId: user.id,
      });

      const now = new Date().toISOString();
      await createPendingTransaction({
        transactionReference: novacResult.transactionReference,
        requestedReference:
          novacResult.transactionReference !== generatedRef ? generatedRef : null,
        userId: user.id,
        plan: plan.id,
        expectedAmount: plan.amount,
        currency: plan.currency,
        environment: config.mode,
        status: 'pending',
        customerEmail: email,
        createdAt: now,
        updatedAt: now,
        webhookEvents: [],
      });

      return res.json({
        transactionReference: novacResult.transactionReference,
        paymentRedirectUrl: novacResult.paymentRedirectUrl,
        amount: plan.amount,
        currency: plan.currency,
        plan: plan.id,
        environment: config.mode,
      });
    } catch (err) {
      return res.status(400).json({
        error: err instanceof Error ? err.message : 'Unable to initiate Novac checkout.',
      });
    }
  });

  // Novac redirect callback handler: verifies server-side and updates Supabase
  app.get('/payment/callback', async (req: Request, res: Response) => {
    const reference = String(req.query.reference || req.query.transactionReference || '').trim();
    const rawQueryStatus = String(req.query.status || '').trim().toLowerCase();

    if (!reference) {
      return res.redirect('/?payment_outcome=cancelled');
    }

    try {
      const verification = await verifyAndFinalizeTransaction(reference, 'callback');
      if (verification.outcome === 'successful') {
        return res.redirect(
          `/?payment_outcome=successful&reference=${encodeURIComponent(reference)}`
        );
      }
      if (verification.outcome === 'failed' || rawQueryStatus === 'failed') {
        return res.redirect(
          `/?payment_outcome=failed&reference=${encodeURIComponent(reference)}`
        );
      }
      if (
        verification.outcome === 'abandoned' ||
        rawQueryStatus === 'cancelled' ||
        rawQueryStatus === 'canceled' ||
        rawQueryStatus === 'abandoned'
      ) {
        return res.redirect(
          `/?payment_outcome=cancelled&reference=${encodeURIComponent(reference)}`
        );
      }
      return res.redirect(
        `/?payment_outcome=${encodeURIComponent(verification.outcome)}&reference=${encodeURIComponent(reference)}`
      );
    } catch {
      return res.redirect(
        `/?payment_outcome=error&reference=${encodeURIComponent(reference)}`
      );
    }
  });

  // Manual server-side verification endpoint for authenticated user
  app.post('/api/payments/verify', async (req: Request, res: Response) => {
    try {
      const user = await getAuthenticatedSupabaseUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required to verify payment.' });
      }

      const reference = String((req.body as { reference?: string })?.reference || '').trim();
      if (!reference) {
        return res.status(400).json({ error: 'Transaction reference is required.' });
      }

      const result = await verifyAndFinalizeTransaction(reference, 'manual', user.id);
      if (result.outcome === 'not_found') {
        return res.status(404).json({ error: result.message, outcome: result.outcome });
      }
      if (result.outcome === 'error') {
        return res.status(400).json({ error: result.message, outcome: result.outcome });
      }

      return res.json({
        outcome: result.outcome,
        message: result.message,
        transaction: result.transaction
          ? {
              transactionReference: result.transaction.transactionReference,
              plan: result.transaction.plan,
              amount: result.transaction.expectedAmount,
              currency: result.transaction.currency,
              status: result.transaction.status,
              environment: result.transaction.environment,
              verifiedAt: result.transaction.verifiedAt ?? null,
            }
          : null,
      });
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Payment verification failed.',
      });
    }
  });

  // Official Novac Webhook Receiver with IP Whitelisting + Server-Side Verification + Supabase persistence
  const webhookIpWhitelist = (req: Request, res: Response, next: NextFunction) => {
    const config = getNovacConfig();
    const clientIp = normalizeClientIp(req);
    if (config.allowedWebhookIps.includes(clientIp)) {
      return next();
    }
    console.warn(`[Novac Webhook] Blocked unauthorized IP: ${clientIp}`);
    return res.status(403).json({ error: 'Forbidden' });
  };

  app.post('/api/webhooks/novac', webhookIpWhitelist, async (req: Request, res: Response) => {
    const payload = req.body as {
      notify?: string;
      notifyType?: string;
      data?: {
        transactionReference?: string;
        reference?: string;
        status?: string;
      };
    };

    const reference = String(
      payload?.data?.transactionReference || payload?.data?.reference || ''
    ).trim();
    const notifyType = String(payload?.notifyType || payload?.data?.status || '').toLowerCase();

    if (!reference) {
      return res.status(200).json({ received: true, ignored: 'missing_reference' });
    }

    try {
      const tx = await findTransactionByReference(reference);
      if (!tx) {
        return res.status(200).json({ received: true, ignored: 'unknown_reference' });
      }

      const eventKey = `${payload?.notify || 'event'}:${notifyType}`;
      await appendWebhookEvent(tx.transactionReference, eventKey);

      if (notifyType === 'successful' || notifyType === 'reversed') {
        await verifyAndFinalizeTransaction(tx.transactionReference, 'webhook');
      } else if (notifyType === 'failed' || notifyType === 'abandoned') {
        await markPendingTransactionStatus(
          tx.transactionReference,
          notifyType as 'failed' | 'abandoned'
        );
      }

      return res.status(200).json({ received: true });
    } catch (err) {
      console.error('[Novac Webhook] Processing error:', err);
      return res.status(500).json({ received: false });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
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

  app.listen(PORT, '0.0.0.0', () => {
    const novacCfg = getNovacConfig();
    const sbEnv = getSupabaseEnv();
    console.log(
      `BakeProfit server listening on http://0.0.0.0:${PORT} (Supabase configured: ${sbEnv.isServerConfigured}, Novac mode: ${novacCfg.mode})`
    );
  });
}

startServer().catch((err) => {
  console.error('Failed to start BakeProfit server:', err);
  process.exit(1);
});
