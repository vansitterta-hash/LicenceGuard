import { supabase } from '../lib/supabase';

export function validatePassword(password: string, confirmation: string): void {
  if (password !== confirmation) throw new Error('The passwords do not match.');
  if (password.length < 8) throw new Error('Use at least 8 characters for your password.');
}

export async function changePassword(password: string, confirmation: string): Promise<void> {
  validatePassword(password, confirmation);
  const { data, error: sessionError } = await supabase.auth.getUser();
  if (sessionError || !data.user) throw new Error('Your session has expired. Please sign in again or request a new reset link.');
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(error.message);
}

export function passwordResetRedirect(href: string): string {
  const url = new URL('/', href);
  url.hash = '';
  url.search = '?reset-password=1';
  return url.toString();
}

export async function requestPasswordReset(email: string, href: string): Promise<void> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error('Enter a valid email address.');
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: passwordResetRedirect(href) });
  if (error) throw new Error(error.message);
}

export function isPasswordRecoveryUrl(href: string): boolean {
  const url = new URL(href);
  return url.searchParams.has('reset-password') || new URLSearchParams(url.hash.slice(1)).get('type') === 'recovery';
}

export async function acceptPasswordRecovery(href: string, resumed: boolean): Promise<void> {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  const invalid = () => new Error('This reset link is invalid or has expired. Please request a new link.');
  if (hash.has('error') || url.searchParams.has('error')) throw invalid();
  const access = hash.get('access_token');
  const refresh = hash.get('refresh_token');
  const code = url.searchParams.get('code');
  if (access && refresh && hash.get('type') === 'recovery') {
    const { error } = await supabase.auth.setSession({ access_token: access, refresh_token: refresh });
    if (error) throw invalid();
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw invalid();
  } else if (!resumed) throw invalid();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw invalid();
}
