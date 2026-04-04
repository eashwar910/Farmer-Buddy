'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const supabase = getSupabaseClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      if (!data.user) {
        setError('Login failed. Please try again.');
        return;
      }

      // Fetch role
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('role')
        .eq('id', data.user.id)
        .single();

      if (profileError || !profile) {
        setError('Could not load your profile. Please try again.');
        return;
      }

      if (profile.role === 'manager') {
        router.push('/dashboard');
      } else if (profile.role === 'employee') {
        router.push('/employee');
      } else {
        setError('Your account does not have a role assigned. Contact your manager.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-fb-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo / Brand */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-fb-accent/20 border border-fb-accent/30 mb-4">
            <span className="text-3xl">🌿</span>
          </div>
          <h1 className="text-3xl font-bold text-fb-text tracking-tight">Farmer Buddy</h1>
          <p className="text-fb-subtext mt-2 text-sm">Agricultural Workforce Platform</p>
        </div>

        {/* Card */}
        <div className="bg-fb-card border border-fb-border rounded-2xl p-8 shadow-2xl">
          <h2 className="text-xl font-bold text-fb-text mb-6">Sign in to your account</h2>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-fb-subtext mb-1.5">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full bg-fb-bg border border-fb-border rounded-xl px-4 py-3 text-fb-text placeholder-fb-subtext/50 focus:outline-none focus:border-fb-accent focus:ring-1 focus:ring-fb-accent transition-colors text-sm"
                placeholder="you@farm.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-fb-subtext mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full bg-fb-bg border border-fb-border rounded-xl px-4 py-3 text-fb-text placeholder-fb-subtext/50 focus:outline-none focus:border-fb-accent focus:ring-1 focus:ring-fb-accent transition-colors text-sm"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="bg-fb-red/10 border border-fb-red/30 rounded-xl px-4 py-3">
                <p className="text-fb-red text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-fb-accent hover:bg-fb-accent/90 disabled:opacity-60 disabled:cursor-not-allowed text-fb-bg font-bold py-3 rounded-xl transition-colors text-sm mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <LoadingSpinner size={16} />
                  Signing in…
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-fb-subtext/50 text-xs mt-6">
          Farmer Buddy — Agricultural Workforce Monitoring
        </p>
      </div>
    </div>
  );
}

function LoadingSpinner({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
