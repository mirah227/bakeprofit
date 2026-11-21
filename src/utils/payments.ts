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

async function parseJsonResponse<T>(res: Response): Promise<{ data: T | null; isJson: boolean }> {
  const text = await res.text();
  if (!text) {
    return { data: null, isJson: false };
  }
  try {
    return { data: JSON.parse(text) as T, isJson: true };
  } catch {
    return { data: null, isJson: false };
  }
}

export async function fetchPaymentConfig(): Promise<PaymentConfigResponse> {
  const res = await fetch('/api/payments/config');
  const { data, isJson } = await parseJsonResponse<PaymentConfigResponse & { error?: string }>(res);
  if (!res.ok || !isJson || !data) {
    throw new Error(data?.error || 'Could not load payment configuration.');
  }
  return data;
}

export async function fetchPremiumStatus(): Promise<PremiumStatusResponse> {
  const headers = await authHeaders();
  const res = await fetch('/api/premium/status', { headers });
  const { data, isJson } = await parseJsonResponse<PremiumStatusResponse & { error?: string }>(res);
  if (!res.ok || !isJson || !data) {
    throw new Error(data?.error || 'Could not load premium status.');
  }
  return data;
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
  const { data, isJson } = await parseJsonResponse<
    Partial<InitiatePaymentResult> & { error?: string }
  >(res);

  if (!res.ok) {
    throw new Error(data?.error || `Could not start Novac checkout (HTTP ${res.status}).`);
  }

  if (
    !isJson ||
    !data?.transactionReference ||
    !data?.paymentRedirectUrl ||
    !/^https?:\/\//i.test(data.paymentRedirectUrl)
  ) {
    throw new Error(
      data?.error ||
        'Payment initiation returned an invalid response. Please refresh the page and try again.'
    );
  }

  return data as InitiatePaymentResult;
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
  const { data, isJson } = await parseJsonResponse<VerifyPaymentResult & { error?: string }>(res);
  if ((!res.ok && !data?.outcome) || !isJson || !data) {
    throw new Error(data?.error || 'Could not verify payment.');
  }
  return data;
}
