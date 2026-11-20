import { AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { initSupabaseClient } from '../lib/supabase';

interface AuthModalProps {
  initialMode?: 'login' | 'signup';
  promptMessage?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function AuthModal({
  initialMode = 'login',
  promptMessage,
  onClose,
  onSuccess,
}: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setConfirmationMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setIsLoading(true);
    try {
      const supabase = await initSupabaseClient();
      if (!supabase) {
        setError(
          'Supabase client is not configured. Ensure SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are set in your environment.'
        );
        return;
      }

      if (mode === 'signup') {
        if (!fullName.trim()) {
          setError('Please enter your full name.');
          return;
        }

        const { data, error: signUpError } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              business_name: businessName.trim() || null,
            },
          },
        });

        if (signUpError) {
          setError(signUpError.message);
          return;
        }

        if (data.session) {
          onSuccess();
          onClose();
        } else {
          setConfirmationMessage(
            'Account created! Please check your email inbox to confirm your email address, then log in.'
          );
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (signInError) {
          setError(signInError.message);
          return;
        }

        onSuccess();
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#3B2A24]/40 backdrop-blur-[2px]"
    >
      <div className="w-full max-w-md rounded-3xl bg-white border border-[#EAE0D8] p-6 sm:p-7 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-[#A45567]">BakeProfit Account</p>
            <h2
              id="auth-modal-title"
              className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold text-[#3B2A24]"
            >
              {mode === 'login' ? 'Welcome back' : 'Create your account'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-[#7A6158] hover:bg-[#F7F1EB] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {promptMessage && (
          <p className="mt-3 text-xs text-[#6B544B] bg-[#FCF9F6] border border-[#EAE0D8] rounded-xl px-3.5 py-2.5">
            {promptMessage}
          </p>
        )}

        {/* Mode Segmented Switch */}
        <div className="mt-4 grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#F7F1EB]">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
              setConfirmationMessage(null);
            }}
            className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              mode === 'login'
                ? 'bg-white text-[#3B2A24] shadow-xs'
                : 'text-[#6B544B] hover:text-[#3B2A24]'
            }`}
          >
            Log In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signup');
              setError(null);
              setConfirmationMessage(null);
            }}
            className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              mode === 'signup'
                ? 'bg-white text-[#3B2A24] shadow-xs'
                : 'text-[#6B544B] hover:text-[#3B2A24]'
            }`}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
          {mode === 'signup' && (
            <>
              <div>
                <label
                  htmlFor="auth-full-name"
                  className="block text-xs font-medium text-[#6B544B] mb-1"
                >
                  Full Name
                </label>
                <input
                  id="auth-full-name"
                  type="text"
                  required
                  placeholder="Amira Alabi"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#E2D5CC] bg-[#FCF9F6] text-[#3B2A24] focus:outline-none focus:border-[#B56173] focus:bg-white"
                />
              </div>

              <div>
                <label
                  htmlFor="auth-business-name"
                  className="block text-xs font-medium text-[#6B544B] mb-1"
                >
                  Bakery / Business Name (optional)
                </label>
                <input
                  id="auth-business-name"
                  type="text"
                  placeholder="Sweet Crumb Studio"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#E2D5CC] bg-[#FCF9F6] text-[#3B2A24] focus:outline-none focus:border-[#B56173] focus:bg-white"
                />
              </div>
            </>
          )}

          <div>
            <label
              htmlFor="auth-email"
              className="block text-xs font-medium text-[#6B544B] mb-1"
            >
              Email Address
            </label>
            <input
              id="auth-email"
              type="email"
              required
              autoComplete="email"
              placeholder="baker@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#E2D5CC] bg-[#FCF9F6] text-[#3B2A24] focus:outline-none focus:border-[#B56173] focus:bg-white"
            />
          </div>

          <div>
            <label
              htmlFor="auth-password"
              className="block text-xs font-medium text-[#6B544B] mb-1"
            >
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder="Minimum 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#E2D5CC] bg-[#FCF9F6] text-[#3B2A24] focus:outline-none focus:border-[#B56173] focus:bg-white"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl bg-[#FDF2F2] border border-[#F2C6C6] px-3.5 py-2.5 text-xs text-[#9B2C2C]"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {confirmationMessage && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-xl bg-[#F0F7F3] border border-[#C6E2D1] px-3.5 py-2.5 text-xs text-[#245A3F]"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{confirmationMessage}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 text-sm font-semibold text-white bg-[#4A352E] hover:bg-[#3B2A24] disabled:opacity-60 rounded-xl transition-colors cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {mode === 'login' ? 'Signing in...' : 'Creating account...'}
              </>
            ) : mode === 'login' ? (
              'Log In'
            ) : (
              'Create Account'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
