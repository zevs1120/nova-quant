import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createClientMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

describe('supabase signup isolation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal('window', {
      location: {
        hostname: 'app.novaquant.cloud',
        protocol: 'https:',
        origin: 'https://app.novaquant.cloud',
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              configured: true,
              url: 'https://project.supabase.co',
              anonKey: 'anon-key',
              redirectUrl: 'https://app.novaquant.cloud/',
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('uses an isolated non-persistent client for signup and resend', async () => {
    const signUpMock = vi.fn(async () => ({ data: { user: null, session: null }, error: null }));
    const resendMock = vi.fn(async () => ({ data: {}, error: null }));
    createClientMock.mockImplementation((_url, _key, options) => ({
      options,
      auth: {
        signUp: signUpMock,
        resend: resendMock,
      },
    }));

    const { signUpWithSupabaseEmailVerification, resendSupabaseSignupVerification } =
      await import('../src/utils/supabaseAuth.js');

    await signUpWithSupabaseEmailVerification({
      email: 'new@example.com',
      password: 'password123',
      options: { emailRedirectTo: 'https://app.novaquant.cloud/' },
    });
    await resendSupabaseSignupVerification({
      email: 'new@example.com',
      emailRedirectTo: 'https://app.novaquant.cloud/',
    });

    expect(createClientMock).toHaveBeenCalled();
    const isolatedCall = createClientMock.mock.calls.at(-1);
    expect(isolatedCall?.[2]).toMatchObject({
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
    expect(signUpMock).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'password123',
      options: { emailRedirectTo: 'https://app.novaquant.cloud/' },
    });
    expect(resendMock).toHaveBeenCalledWith({
      type: 'signup',
      email: 'new@example.com',
      options: {
        emailRedirectTo: 'https://app.novaquant.cloud/',
      },
    });
  });
});
