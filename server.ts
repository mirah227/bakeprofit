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
  deletePendingReservation,
  DuplicatePendingCheckoutError,
  findPendingTransactionsForUserPlan,
  findTransactionByReference,
  getUserPremiumState,
  markPendingTransactionStatus,
  SupabaseSchemaNotReadyError,
  updateReservedTransactionReference,
  updateTransactionAndSubscription,
  withInitiationLock,
  withTransactionLock,
} from './server/paymentStore.ts';
import type { PaymentTransactionRecord, TransactionStatus } from './server/paymentStore.ts';
import {
  checkSupabaseSchemaHealth,
  getAuthenticatedSupabaseUser,
  getSupabaseEnv,
} from './server/supabase.ts';

function resolvePort(): number {
  const portFlagIndex = process.argv.indexOf('--port');
  if (portFlagIndex !== -1 && process.argv[portFlagIndex + 1]) {
    const parsed = Number(process.argv[portFlagIndex + 1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  if (process.env.PORT) return Number(process.env.PORT);
  return 3000;
}

const PORT = resolvePort();

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
  const forwardedFirst = Array.isArray(forwarded)
    ? forwarded[0]
    : typeof forwarded === 'string'
      ? forwarded.split(',')[0]
      : '';
  const rawIp = (forwardedFirst || req.ip || req.socket.remoteAddress || '').trim();
  return rawIp.replace(/^::ffff:/, '').trim();
}

async function verifyAndFinalizeTransactionUnlocked(
  existing: PaymentTransactionRecord,
  source: 'callback' | 'webhook' | 'manual',
  expectedUserId?: string
): Promise<{
  outcome: 'successful' | 'pending' | 'failed' | 'abandoned' | 'reversed' | 'not_found' | 'error';
  message: string;
  transaction?: PaymentTransactionRecord;
}> {
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

  const verifiedAmount = Number(data.amount);
  if (!Number.isFinite(verifiedAmount) || verifiedAmount !== existing.expectedAmount) {
    return {
      outcome: 'error',
      message: `Amount mismatch: expected ₦${existing.expectedAmount}, got ₦${data.amount ?? 'unknown'}.`,
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

  // Never downgrade an already verified successful transaction unless Novac confirms reversal
  if (existing.status === 'successful' && novacStatus !== 'reversed') {
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
  const initial = await findTransactionByReference(reference);
  if (!initial) {
    return {
      outcome: 'not_found',
      message: 'Transaction reference was not found in database records.',
    };
  }

  return withTransactionLock(initial.transactionReference, async () => {
    const existing = await findTransactionByReference(initial.transactionReference);
    if (!existing) {
      return {
        outcome: 'not_found',
        message: 'Transaction reference was not found in database records.',
      };
    }
    return verifyAndFinalizeTransactionUnlocked(existing, source, expectedUserId);
  });
}

async function startServer() {
  const app = express();

  app.set('trust proxy', true);

  // Official Novac Webhook IP Whitelisting (runs before JSON body parsing)
  const webhookIpWhitelist = (req: Request, res: Response, next: NextFunction) => {
    const config = getNovacConfig();
    const clientIp = normalizeClientIp(req);
    if (config.allowedWebhookIps.includes(clientIp)) {
      return next();
    }
    console.warn(`[Novac Test Webhook] Blocked unauthorized IP: ${clientIp}`);
    return res.status(403).json({ error: 'Forbidden' });
  };

  // Dedicated Novac TEST Webhook Endpoint (POST only; live webhooks are intentionally not active)
  app.post(
    '/api/webhooks/novac/test',
    webhookIpWhitelist,
    express.json(),
    async (req: Request, res: Response) => {
      const config = getNovacConfig();
      if (config.mode !== 'test') {
        return res.status(403).json({
          error: 'Novac test webhook endpoint is disabled outside test mode.',
        });
      }

      if (!getSupabaseEnv().isServerConfigured) {
        return res.status(503).json({ received: false, error: 'Database not configured' });
      }

      const payload = req.body as {
        notify?: string;
        notifyType?: string;
        data?: {
          id?: number | string;
          domain?: string;
          transactionReference?: string;
          reference?: string;
          status?: string;
        };
      };

      const payloadDomain = String(payload?.data?.domain || '').trim().toLowerCase();
      if (payloadDomain && payloadDomain !== 'test') {
        console.warn(`[Novac Test Webhook] Ignored non-test domain event: ${payloadDomain}`);
        return res.status(200).json({ received: true, ignored: 'live_webhooks_not_active' });
      }

      const reference = String(
        payload?.data?.transactionReference || payload?.data?.reference || ''
      ).trim();
      const notify = String(payload?.notify || 'event').trim().toLowerCase();
      const notifyType = String(payload?.notifyType || payload?.data?.status || '')
        .trim()
        .toLowerCase();

      if (!reference) {
        return res.status(200).json({ received: true, ignored: 'missing_reference' });
      }

      try {
        const initialTx = await findTransactionByReference(reference);
        if (!initialTx) {
          return res.status(200).json({ received: true, ignored: 'unknown_reference' });
        }

        if (initialTx.environment !== 'test') {
          return res.status(200).json({ received: true, ignored: 'non_test_transaction' });
        }

        const result = await withTransactionLock(initialTx.transactionReference, async () => {
          const tx = await findTransactionByReference(initialTx.transactionReference);
          if (!tx) {
            return { statusCode: 200, body: { received: true, ignored: 'unknown_reference' } };
          }

          const dataIdPart =
            payload?.data?.id !== undefined && payload?.data?.id !== null
              ? String(payload.data.id)
              : '';
          const eventKey = dataIdPart ? `${notify}:${notifyType}:${dataIdPart}` : `${notify}:${notifyType}`;

          const alreadyRecordedEvent = tx.webhookEvents.includes(eventKey);
          const alreadySameStatus =
            (notifyType === 'successful' && tx.status === 'successful') ||
            (notifyType === 'reversed' && tx.status === 'reversed') ||
            ((notifyType === 'failed' || notifyType === 'abandoned') && tx.status === notifyType);

          if (alreadyRecordedEvent || alreadySameStatus) {
            return {
              statusCode: 200,
              body: { received: true, duplicate: true, status: tx.status },
            };
          }

          // Always verify directly with Novac's Verify Transaction API before granting/updating access
          const verification = await verifyAndFinalizeTransactionUnlocked(tx, 'webhook');
          if (verification.outcome === 'error') {
            return {
              statusCode: 500,
              body: { received: false, error: verification.message },
            };
          }

          await appendWebhookEvent(tx.transactionReference, eventKey);

          return {
            statusCode: 200,
            body: { received: true, status: verification.outcome },
          };
        });

        return res.status(result.statusCode).json(result.body);
      } catch (err) {
        console.error('[Novac Test Webhook] Processing error:', err);
        return res.status(500).json({ received: false });
      }
    }
  );

  app.all('/api/webhooks/novac/test', (_req: Request, res: Response) => {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed. Novac webhooks must use POST.' });
  });

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
      if (err instanceof SupabaseSchemaNotReadyError) {
        return res.status(503).json({
          error: err.message,
          mode: getNovacConfig().mode,
          isPremium: false,
          recentTransactions: [],
        });
      }
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Unable to fetch premium status from Supabase.',
      });
    }
  });

  // Initiate Novac checkout for authenticated Supabase user
  const PENDING_CHECKOUT_TTL_MS = 15 * 60 * 1000;

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

      const initiationResult = await withInitiationLock(
        `${user.id}:${plan.id}:${config.mode}`,
        async () => {
          // 1. Server-side premium entitlement check (never rely on frontend button state alone)
          const { account } = await getUserPremiumState(user.id);
          if (account.isPremium) {
            return {
              statusCode: 409,
              body: {
                error: 'Your BakeProfit account already has active Premium access.',
                code: 'ALREADY_PREMIUM',
                transactionReference: account.transactionReference ?? null,
              },
            };
          }

          // 2. Database-backed check for existing pending checkouts for the same user, plan & mode
          const pendingList = await findPendingTransactionsForUserPlan(
            user.id,
            plan.id,
            config.mode
          );

          for (const pendingTx of pendingList) {
            let outcome: string = 'pending';
            try {
              const verified = await verifyAndFinalizeTransaction(
                pendingTx.transactionReference,
                'manual',
                user.id
              );
              outcome = verified.outcome;
            } catch {
              outcome = 'error';
            }

            if (outcome === 'successful') {
              return {
                statusCode: 409,
                body: {
                  error: 'Your payment has already been verified and Premium is now active.',
                  code: 'ALREADY_PREMIUM',
                  transactionReference: pendingTx.transactionReference,
                },
              };
            }

            const alreadyClosed =
              outcome === 'failed' || outcome === 'abandoned' || outcome === 'reversed';
            if (alreadyClosed) {
              continue;
            }

            const createdMs = Date.parse(pendingTx.createdAt);
            const ageMs = Number.isFinite(createdMs) ? Date.now() - createdMs : 0;

            if (ageMs < PENDING_CHECKOUT_TTL_MS || outcome === 'error') {
              return {
                statusCode: 409,
                body: {
                  error:
                    'A checkout for this plan is already in progress. Please complete or verify your pending payment before starting another.',
                  code: 'PENDING_CHECKOUT_EXISTS',
                  transactionReference: pendingTx.transactionReference,
                },
              };
            }

            // Stale unpaid checkout (>15 min) confirmed not paid on Novac: retire before creating a new one
            await markPendingTransactionStatus(
              pendingTx.transactionReference,
              'abandoned',
              'Superseded after checkout timeout'
            );
          }

          // 3. Reserve a pending transaction row in Supabase BEFORE calling Novac
          const generatedRef = generateTransactionReference();
          const now = new Date().toISOString();

          try {
            await createPendingTransaction({
              transactionReference: generatedRef,
              requestedReference: null,
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
          } catch (reserveErr) {
            if (reserveErr instanceof DuplicatePendingCheckoutError) {
              return {
                statusCode: 409,
                body: {
                  error:
                    'A checkout for this plan is already in progress. Please wait a moment or verify your pending payment.',
                  code: 'PENDING_CHECKOUT_EXISTS',
                },
              };
            }
            throw reserveErr;
          }

          const origin = resolveAppOrigin(req);
          const redirectUrl = `${origin}/payment/callback`;

          try {
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

            if (novacResult.transactionReference !== generatedRef) {
              await updateReservedTransactionReference(
                generatedRef,
                novacResult.transactionReference
              );
            }

            return {
              statusCode: 200,
              body: {
                transactionReference: novacResult.transactionReference,
                paymentRedirectUrl: novacResult.paymentRedirectUrl,
                amount: plan.amount,
                currency: plan.currency,
                plan: plan.id,
                environment: config.mode,
              },
            };
          } catch (novacErr) {
            await deletePendingReservation(generatedRef);
            throw novacErr;
          }
        }
      );

      return res.status(initiationResult.statusCode).json(initiationResult.body);
    } catch (err) {
      if (err instanceof SupabaseSchemaNotReadyError) {
        return res.status(503).json({
          error: err.message,
        });
      }
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

  // Live payment webhooks are intentionally not created or activated yet.

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    process.env.VITE_CONFIG_NATIVE_IGNORE_WARNING ??= 'true';
    const vitePromise = (async () => {
      const { createServer: createViteServer } = await import('vite');
      return createViteServer({
        server: { middlewareMode: true, hmr: false, ws: false, allowedHosts: true },
        appType: 'spa',
      });
    })();

    vitePromise.catch((err) => {
      console.error('Failed to initialize Vite dev middleware:', err);
      process.exit(1);
    });

    app.use((req: Request, res: Response, next: NextFunction) => {
      vitePromise
        .then((vite) => vite.middlewares(req, res, next))
        .catch(next);
    });
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
