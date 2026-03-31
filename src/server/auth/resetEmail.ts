// Legacy Resend Email module deprecated in favor of Supabase Native Auth
// Retained only for local SQLite fallback warnings

import { logWarn } from '../utils/log.js';

type PasswordResetEmailArgs = {
  email: string;
  code: string;
  expiresInMinutes: number;
};

type SignupWelcomeEmailArgs = {
  email: string;
  name: string;
};

export type AuthEmailConfigStatus = {
  configured: boolean;
  missing: string[];
  from: string | null;
  fromEmail: string | null;
  fromDomain: string | null;
  replyTo: string | null;
  appUrl: string;
};

export function getAuthEmailConfigStatus(): AuthEmailConfigStatus {
  return {
    configured: false,
    missing: ['RESEND_API_KEY_DEPRECATED'],
    from: null,
    fromEmail: null,
    fromDomain: null,
    replyTo: null,
    appUrl: 'http://localhost:5173',
  };
}

export function canSendPasswordResetEmail() {
  return false;
}

export function canSendSignupWelcomeEmail() {
  return false;
}

export async function sendPasswordResetEmail(args: PasswordResetEmailArgs) {
  logWarn(`[Local Dev] SQLite Fallback: Password reset code for ${args.email} is: ${args.code}`, {
    event_type: 'local_password_reset_code',
  });
  return true;
}

export async function sendSignupWelcomeEmail(args: SignupWelcomeEmailArgs) {
  logWarn(`[Local Dev] SQLite Fallback: Welcome email skipped for ${args.email}`, {
    event_type: 'local_signup_welcome_skipped',
  });
  return true;
}
