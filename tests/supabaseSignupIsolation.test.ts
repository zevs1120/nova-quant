import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createClientMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

describe('supabase signup isolation', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const globalWithPublicConfig = globalThis as typeof globalThis & Record<string, unknown>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('VITE_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
    vi.stubEnv('VITE_PUBLIC_SUPABASE_AUTH_REDIRECT_URL', '');
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    vi.stubEnv('VITE_SUPABASE_AUTH_REDIRECT_URL', '');
    fetchMock = vi.fn(
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
    );
    vi.stubGlobal('window', {
      location: {
        hostname: 'app.novaquant.cloud',
        protocol: 'https:',
        origin: 'https://app.novaquant.cloud',
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    delete globalWithPublicConfig.__NOVA_PUBLIC_SUPABASE_URL__;
    delete globalWithPublicConfig.__NOVA_PUBLIC_SUPABASE_PUBLISHABLE_KEY__;
    delete globalWithPublicConfig.__NOVA_PUBLIC_SUPABASE_REDIRECT_URL__;
    delete globalWithPublicConfig.__NOVA_PUBLIC_API_BASE_URL__;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/provider-config', {
      credentials: 'omit',
      mode: undefined,
      cache: 'no-store',
    });
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

  it('prefers build-time injected public config without fetching runtime provider config', async () => {
    globalWithPublicConfig.__NOVA_PUBLIC_SUPABASE_URL__ = 'https://defined.supabase.co';
    globalWithPublicConfig.__NOVA_PUBLIC_SUPABASE_PUBLISHABLE_KEY__ = 'defined-anon-key';
    globalWithPublicConfig.__NOVA_PUBLIC_SUPABASE_REDIRECT_URL__ =
      'https://defined.novaquant.cloud/';

    createClientMock.mockImplementation((_url, _key, options) => ({
      options,
      auth: {
        signUp: vi.fn(async () => ({ data: { user: null, session: null }, error: null })),
      },
    }));

    const { signUpWithSupabaseEmailVerification } = await import('../src/utils/supabaseAuth.js');
    await signUpWithSupabaseEmailVerification({
      email: 'new@example.com',
      password: 'password123',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(createClientMock).toHaveBeenCalledWith(
      'https://defined.supabase.co',
      'defined-anon-key',
      expect.any(Object),
    );
  });
});
