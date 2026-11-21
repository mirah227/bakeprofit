import type { NovacEnvironment, PremiumPlanId } from './config.ts';
import { getSupabaseAdmin } from './supabase.ts';

export type TransactionStatus =
  | 'pending'
  | 'successful'
  | 'failed'
  | 'abandoned'
  | 'reversed';

export interface PaymentTransactionRecord {
  id?: string;
  transactionReference: string;
  requestedReference?: string | null;
  userId: string;
  plan: PremiumPlanId;
  expectedAmount: number;
  chargedAmount?: number | null;
  currency: 'NGN';
  environment: NovacEnvironment;
  status: TransactionStatus;
  novacTransactionId?: number | null;
  channel?: string | null;
  gatewayResponseCode?: string | null;
  gatewayResponseMessage?: string | null;
  customerEmail: string;
  createdAt: string;
  updatedAt: string;
  verifiedAt?: string | null;
  verificationSource?: 'callback' | 'webhook' | 'manual' | null;
  webhookEvents: string[];
}

export interface UserPremiumRecord {
  userId: string;
  isPremium: boolean;
  hasOneTimePurchase: boolean;
  hasMonthlySubscription: boolean;
  plan?: PremiumPlanId | null;
  transactionReference?: string | null;
  oneTimeTransactionReference?: string | null;
  monthlyTransactionReference?: string | null;
  amountPaid?: number | null;
  currency?: 'NGN';
  environment?: NovacEnvironment | null;
  status?: TransactionStatus | null;
  unlockedAt?: string | null;
}

export function resolvePlanEntitlements(params: {
  userId: string;
  subRow: SubscriptionRow | null;
  verifiedTransactions: PaymentTransactionRecord[];
}): UserPremiumRecord {
  const { userId, subRow, verifiedTransactions } = params;

  const verifiedOneTimeTx = verifiedTransactions.find(
    (tx) =>
      tx.status === 'successful' &&
      tx.plan === 'onetime' &&
      Number(tx.expectedAmount) >= 1000
  );
  const verifiedMonthlyTx = verifiedTransactions.find(
    (tx) =>
      tx.status === 'successful' &&
      tx.plan === 'monthly' &&
      Number(tx.expectedAmount) >= 2000
  );

  const subIsActive = Boolean(subRow?.is_premium) && subRow?.status === 'successful';
  const subAmount =
    subRow?.amount_paid !== null && subRow?.amount_paid !== undefined
      ? Number(subRow.amount_paid)
      : null;

  const hasOneTimePurchase = Boolean(
    verifiedOneTimeTx ||
      (subIsActive && subRow?.plan === 'onetime' && (subAmount === null || subAmount >= 1000))
  );

  const hasMonthlySubscription = Boolean(
    verifiedMonthlyTx ||
      (subIsActive && subRow?.plan === 'monthly' && subAmount !== null && subAmount >= 2000)
  );

  const isPremium = hasOneTimePurchase || hasMonthlySubscription || subIsActive;
  const primaryVerifiedTx = verifiedMonthlyTx || verifiedOneTimeTx || null;

  if (subRow && isPremium) {
    return {
      userId,
      isPremium,
      hasOneTimePurchase,
      hasMonthlySubscription,
      plan: subRow.plan ?? primaryVerifiedTx?.plan ?? null,
      transactionReference:
        subRow.transaction_reference ?? primaryVerifiedTx?.transactionReference ?? null,
      oneTimeTransactionReference:
        verifiedOneTimeTx?.transactionReference ??
        (subRow.plan === 'onetime' ? subRow.transaction_reference : null),
      monthlyTransactionReference:
        verifiedMonthlyTx?.transactionReference ??
        (subRow.plan === 'monthly' ? subRow.transaction_reference : null),
      amountPaid:
        subAmount ?? (primaryVerifiedTx ? Number(primaryVerifiedTx.expectedAmount) : null),
      currency: subRow.currency || 'NGN',
      environment: subRow.environment ?? primaryVerifiedTx?.environment ?? null,
      status: subRow.status ?? primaryVerifiedTx?.status ?? null,
      unlockedAt: subRow.unlocked_at ?? primaryVerifiedTx?.verifiedAt ?? null,
    };
  }

  return {
    userId,
    isPremium,
    hasOneTimePurchase,
    hasMonthlySubscription,
    plan: primaryVerifiedTx?.plan ?? subRow?.plan ?? null,
    transactionReference:
      primaryVerifiedTx?.transactionReference ?? subRow?.transaction_reference ?? null,
    oneTimeTransactionReference: verifiedOneTimeTx?.transactionReference ?? null,
    monthlyTransactionReference: verifiedMonthlyTx?.transactionReference ?? null,
    amountPaid: primaryVerifiedTx ? Number(primaryVerifiedTx.expectedAmount) : subAmount,
    currency: primaryVerifiedTx?.currency ?? subRow?.currency ?? 'NGN',
    environment: primaryVerifiedTx?.environment ?? subRow?.environment ?? null,
    status: primaryVerifiedTx?.status ?? subRow?.status ?? null,
    unlockedAt: primaryVerifiedTx?.verifiedAt ?? subRow?.unlocked_at ?? null,
  };
}

interface TransactionRow {
  id: string;
  user_id: string;
  transaction_reference: string;
  requested_reference: string | null;
  plan: PremiumPlanId;
  expected_amount: number;
  charged_amount: number | null;
  currency: 'NGN';
  environment: NovacEnvironment;
  status: TransactionStatus;
  novac_transaction_id: number | null;
  channel: string | null;
  gateway_response_code: string | null;
  gateway_response_message: string | null;
  customer_email: string;
  verification_source: 'callback' | 'webhook' | 'manual' | null;
  webhook_events: string[] | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SubscriptionRow {
  user_id: string;
  is_premium: boolean;
  plan: PremiumPlanId | null;
  transaction_reference: string | null;
  amount_paid: number | null;
  currency: 'NGN';
  environment: NovacEnvironment | null;
  status: TransactionStatus | null;
  unlocked_at: string | null;
}

function mapTransactionRow(row: TransactionRow): PaymentTransactionRecord {
  return {
    id: row.id,
    transactionReference: row.transaction_reference,
    requestedReference: row.requested_reference,
    userId: row.user_id,
    plan: row.plan,
    expectedAmount: Number(row.expected_amount),
    chargedAmount: row.charged_amount !== null ? Number(row.charged_amount) : null,
    currency: row.currency || 'NGN',
    environment: row.environment,
    status: row.status,
    novacTransactionId: row.novac_transaction_id,
    channel: row.channel,
    gatewayResponseCode: row.gateway_response_code,
    gatewayResponseMessage: row.gateway_response_message,
    customerEmail: row.customer_email,
    verificationSource: row.verification_source,
    webhookEvents: Array.isArray(row.webhook_events) ? row.webhook_events : [],
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Per-reference mutex to serialize concurrent webhook and callback verification calls
const referenceLocks = new Map<string, Promise<unknown>>();
// Per-user+plan mutex to serialize concurrent checkout initiation requests
const initiationLocks = new Map<string, Promise<unknown>>();

export class DuplicatePendingCheckoutError extends Error {
  constructor(message = 'A pending checkout already exists for this user and plan.') {
    super(message);
    this.name = 'DuplicatePendingCheckoutError';
  }
}

export class SupabaseSchemaNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseSchemaNotReadyError';
  }
}

function isSchemaMissingError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const code = err.code || '';
  const msg = err.message || '';
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    msg.includes('Could not find the table') ||
    msg.includes('does not exist')
  );
}

export function withTransactionLock<T>(
  reference: string,
  task: () => Promise<T>
): Promise<T> {
  const prev = referenceLocks.get(reference) ?? Promise.resolve();
  const next = prev.then(task, task);
  referenceLocks.set(reference, next);
  next.finally(() => {
    if (referenceLocks.get(reference) === next) {
      referenceLocks.delete(reference);
    }
  });
  return next;
}

export function withInitiationLock<T>(
  key: string,
  task: () => Promise<T>
): Promise<T> {
  const prev = initiationLocks.get(key) ?? Promise.resolve();
  const next = prev.then(task, task);
  initiationLocks.set(key, next);
  next.finally(() => {
    if (initiationLocks.get(key) === next) {
      initiationLocks.delete(key);
    }
  });
  return next;
}

export async function createPendingTransaction(
  record: PaymentTransactionRecord
): Promise<void> {
  const admin = getSupabaseAdmin();
  const { error } = await admin.from('payment_transactions').insert({
    user_id: record.userId,
    transaction_reference: record.transactionReference,
    requested_reference: record.requestedReference ?? null,
    plan: record.plan,
    expected_amount: record.expectedAmount,
    currency: record.currency,
    environment: record.environment,
    status: 'pending',
    customer_email: record.customerEmail,
    webhook_events: record.webhookEvents,
  });

  if (error) {
    if (error.code === '23505') {
      throw new DuplicatePendingCheckoutError();
    }
    throw new Error(`Failed to record payment transaction in Supabase: ${error.message}`);
  }
}

export async function findPendingTransactionsForUserPlan(
  userId: string,
  plan: PremiumPlanId,
  environment: NovacEnvironment
): Promise<PaymentTransactionRecord[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('payment_transactions')
    .select('*')
    .eq('user_id', userId)
    .eq('plan', plan)
    .eq('environment', environment)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .returns<TransactionRow[]>();

  if (error) {
    throw new Error(`Failed to check pending transactions in Supabase: ${error.message}`);
  }

  return (data ?? []).map(mapTransactionRow);
}

export async function updateReservedTransactionReference(
  reservedReference: string,
  actualReference: string
): Promise<void> {
  if (!actualReference || actualReference === reservedReference) return;
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from('payment_transactions')
    .update({
      transaction_reference: actualReference,
      requested_reference: reservedReference,
    })
    .eq('transaction_reference', reservedReference)
    .eq('status', 'pending');

  if (error) {
    throw new Error(`Failed to update transaction reference in Supabase: ${error.message}`);
  }
}

export async function deletePendingReservation(transactionReference: string): Promise<void> {
  const admin = getSupabaseAdmin();
  await admin
    .from('payment_transactions')
    .delete()
    .eq('transaction_reference', transactionReference)
    .eq('status', 'pending');
}

export async function findTransactionByReference(
  reference: string
): Promise<PaymentTransactionRecord | null> {
  const admin = getSupabaseAdmin();
  const { data: direct, error: directErr } = await admin
    .from('payment_transactions')
    .select('*')
    .eq('transaction_reference', reference)
    .maybeSingle<TransactionRow>();

  if (directErr) {
    throw new Error(`Failed to query payment transaction: ${directErr.message}`);
  }
  if (direct) return mapTransactionRow(direct);

  const { data: fallback, error: fallbackErr } = await admin
    .from('payment_transactions')
    .select('*')
    .eq('requested_reference', reference)
    .maybeSingle<TransactionRow>();

  if (fallbackErr) {
    throw new Error(`Failed to query payment transaction: ${fallbackErr.message}`);
  }
  return fallback ? mapTransactionRow(fallback) : null;
}

export async function updateTransactionAndSubscription(params: {
  transactionReference: string;
  userId: string;
  plan: PremiumPlanId;
  expectedAmount: number;
  currency: 'NGN';
  environment: NovacEnvironment;
  nextStatus: TransactionStatus;
  novacTransactionId?: number | null;
  chargedAmount?: number | null;
  channel?: string | null;
  gatewayResponseCode?: string | null;
  gatewayResponseMessage?: string | null;
  verifiedAt?: string | null;
  verificationSource?: 'callback' | 'webhook' | 'manual' | null;
}): Promise<PaymentTransactionRecord> {
  const admin = getSupabaseAdmin();

  const { data: updatedTx, error: txErr } = await admin
    .from('payment_transactions')
    .update({
      status: params.nextStatus,
      novac_transaction_id: params.novacTransactionId ?? null,
      charged_amount: params.chargedAmount ?? null,
      channel: params.channel ?? null,
      gateway_response_code: params.gatewayResponseCode ?? null,
      gateway_response_message: params.gatewayResponseMessage ?? null,
      verified_at: params.verifiedAt ?? null,
      verification_source: params.verificationSource ?? null,
    })
    .eq('transaction_reference', params.transactionReference)
    .select('*')
    .single<TransactionRow>();

  if (txErr || !updatedTx) {
    throw new Error(
      `Failed to update transaction in Supabase: ${txErr?.message || 'Not found'}`
    );
  }

  if (params.nextStatus === 'successful') {
    const unlockedAt = params.verifiedAt || new Date().toISOString();
    const { error: subErr } = await admin.from('premium_subscriptions').upsert(
      {
        user_id: params.userId,
        is_premium: true,
        plan: params.plan,
        transaction_reference: params.transactionReference,
        amount_paid: params.expectedAmount,
        currency: params.currency,
        environment: params.environment,
        status: 'successful',
        unlocked_at: unlockedAt,
      },
      { onConflict: 'user_id' }
    );

    if (subErr) {
      throw new Error(`Failed to unlock premium subscription in Supabase: ${subErr.message}`);
    }
  } else if (params.nextStatus === 'reversed') {
    const { data: currentSub } = await admin
      .from('premium_subscriptions')
      .select('transaction_reference')
      .eq('user_id', params.userId)
      .maybeSingle<{ transaction_reference: string | null }>();

    if (currentSub?.transaction_reference === params.transactionReference) {
      // Preserve access if the user has another verified successful transaction (e.g. an earlier One-Time Pass)
      const { data: fallbackRows } = await admin
        .from('payment_transactions')
        .select('*')
        .eq('user_id', params.userId)
        .eq('status', 'successful')
        .neq('transaction_reference', params.transactionReference)
        .order('verified_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .returns<TransactionRow[]>();

      const fallback = fallbackRows?.[0];
      if (fallback) {
        await admin
          .from('premium_subscriptions')
          .update({
            is_premium: true,
            plan: fallback.plan,
            transaction_reference: fallback.transaction_reference,
            amount_paid: fallback.expected_amount,
            currency: fallback.currency || 'NGN',
            environment: fallback.environment,
            status: 'successful',
            unlocked_at: fallback.verified_at || fallback.created_at,
          })
          .eq('user_id', params.userId);
      } else {
        await admin
          .from('premium_subscriptions')
          .update({
            is_premium: false,
            status: 'reversed',
          })
          .eq('user_id', params.userId);
      }
    }
  }

  return mapTransactionRow(updatedTx);
}

export async function appendWebhookEvent(
  transactionReference: string,
  eventKey: string
): Promise<void> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from('payment_transactions')
    .select('webhook_events')
    .eq('transaction_reference', transactionReference)
    .maybeSingle<{ webhook_events: string[] | null }>();

  const current = Array.isArray(data?.webhook_events) ? data.webhook_events : [];
  if (!current.includes(eventKey)) {
    await admin
      .from('payment_transactions')
      .update({ webhook_events: [...current, eventKey] })
      .eq('transaction_reference', transactionReference);
  }
}

export async function markPendingTransactionStatus(
  transactionReference: string,
  status: 'failed' | 'abandoned',
  gatewayResponseMessage?: string
): Promise<void> {
  const admin = getSupabaseAdmin();
  const payload: { status: 'failed' | 'abandoned'; gateway_response_message?: string } = {
    status,
  };
  if (gatewayResponseMessage) {
    payload.gateway_response_message = gatewayResponseMessage;
  }
  await admin
    .from('payment_transactions')
    .update(payload)
    .eq('transaction_reference', transactionReference)
    .eq('status', 'pending');
}

export async function getUserPremiumState(userId: string): Promise<{
  account: UserPremiumRecord;
  transactions: PaymentTransactionRecord[];
}> {
  const admin = getSupabaseAdmin();

  const queryUserState = () =>
    Promise.all([
      admin
        .from('premium_subscriptions')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle<SubscriptionRow>(),
      admin
        .from('payment_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10)
        .returns<TransactionRow[]>(),
      admin
        .from('payment_transactions')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'successful')
        .order('verified_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .returns<TransactionRow[]>(),
    ]);

  let [
    { data: subRow, error: subErr },
    { data: txRows, error: txErr },
    { data: verifiedRows, error: verifiedErr },
  ] = await queryUserState();

  // Retry with backoff in case PostgREST is mid schema-cache reload
  const retryDelaysMs = [250, 500, 1000];
  for (const delayMs of retryDelaysMs) {
    if (
      !isSchemaMissingError(subErr) &&
      !isSchemaMissingError(txErr) &&
      !isSchemaMissingError(verifiedErr)
    ) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    [
      { data: subRow, error: subErr },
      { data: txRows, error: txErr },
      { data: verifiedRows, error: verifiedErr },
    ] = await queryUserState();
  }

  if (subErr) {
    if (isSchemaMissingError(subErr)) {
      throw new SupabaseSchemaNotReadyError(
        `Supabase table public.premium_subscriptions is unavailable in schema cache (${subErr.message}). Run migrations 001 and 002 in Supabase SQL Editor.`
      );
    }
    throw new Error(`Failed to fetch premium subscription: ${subErr.message}`);
  }
  if (txErr || verifiedErr) {
    const err = txErr || verifiedErr;
    if (isSchemaMissingError(err)) {
      throw new SupabaseSchemaNotReadyError(
        `Supabase table public.payment_transactions is unavailable in schema cache (${err!.message}). Run migrations 001 and 002 in Supabase SQL Editor.`
      );
    }
    throw new Error(`Failed to fetch payment transactions: ${err!.message}`);
  }

  const verifiedTransactions = (verifiedRows ?? []).map(mapTransactionRow);
  const account = resolvePlanEntitlements({
    userId,
    subRow: subRow ?? null,
    verifiedTransactions,
  });

  return {
    account,
    transactions: (txRows ?? []).map(mapTransactionRow),
  };
}
