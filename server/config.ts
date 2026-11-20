export type NovacEnvironment = 'test' | 'live';
export type PremiumPlanId = 'onetime' | 'monthly';

export interface PlanDefinition {
  id: PremiumPlanId;
  name: string;
  amount: number;
  currency: 'NGN';
  billingCycle: 'one-time' | 'monthly';
  description: string;
}

export const PREMIUM_PLANS: Record<PremiumPlanId, PlanDefinition> = {
  onetime: {
    id: 'onetime',
    name: 'One-Time Premium Upgrade',
    amount: 1000,
    currency: 'NGN',
    billingCycle: 'one-time',
    description: 'Unlock BakeProfit Premium features with a single payment.',
  },
  monthly: {
    id: 'monthly',
    name: 'Monthly Premium Subscription',
    amount: 2000,
    currency: 'NGN',
    billingCycle: 'monthly',
    description: 'Monthly recurring BakeProfit Premium access.',
  },
};

export interface NovacRuntimeConfig {
  mode: NovacEnvironment;
  baseUrl: string;
  publicKey: string;
  secretKey: string;
  monthlyPaymentLinkRef: string;
  allowedWebhookIps: string[];
  isConfigured: boolean;
  missingKeys: string[];
  monthlyConfigured: boolean;
  keyMismatchError: string | null;
}

export function getNovacConfig(): NovacRuntimeConfig {
  const rawMode = (process.env.NOVAC_MODE || 'test').trim().toLowerCase();
  // Enforce test mode unless explicitly set to 'live'
  const mode: NovacEnvironment = rawMode === 'live' ? 'live' : 'test';

  const baseUrl = (process.env.NOVAC_API_BASE_URL || 'https://api.novacpayment.com').replace(
    /\/+$/,
    ''
  );

  const publicKey =
    mode === 'test'
      ? (process.env.NOVAC_TEST_PUBLIC_KEY || '').trim()
      : (process.env.NOVAC_LIVE_PUBLIC_KEY || '').trim();

  const secretKey =
    mode === 'test'
      ? (process.env.NOVAC_TEST_SECRET_KEY || '').trim()
      : (process.env.NOVAC_LIVE_SECRET_KEY || '').trim();

  const monthlyPaymentLinkRef =
    mode === 'test'
      ? (process.env.NOVAC_TEST_MONTHLY_PAYMENT_LINK_REF || '').trim()
      : (process.env.NOVAC_LIVE_MONTHLY_PAYMENT_LINK_REF || '').trim();

  const allowedWebhookIps = (process.env.NOVAC_WEBHOOK_ALLOWED_IPS || '18.233.137.110')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean);

  const missingKeys: string[] = [];
  if (!publicKey) {
    missingKeys.push(mode === 'test' ? 'NOVAC_TEST_PUBLIC_KEY' : 'NOVAC_LIVE_PUBLIC_KEY');
  }
  if (!secretKey) {
    missingKeys.push(mode === 'test' ? 'NOVAC_TEST_SECRET_KEY' : 'NOVAC_LIVE_SECRET_KEY');
  }

  let keyMismatchError: string | null = null;
  if (mode === 'test') {
    if (publicKey.startsWith('nc_live') || secretKey.startsWith('nc_live')) {
      keyMismatchError =
        'Live Novac keys cannot be used while NOVAC_MODE is set to test. Provide nc_testpk_ and nc_testsk_ credentials.';
    }
  } else {
    if (publicKey.startsWith('nc_test') || secretKey.startsWith('nc_test')) {
      keyMismatchError =
        'Test Novac keys cannot be used while NOVAC_MODE is set to live.';
    }
  }

  return {
    mode,
    baseUrl,
    publicKey,
    secretKey,
    monthlyPaymentLinkRef,
    allowedWebhookIps,
    isConfigured: missingKeys.length === 0 && !keyMismatchError,
    missingKeys,
    monthlyConfigured: Boolean(monthlyPaymentLinkRef),
    keyMismatchError,
  };
}
