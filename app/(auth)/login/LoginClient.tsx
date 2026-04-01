'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  getDashboardPathForRole,
  type UserRole
} from '@/lib/auth/role-redirect';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AuthShell } from '@/components/auth/auth-shell';

const showOtp = process.env.NEXT_PUBLIC_ENABLE_EMAIL_OTP === 'true';

export default function LoginClient({
  created = false,
  verify = false,
  existing = false
}: {
  created?: boolean;
  verify?: boolean;
  existing?: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [msg, setMsg] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isOtpPending, setIsOtpPending] = useState(false);

  function startAuthTransition(message: string) {
    window.dispatchEvent(
      new CustomEvent('auth-transition:start', {
        detail: { message }
      })
    );
  }

  function endAuthTransition() {
    window.dispatchEvent(new Event('auth-transition:end'));
  }

  async function signIn() {
    setMsg('');
    setIsSigningIn(true);
    startAuthTransition('Signing you in...');

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      setMsg(error.message);
      setIsSigningIn(false);
      endAuthTransition();
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single();

    if (profileError) {
      setMsg(profileError.message);
      setIsSigningIn(false);
      endAuthTransition();
      return;
    }

    const dashboardPath = getDashboardPathForRole(profile.role as UserRole);
    if (dashboardPath === '/customer/dashboard') {
      const bootstrapResponse = await fetch('/api/auth/customer/bootstrap', {
        method: 'POST'
      });
      if (!bootstrapResponse.ok) {
        window.dispatchEvent(new Event('route-progress:start'));
        router.push('/customer/profile-required');
        return;
      }
    }

    window.dispatchEvent(new Event('route-progress:start'));
    router.push(dashboardPath);
  }

  async function sendOtp() {
    setIsOtpPending(true);
    const res = await fetch('/api/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    setMsg(res.ok ? 'OTP email sent.' : 'Failed to send OTP.');
    setIsOtpPending(false);
  }

  async function verifyOtp() {
    setIsOtpPending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email'
    });
    setMsg(error ? error.message : 'Email verified.');
    setIsOtpPending(false);
  }

  return (
    <AuthShell>
      <Card className="relative w-full space-y-4 overflow-hidden rounded-3xl border border-black/10 bg-gradient-to-b from-white to-zinc-50/90 p-6 shadow-[0_34px_90px_rgba(15,23,42,0.2)] sm:p-10">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-emerald-600" aria-hidden />
        <h1 className="text-3xl font-bold text-gray-900 sm:text-[2rem]">Welcome back</h1>
        <p className="text-sm text-gray-700">
          Sign in to manage your farm tasks, workforce, incidents, and records.
        </p>
        {created ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-800">
            Account created successfully.
            {verify ? ' Check your inbox and confirm your email before signing in.' : ' You can sign in now.'}
          </p>
        ) : null}
        {existing ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">
            An account with this email already exists. Please sign in instead.
          </p>
        ) : null}

        <div className="space-y-3">
          <label htmlFor="login-email" className="text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            id="login-email"
            className="w-full rounded-xl border border-black/15 bg-white/95 p-3 text-base transition focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="space-y-3">
          <label htmlFor="login-password" className="text-sm font-medium text-gray-700">
            Password
          </label>
          <input
            id="login-password"
            className="w-full rounded-xl border border-black/15 bg-white/95 p-3 text-base transition focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <Button
          onClick={signIn}
          className="h-11 w-full bg-gradient-to-b from-emerald-600 to-emerald-700 shadow-[0_12px_30px_rgba(5,150,105,0.35)] transition-all hover:from-emerald-500 hover:to-emerald-600 active:scale-[0.98]"
          disabled={isSigningIn}
        >
          {isSigningIn ? 'Signing you in...' : 'Sign in'}
        </Button>

        <div className="flex items-center justify-between text-sm text-gray-600">
          <Link href="#" className="underline-offset-4 hover:underline">
            Forgot password
          </Link>
          <Link href="/signup" className="font-semibold text-emerald-700 underline-offset-4 hover:underline">
            Create account
          </Link>
        </div>

        {showOtp ? (
          <details className="rounded-xl border border-black/10 p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Email verification (OTP)
            </summary>
            <div className="mt-2 space-y-2">
              <Button variant="secondary" onClick={sendOtp} disabled={isOtpPending}>
                {isOtpPending ? 'Sending...' : 'Send OTP'}
              </Button>
              <input
                className="w-full rounded-lg border p-2"
                placeholder="OTP code"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
              />
              <Button variant="secondary" onClick={verifyOtp} disabled={isOtpPending}>
                {isOtpPending ? 'Verifying...' : 'Verify OTP'}
              </Button>
            </div>
          </details>
        ) : null}

        <div className="min-h-5 text-sm text-red-700" aria-live="polite">
          {msg}
        </div>

        <p className="text-xs text-gray-500">
          By continuing you agree to <Link href="#" className="underline-offset-4 hover:underline">Terms</Link> and{' '}
          <Link href="#" className="underline-offset-4 hover:underline">Privacy</Link>
        </p>
      </Card>
    </AuthShell>
  );
}
