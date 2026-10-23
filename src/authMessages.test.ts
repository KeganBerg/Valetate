import { describe, expect, it } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { alreadyRegistered, authMessage } from './authMessages';

describe('auth messages', () => {
  it('spots a sign-up for an email that already has an account', () => {
    expect(alreadyRegistered({ id: 'x', identities: [] } as unknown as User)).toBe(true);
    expect(alreadyRegistered({ id: 'x', identities: [{ id: 'i' }] } as unknown as User)).toBe(false);
    expect(alreadyRegistered(null)).toBe(false);
    expect(alreadyRegistered(null, { code: 'user_already_exists' })).toBe(true);
  });

  it('explains wrong passwords and the email limit plainly', () => {
    expect(authMessage({ message: 'Invalid login credentials', code: 'invalid_credentials' })).toMatch(/Forgot password/);
    expect(authMessage({ message: 'email rate limit exceeded', status: 429 })).toMatch(/Too many emails/);
    expect(authMessage({ message: 'Something else' })).toBe('Something else');
  });
});
