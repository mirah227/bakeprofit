import { getSupabaseAccessToken } from '../lib/supabase';
import {
  PaymentConfigResponse,
  PremiumPlanId,
  PremiumStatusResponse,
} from '../types/bakery';

export interface InitiatePaymentPayload {
  plan: PremiumPlanId;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
}

export interface InitiatePaymentResult {
  transactionReference: string;
  paymentRedirectUrl: string;
  amount: number;
  currency: 'NGN';
  plan: PremiumPlanId;
  environment: 'test' | 'live';
}

export interface VerifyPaymentResult {
  outcome: 'successful' | 'pending' | 'failed' | 'abandoned' | 'reversed' | 'not_found' | 'error';
  message: string;
  transaction: {
    transactionReference: string;
    plan: PremiumPlanId;
    amount: number;
    currency: 'NGN';
    status: string;
    environment: 'test' | 'live';
    verifiedAt: string | null;
  } | null;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getSupabaseAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function fetchPaymentConfig(): Promise<PaymentConfigResponse> {
  const res = await fetch('/api/payments/config');
  if (!res.ok) {
    throw new Error('Could not load payment configuration.');
  }
  return res.json();
}

export async function fetchPremiumStatus(): Promise<PremiumStatusResponse> {
  const headers = await authHeaders();
  const res = await fetch('/api/premium/status', { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Could not load premium status.');
  }
  return res.json();
}

export async function initiateNovacPayment(
  payload: InitiatePaymentPayload
): Promise<InitiatePaymentResult> {
  const headers = await authHeaders();
  const res = await fetch('/api/payments/initiate', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Could not start Novac checkout.');
  }
  return data;
}

export async function verifyNovacPaymentOnServer(
  reference: string
): Promise<VerifyPaymentResult> {
  const headers = await authHeaders();
  const res = await fetch('/api/payments/verify', {
    method: 'POST',
    headers,
    body: JSON.stringify({ reference }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data.outcome) {
    throw new Error(data.error || 'Could not verify payment.');
  }
  return data;
}
