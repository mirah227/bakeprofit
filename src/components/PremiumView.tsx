import {
  AlertCircle,
  Check,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import { FormEvent, useState } from 'react';
import {
  PaymentConfigResponse,
  PremiumPlanId,
  PremiumStatusResponse,
} from '../types/bakery';
import { formatNaira } from '../utils/calculations';
import {
  initiateNovacPayment,
  verifyNovacPaymentOnServer,
} from '../utils/payments';

export interface PaymentNotification {
  type: 'successful' | 'failed' | 'cancelled' | 'pending' | 'error';
  message: string;
  reference?: string;
}

interface PremiumViewProps {
  onBackToCalculator: () => void;
  isAuthenticated: boolean;
  userEmail: string | null;
  userFullName: string | null;
  onRequireAuth: (message: string) => void;
  paymentConfig: PaymentConfigResponse | null;
  premiumStatus: PremiumStatusResponse | null;
  notification: PaymentNotification | null;
  onDismissNotification: () => void;
  onRefreshPremiumStatus: () => Promise<void>;
  onSetNotification: (note: PaymentNotification | null) => void;
}

const FREE_FEATURES = [
  'Basic recipe costing with automatic unit conversion',
  'Basic profit & selling price calculations',
  'Local browser storage for active & saved recipes',
  'Print-friendly cost summary sheet',
];

const PREMIUM_FEATURES = [
  'Unlimited saved recipes & priority workflow',
  'Advanced pricing & detailed unit economics breakdown',
  'Downloadable cost reports for client quotes',
  'Full ingredient, packaging & overhead share analytics',
];

export function PremiumView({
  onBackToCalculator,
  isAuthenticated,
  userEmail,
  userFullName,
  onRequireAuth,
  paymentConfig,
  premiumStatus,
  notification,
  onDismissNotification,
  onRefreshPremiumStatus,
  onSetNotification,
}: PremiumViewProps) {
  const [selectedPlan, setSelectedPlan] = useState<PremiumPlanId | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isInitiating, setIsInitiating] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [checkoutPendingInfo, setCheckoutPendingInfo] = useState<{
    reference: string;
    redirectUrl: string;
    amount: number;
    plan: PremiumPlanId;
  } | null>(null);

  const isPremium = Boolean(premiumStatus?.isPremium);
  const mode = paymentConfig?.mode ?? premiumStatus?.mode ?? 'test';

  const openUpgradeModal = (plan: PremiumPlanId) => {
    if (!isAuthenticated) {
      onRequireAuth('Sign in or create an account before upgrading so your Premium access is saved to your profile.');
      return;
    }
    if (userEmail && !email) {
      setEmail(userEmail);
    }
    if (userFullName && !firstName && !lastName) {
      const parts = userFullName.trim().split(/\s+/);
      setFirstName(parts[0] || '');
      setLastName(parts.slice(1).join(' ') || '');
    }
    setSelectedPlan(plan);
    setFormError(null);
    setCheckoutPendingInfo(null);
  };

  const closeModal = () => {
    if (isInitiating) return;
    setSelectedPlan(null);
    setFormError(null);
    setCheckoutPendingInfo(null);
  };

  const handleCheckoutSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return;

    const cleanFirst = firstName.trim();
    const cleanLast = lastName.trim();
    const cleanEmail = email.trim();

    if (!cleanFirst || !cleanLast) {
      setFormError('Please enter both your first and last name.');
      return;
    }
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setFormError('Please enter a valid email address for your receipt.');
      return;
    }

    setFormError(null);
    setIsInitiating(true);

    try {
      const result = await initiateNovacPayment({
        plan: selectedPlan,
        firstName: cleanFirst,
        lastName: cleanLast,
        email: cleanEmail,
        phoneNumber: phoneNumber.trim() || undefined,
      });

      try {
        window.sessionStorage.setItem('bakeprofit_pending_ref', result.transactionReference);
      } catch {
        // Ignore sessionStorage restrictions
      }

      setCheckoutPendingInfo({
        reference: result.transactionReference,
        redirectUrl: result.paymentRedirectUrl,
        amount: result.amount,
        plan: result.plan,
      });

      // Redirect customer to Novac's hosted checkout
      window.location.assign(result.paymentRedirectUrl);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Unable to start Novac checkout.'
      );
    } finally {
      setIsInitiating(false);
    }
  };

  const handleVerifyReference = async (reference: string) => {
    if (!reference || isVerifying) return;
    setIsVerifying(true);
    try {
      const result = await verifyNovacPaymentOnServer(reference);
      await onRefreshPremiumStatus();

      if (result.outcome === 'successful') {
        onSetNotification({
          type: 'successful',
          message: 'Payment verified with Novac. BakeProfit Premium is now unlocked.',
          reference: result.transaction?.transactionReference ?? reference,
        });
        setCheckoutPendingInfo(null);
        setSelectedPlan(null);
      } else if (result.outcome === 'failed') {
        onSetNotification({
          type: 'failed',
          message: result.message || 'The payment was declined or failed.',
          reference,
        });
      } else if (result.outcome === 'abandoned') {
        onSetNotification({
          type: 'cancelled',
          message: 'Checkout was cancelled before completion.',
          reference,
        });
      } else {
        onSetNotification({
          type: 'pending',
          message: result.message || 'Transaction is still pending confirmation.',
          reference,
        });
      }
    } catch (err) {
      onSetNotification({
        type: 'error',
        message: err instanceof Error ? err.message : 'Verification request failed.',
        reference,
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const formatDate = (iso?: string | null) => {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('en-NG', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const activePlanAmount = selectedPlan === 'monthly' ? 2000 : 1000;

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-xs font-medium text-[#A45567]">
            BakeProfit Plans · Novac {mode === 'test' ? 'Test Mode' : 'Live Mode'}
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-semibold text-[#3B2A24] tracking-tight">
            Simple plans as your bakery grows
          </h1>
          <p className="mt-3 text-sm sm:text-base text-[#6B544B] leading-relaxed">
            Start free with everyday recipe costing and profit margins. Upgrade via Novac to unlock
            downloadable cost reports and detailed production breakdowns.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onRefreshPremiumStatus()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#6B544B] bg-white border border-[#E5D7CE] hover:border-[#C56E80] rounded-xl transition-colors self-start md:self-auto cursor-pointer whitespace-nowrap shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Status
        </button>
      </div>

      {/* Payment Outcome Notification Banner */}
      {notification && (
        <div
          role="status"
          className={`mt-6 rounded-2xl border p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
            notification.type === 'successful'
              ? 'bg-[#F0F7F3] border-[#C6E2D1] text-[#245A3F]'
              : notification.type === 'failed' || notification.type === 'error'
              ? 'bg-[#FDF2F2] border-[#F2C6C6] text-[#9B2C2C]'
              : 'bg-[#FBF7F3] border-[#E5D7CE] text-[#4A352E]'
          }`}
        >
          <div className="flex items-start gap-3">
            {notification.type === 'successful' ? (
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
            ) : notification.type === 'failed' || notification.type === 'error' ? (
              <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="text-sm font-semibold">{notification.message}</p>
              {notification.reference && (
                <p className="mt-0.5 text-xs opacity-85 font-[family-name:var(--font-mono)]">
                  Reference: {notification.reference}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {notification.reference && notification.type === 'pending' && (
              <button
                type="button"
                disabled={isVerifying}
                onClick={() => handleVerifyReference(notification.reference!)}
                className="px-3 py-1.5 text-xs font-semibold bg-[#4A352E] text-white rounded-lg hover:bg-[#3B2A24] disabled:opacity-60 cursor-pointer"
              >
                {isVerifying ? 'Verifying...' : 'Verify Now'}
              </button>
            )}
            <button
              type="button"
              onClick={onDismissNotification}
              aria-label="Dismiss notification"
              className="p-1.5 rounded-lg hover:bg-black/5 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Active Premium Status Summary */}
      {isPremium && premiumStatus && (
        <section
          aria-label="Active Premium Membership"
          className="mt-6 rounded-3xl bg-[#F0F7F3] border border-[#C6E2D1] p-6 sm:p-7"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-white text-[#2E6B4E] flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-[#2E6B4E]">
                  Verified via Novac · {premiumStatus.environment === 'test' ? 'Test Mode' : 'Live'}
                </p>
                <h2 className="mt-0.5 font-[family-name:var(--font-display)] text-xl font-semibold text-[#3B2A24]">
                  BakeProfit Premium is Active
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#4A352E] tabular-nums">
                  <span>
                    Plan:{' '}
                    <strong>
                      {premiumStatus.plan === 'monthly'
                        ? 'Monthly Subscription'
                        : 'One-Time Upgrade'}
                    </strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Amount:{' '}
                    <strong>
                      {premiumStatus.amountPaid ? formatNaira(premiumStatus.amountPaid) : '—'}
                    </strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Status: <strong className="capitalize">{premiumStatus.status || 'successful'}</strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Ref:{' '}
                    <span className="font-[family-name:var(--font-mono)]">
                      {premiumStatus.transactionReference}
                    </span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>Verified: {formatDate(premiumStatus.unlockedAt)}</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onBackToCalculator}
              className="px-4 py-2.5 text-sm font-semibold text-white bg-[#2E6B4E] hover:bg-[#245A3F] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Use Premium Calculator
            </button>
          </div>
        </section>
      )}

      {/* Configuration Notice when Novac Test Keys are Missing */}
      {paymentConfig && !paymentConfig.isConfigured && (
        <div className="mt-6 rounded-2xl bg-white border border-[#E5D7CE] p-5 text-sm text-[#4A352E]">
          <p className="font-semibold text-[#3B2A24]">
            Novac {paymentConfig.mode.toUpperCase()} API credentials required to initiate live gateway checkout
          </p>
          <p className="mt-1 text-xs text-[#6B544B] leading-relaxed">
            {paymentConfig.keyMismatchError ||
              `Add ${paymentConfig.missingKeys.join(' and ')} to your server environment variables (.env) from your Novac Dashboard (Settings → API Settings → Test Keys) and restart the server.`}
          </p>
        </div>
      )}

      {/* 3 Plan Cards: Free Starter + One-Time Upgrade (₦1,000) + Monthly Subscription (₦2,000) */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* Free Starter */}
        <section className="rounded-3xl bg-white border border-[#EAE0D8] p-6 sm:p-7 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-[#7A6158]">For home bakers getting started</p>
            <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold text-[#3B2A24]">
              Free Starter
            </h2>

            <div className="mt-5 flex items-baseline gap-1.5">
              <span className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[#3B2A24] tabular-nums">
                ₦0
              </span>
              <span className="text-sm text-[#7A6158]">/ forever</span>
            </div>

            <ul className="mt-6 pt-6 border-t border-[#F2EAE4] space-y-3 text-sm text-[#4A352E]">
              {FREE_FEATURES.map((feat) => (
                <li key={feat} className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-[#7A6158] mt-0.5 shrink-0" />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
          </div>

          <button
            type="button"
            onClick={onBackToCalculator}
            className="mt-8 w-full py-3 px-4 text-sm font-semibold text-[#4A352E] bg-[#F7F1EB] hover:bg-[#EFE4DC] rounded-xl transition-colors cursor-pointer"
          >
            Continue with Free Calculator
          </button>
        </section>

        {/* One-Time Premium Upgrade (Prioritized MVP) */}
        <section className="rounded-3xl bg-[#FBF0F2] border border-[#E9C4CD] p-6 sm:p-7 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-[#A45567]">
              Recommended · One-Time Upgrade
            </p>
            <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold text-[#3B2A24]">
              Premium Pass
            </h2>

            <div className="mt-5 flex items-baseline gap-1.5">
              <span className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[#3B2A24] tabular-nums">
                ₦1,000
              </span>
              <span className="text-sm text-[#7A6158]">one-time payment</span>
            </div>

            <ul className="mt-6 pt-6 border-t border-[#EED3DA] space-y-3 text-sm text-[#3B2A24]">
              {PREMIUM_FEATURES.map((feat) => (
                <li key={feat} className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-[#A45567] mt-0.5 shrink-0" />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
          </div>

          <button
            type="button"
            disabled={isPremium}
            onClick={() => openUpgradeModal('onetime')}
            className="mt-8 w-full inline-flex items-center justify-center gap-2 py-3 px-4 text-sm font-semibold text-white bg-[#4A352E] hover:bg-[#3B2A24] disabled:bg-[#2E6B4E] disabled:opacity-90 rounded-xl transition-colors cursor-pointer disabled:cursor-default"
          >
            <Sparkles className="w-4 h-4" />
            {isPremium ? 'Premium Unlocked' : 'Upgrade to Premium'}
          </button>
        </section>

        {/* Monthly Premium Subscription */}
        <section className="rounded-3xl bg-white border border-[#EAE0D8] p-6 sm:p-7 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-[#7A6158]">
              Recurring · Growing Cake Studios
            </p>
            <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold text-[#3B2A24]">
              Monthly Subscription
            </h2>

            <div className="mt-5 flex items-baseline gap-1.5">
              <span className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[#3B2A24] tabular-nums">
                ₦2,000
              </span>
              <span className="text-sm text-[#7A6158]">/ month</span>
            </div>

            <ul className="mt-6 pt-6 border-t border-[#F2EAE4] space-y-3 text-sm text-[#4A352E]">
              {PREMIUM_FEATURES.map((feat) => (
                <li key={feat} className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-[#A45567] mt-0.5 shrink-0" />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8">
            <button
              type="button"
              disabled={isPremium}
              onClick={() => openUpgradeModal('monthly')}
              className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 text-sm font-semibold text-[#4A352E] bg-[#FCF9F6] border border-[#DECFC6] hover:border-[#A45567] hover:bg-[#FBF0F2] disabled:opacity-60 rounded-xl transition-colors cursor-pointer disabled:cursor-default"
            >
              {isPremium ? 'Premium Unlocked' : 'Subscribe Monthly'}
            </button>
            {paymentConfig && !paymentConfig.monthlyConfigured && !isPremium && (
              <p className="mt-2 text-[11px] text-[#8D7369] text-center">
                Requires Novac recurring payment link ref (NOVAC_TEST_MONTHLY_PAYMENT_LINK_REF).
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Recent Payment Transactions */}
      {premiumStatus && premiumStatus.recentTransactions.length > 0 && (
        <section className="mt-10 rounded-2xl bg-white border border-[#EAE0D8] p-5 sm:p-6">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[#3B2A24]">
            Payment History
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#EAE0D8] text-[11px] font-medium text-[#7A6158]">
                  <th className="py-2.5 pr-4">Reference</th>
                  <th className="py-2.5 px-3">Plan</th>
                  <th className="py-2.5 px-3 text-right">Amount</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 pl-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F4ECE6] text-sm">
                {premiumStatus.recentTransactions.map((tx) => (
                  <tr key={tx.transactionReference}>
                    <td className="py-3 pr-4 font-[family-name:var(--font-mono)] text-xs text-[#3B2A24]">
                      {tx.transactionReference}
                    </td>
                    <td className="py-3 px-3 text-[#4A352E]">
                      {tx.plan === 'monthly' ? 'Monthly (₦2,000)' : 'One-Time (₦1,000)'}
                    </td>
                    <td className="py-3 px-3 text-right font-medium text-[#3B2A24] tabular-nums">
                      {formatNaira(tx.expectedAmount)}
                    </td>
                    <td className="py-3 px-3 capitalize text-xs font-medium text-[#4A352E]">
                      {tx.status}
                    </td>
                    <td className="py-3 pl-3 text-right">
                      {tx.status === 'pending' ? (
                        <button
                          type="button"
                          disabled={isVerifying}
                          onClick={() => handleVerifyReference(tx.transactionReference)}
                          className="text-xs font-semibold text-[#A45567] hover:underline cursor-pointer"
                        >
                          Verify Status
                        </button>
                      ) : (
                        <span className="text-xs text-[#8D7369]">
                          {formatDate(tx.verifiedAt || tx.createdAt)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Novac Customer Checkout Modal */}
      {selectedPlan && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="novac-checkout-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#3B2A24]/40 backdrop-blur-[2px]"
        >
          <div className="w-full max-w-md rounded-3xl bg-white border border-[#EAE0D8] p-6 sm:p-7 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-[#A45567]">
                  Novac Secure Checkout · {mode === 'test' ? 'Test Mode' : 'Live Mode'}
                </p>
                <h3
                  id="novac-checkout-modal-title"
                  className="mt-1 font-[family-name:var(--font-display)] text-xl font-semibold text-[#3B2A24]"
                >
                  {selectedPlan === 'monthly'
                    ? 'Monthly Subscription — ₦2,000'
                    : 'One-Time Upgrade — ₦1,000'}
                </h3>
              </div>

              <button
                type="button"
                onClick={closeModal}
                aria-label="Close modal"
                className="p-1.5 rounded-lg text-[#7A6158] hover:bg-[#F7F1EB] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!checkoutPendingInfo ? (
              <form onSubmit={handleCheckoutSubmit} className="mt-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="novac-first-name"
                      className="block text-xs font-medium text-[#6B544B] mb-1"
                    >
                      First Name
                    </label>
                    <input
                      id="novac-first-name"
                      type="text"
                      required
                      placeholder="Amira"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#E2D5CC] bg-[#FCF9F6] text-[#3B2A24] focus:outline-none focus:border-[#B56173] focus:bg-white"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="novac-last-name"
                      className="block text-xs font-medium text-[#6B544B] mb-1"
                    >
                      Last Name
                    </label>
                    <input
                      id="novac-last-name"
                      type="text"
                      required
                      placeholder="Alabi"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#E2D5CC] bg-[#FCF9F6] text-[#3B2A24] focus:outline-none focus:border-[#B56173] focus:bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="novac-email"
                    className="block text-xs font-medium text-[#6B544B] mb-1"
                  >
                    Email Address
                  </label>
                  <input
                    id="novac-email"
                    type="email"
                    required
                    placeholder="you@bakery.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#E2D5CC] bg-[#FCF9F6] text-[#3B2A24] focus:outline-none focus:border-[#B56173] focus:bg-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="novac-phone"
                    className="block text-xs font-medium text-[#6B544B] mb-1"
                  >
                    Phone Number (optional)
                  </label>
                  <input
                    id="novac-phone"
                    type="tel"
                    placeholder="08012345678"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#E2D5CC] bg-[#FCF9F6] text-[#3B2A24] focus:outline-none focus:border-[#B56173] focus:bg-white"
                  />
                </div>

                {formError && (
                  <div
                    role="alert"
                    className="rounded-xl bg-[#FDF2F2] border border-[#F2C6C6] px-3.5 py-2.5 text-xs text-[#9B2C2C]"
                  >
                    {formError}
                  </div>
                )}

                <div className="pt-2 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    disabled={isInitiating}
                    onClick={closeModal}
                    className="px-4 py-2.5 text-sm font-medium text-[#6B544B] hover:bg-[#F7F1EB] rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isInitiating}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#4A352E] hover:bg-[#3B2A24] disabled:opacity-60 rounded-xl transition-colors cursor-pointer"
                  >
                    {isInitiating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>Pay {formatNaira(activePlanAmount)} with Novac</>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl bg-[#FCF7F8] border border-[#F0D9DF] p-4 text-sm text-[#3B2A24]">
                  <p className="font-medium">Redirecting you to Novac Checkout...</p>
                  <p className="mt-1 text-xs text-[#6B544B] font-[family-name:var(--font-mono)]">
                    Ref: {checkoutPendingInfo.reference}
                  </p>
                </div>

                <a
                  href={checkoutPendingInfo.redirectUrl}
                  target="_top"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 text-sm font-semibold text-white bg-[#4A352E] hover:bg-[#3B2A24] rounded-xl transition-colors"
                >
                  Proceed to Novac Checkout
                  <ExternalLink className="w-4 h-4" />
                </a>

                <button
                  type="button"
                  disabled={isVerifying}
                  onClick={() => handleVerifyReference(checkoutPendingInfo.reference)}
                  className="w-full py-2.5 px-4 text-xs font-semibold text-[#6B544B] bg-[#F7F1EB] hover:bg-[#EFE4DC] rounded-xl transition-colors cursor-pointer"
                >
                  {isVerifying
                    ? 'Verifying with Novac...'
                    : 'I have completed payment — Verify Status'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
