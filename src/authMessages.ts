import type { AuthError, User } from '@supabase/supabase-js';

/**
 * Supabase answers a sign-up for an email that already has an account either
 * with "user_already_exists" or, so strangers can't probe which emails exist,
 * with a made-up user that has no identities and no session.
 */
export const alreadyRegistered = (user: User | null, error?: { code?: string } | null) =>
  error?.code === 'user_already_exists' || (!error && !!user && (user.identities?.length ?? 0) === 0);

/** Plain-language versions of the auth errors a valet can actually hit. */
export function authMessage(e: Pick<AuthError, 'message'> & { code?: string; status?: number }): string {
  const code = e.code ?? '';
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(e.message))
    return "That email and password don't match. If you first signed in with an emailed link, you haven't set a password yet: tap Forgot password.";
  if (code === 'over_email_send_rate_limit' || e.status === 429 || /rate limit/i.test(e.message))
    return 'Too many emails have been sent in the last hour. Wait a few minutes, then try again.';
  if (code === 'user_already_exists' || /already registered/i.test(e.message)) return 'There is already an account with that email.';
  if (code === 'weak_password' || /password should be/i.test(e.message)) return 'Pick a longer password (at least 6 characters).';
  if (code === 'email_address_invalid' || /invalid format|email address .* is invalid/i.test(e.message))
    return "That email address doesn't look right.";
  if (code === 'same_password') return 'That is already your password.';
  if (/failed to fetch|network|load failed/i.test(e.message)) return 'No signal. Check your connection and try again.';
  return e.message;
}
