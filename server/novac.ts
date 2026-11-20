import crypto from 'node:crypto';
import type { NovacRuntimeConfig, PremiumPlanId } from './config.ts';

export interface InitiateCheckoutParams {
  config: NovacRuntimeConfig;
  transactionReference: string;
  amount: number;
  currency: 'NGN';
  redirectUrl: string;
  customer: {
    email: string;
    firstName: string;
    lastName: string;
    phoneNumber?: string;
  };
  plan: PremiumPlanId;
  accountId: string;
}

export interface NovacInitiateResponse {
  status: boolean;
  message: string | null;
  data?: {
    transactionReference?: string;
    amount?: number;
    statusCode?: string;
    statusMessage?: string;
    publicKey?: string;
    paymentRedirectUrl?: string;
    collectionPaymentOptions?: string;
    responseCode?: string;
    responseDescription?: string;
  } | null;
}

export interface NovacVerifyResponse {
  status: boolean;
  message: string | null;
  data?: {
    status?: 'pending' | 'successful' | 'failed' | 'abandoned' | 'reversed' | string;
    id?: number;
    transactionReference?: string;
    amount?: number;
    chargedAmount?: number;
    currency?: string;
    transactionFee?: number;
    gatewayResponseCode?: string;
    gatewayResponseMessage?: string;
    domain?: string;
    channel?: string;
    redirectUrl?: string;
    customer?: {
      id?: number;
      customerCode?: string;
      email?: string;
      name?: string;
    } | null;
  } | null;
}

export function generateTransactionReference(): string {
  // Novac requires transactionReference minLength: 16, maxLength: 50
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(8).toString('hex').toUpperCase();
  return `BP${stamp}${rand}`;
}

export async function initiateNovacCheckout(
  params: InitiateCheckoutParams
): Promise<{
  transactionReference: string;
  paymentRedirectUrl: string;
  raw: NovacInitiateResponse;
}> {
  const { config, transactionReference, amount, currency, redirectUrl, customer, plan, accountId } =
    params;

  if (!config.isConfigured) {
    if (config.keyMismatchError) {
      throw new Error(config.keyMismatchError);
    }
    throw new Error(
      `Novac API keys are not configured for ${config.mode} mode. Missing: ${config.missingKeys.join(', ')}.`
    );
  }

  const metaData = JSON.stringify({
    app: 'BakeProfit',
    plan,
    accountId,
    environment: config.mode,
  });

  if (plan === 'monthly') {
    if (!config.monthlyPaymentLinkRef) {
      const envName =
        config.mode === 'test'
          ? 'NOVAC_TEST_MONTHLY_PAYMENT_LINK_REF'
          : 'NOVAC_LIVE_MONTHLY_PAYMENT_LINK_REF';
      throw new Error(
        `Monthly subscription requires a recurring payment link reference from your Novac Dashboard (${envName}). Please configure ${envName} or use the One-Time Premium Upgrade (₦1,000).`
      );
    }

    const res = await fetch(`${config.baseUrl}/api/v1/recurring/initiate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.publicKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        paymentLinkReference: config.monthlyPaymentLinkRef,
        amount,
        metaData,
        redirectUrl,
        checkoutCustomerData: {
          email: customer.email,
          firstName: customer.firstName,
          lastName: customer.lastName,
          phoneNumber: customer.phoneNumber || '',
        },
        checkoutCustomizationData: {
          paymentDescription: 'BakeProfit Premium — Monthly Subscription (₦2,000/month)',
          checkoutModalTitle: 'BakeProfit Premium Monthly',
        },
      }),
    });

    const json = (await res.json().catch(() => null)) as NovacInitiateResponse | null;
    if (!res.ok || !json?.status || !json.data?.paymentRedirectUrl) {
      const reason =
        json?.message ||
        json?.data?.responseDescription ||
        `Novac recurring checkout initiation failed (HTTP ${res.status}).`;
      throw new Error(reason);
    }

    return {
      transactionReference: json.data.transactionReference || transactionReference,
      paymentRedirectUrl: json.data.paymentRedirectUrl,
      raw: json,
    };
  }

  // One-time checkout payment with unique transaction reference
  const res = await fetch(`${config.baseUrl}/api/v1/initiate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.publicKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      transactionReference,
      amount,
      currency,
      metaData,
      redirectUrl,
      checkoutCustomerData: {
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
        phoneNumber: customer.phoneNumber || '',
      },
      checkoutCustomizationData: {
        paymentDescription: 'BakeProfit Premium — One-Time Upgrade (₦1,000)',
        checkoutModalTitle: 'BakeProfit Premium',
      },
    }),
  });

  const json = (await res.json().catch(() => null)) as NovacInitiateResponse | null;
  if (!res.ok || !json?.status || !json.data?.paymentRedirectUrl) {
    const reason =
      json?.message ||
      json?.data?.responseDescription ||
      `Novac checkout initiation failed (HTTP ${res.status}).`;
    throw new Error(reason);
  }

  return {
    transactionReference: json.data.transactionReference || transactionReference,
    paymentRedirectUrl: json.data.paymentRedirectUrl,
    raw: json,
  };
}

export async function verifyNovacTransaction(
  config: NovacRuntimeConfig,
  transactionReference: string
): Promise<NovacVerifyResponse> {
  if (!config.isConfigured) {
    throw new Error(
      config.keyMismatchError ||
        `Novac secret key not configured (${config.missingKeys.join(', ')}).`
    );
  }

  const res = await fetch(
    `${config.baseUrl}/api/v1/checkout/${encodeURIComponent(transactionReference)}/verify`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const json = (await res.json().catch(() => null)) as NovacVerifyResponse | null;
  if (!res.ok || !json) {
    throw new Error(
      json?.message || `Novac verification request failed (HTTP ${res.status}).`
    );
  }

  return json;
}
