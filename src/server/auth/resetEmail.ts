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

function resendApiKey() {
  return String(process.env.RESEND_API_KEY || '').trim();
}

function resetEmailFrom() {
  return String(process.env.NOVA_AUTH_EMAIL_FROM || process.env.RESEND_FROM_EMAIL || '').trim();
}

function resetEmailReplyTo() {
  return String(process.env.NOVA_AUTH_REPLY_TO || '').trim();
}

function appUrl() {
  return String(process.env.NOVA_APP_URL || 'https://novaquant.cloud')
    .trim()
    .replace(/\/+$/, '');
}

function resendHeaders(apiKey: string, withJsonContentType = true) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'User-Agent': 'nova-quant-auth/1.0',
  };
  if (withJsonContentType) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

function extractEmailAddress(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const bracketMatch = raw.match(/<([^>]+)>/);
  const email = String(bracketMatch?.[1] || raw)
    .trim()
    .replace(/^"+|"+$/g, '')
    .toLowerCase();
  return /\S+@\S+\.\S+/.test(email) ? email : null;
}

function extractEmailDomain(value: string | null) {
  if (!value) return null;
  const atIndex = value.lastIndexOf('@');
  if (atIndex === -1) return null;
  return value.slice(atIndex + 1).trim().toLowerCase() || null;
}

export function getAuthEmailConfigStatus(): AuthEmailConfigStatus {
  const apiKey = resendApiKey();
  const from = resetEmailFrom();
  const fromEmail = extractEmailAddress(from);
  const missing: string[] = [];
  if (!apiKey) missing.push('RESEND_API_KEY');
  if (!from) {
    missing.push('NOVA_AUTH_EMAIL_FROM');
  } else if (!fromEmail) {
    missing.push('NOVA_AUTH_EMAIL_FROM_INVALID');
  }
  return {
    configured: missing.length === 0,
    missing,
    from: from || null,
    fromEmail,
    fromDomain: extractEmailDomain(fromEmail),
    replyTo: resetEmailReplyTo() || null,
    appUrl: appUrl(),
  };
}

export function canSendPasswordResetEmail() {
  return getAuthEmailConfigStatus().configured;
}

export function canSendSignupWelcomeEmail() {
  return getAuthEmailConfigStatus().configured;
}

function buildEmailText(args: PasswordResetEmailArgs) {
  return [
    'NovaQuant password reset',
    '',
    `Your reset code is: ${args.code}`,
    `This code expires in ${args.expiresInMinutes} minutes.`,
    '',
    `Open ${appUrl()} to finish resetting your password.`,
    '',
    'If you did not request this, you can ignore this email.',
  ].join('\n');
}

function buildEmailHtml(args: PasswordResetEmailArgs) {
  const safeCode = String(args.code).replace(/[^0-9A-Za-z-]/g, '');
  const safeUrl = appUrl();
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827">
      <h1 style="font-size:24px;line-height:1.2;margin:0 0 16px">NovaQuant password reset</h1>
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px">Use the code below to reset your password.</p>
      <div style="font-size:32px;letter-spacing:6px;font-weight:700;padding:18px 20px;border-radius:14px;background:#f3f4f6;display:inline-block;margin:0 0 16px">${safeCode}</div>
      <p style="font-size:15px;line-height:1.6;margin:0 0 12px">This code expires in ${args.expiresInMinutes} minutes.</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 12px">Open <a href="${safeUrl}">${safeUrl}</a> to finish resetting your password.</p>
      <p style="font-size:13px;line-height:1.6;color:#6b7280;margin:16px 0 0">If you did not request this, you can ignore this email.</p>
    </div>
  `.trim();
}

export async function sendPasswordResetEmail(args: PasswordResetEmailArgs) {
  const apiKey = resendApiKey();
  const from = resetEmailFrom();
  if (!apiKey || !from) {
    throw new Error('RESET_EMAIL_NOT_CONFIGURED');
  }

  const payload: Record<string, unknown> = {
    from,
    to: [args.email],
    subject: 'Your NovaQuant password reset code',
    text: buildEmailText(args),
    html: buildEmailHtml(args),
  };
  const replyTo = resetEmailReplyTo();
  if (replyTo) {
    payload.reply_to = [replyTo];
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: resendHeaders(apiKey),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).trim().slice(0, 240);
    throw new Error(`RESET_EMAIL_SEND_FAILED${detail ? `:${detail}` : ''}`);
  }

  return true;
}

function buildWelcomeText(args: SignupWelcomeEmailArgs) {
  const safeName = String(args.name || '').trim() || 'there';
  return [
    `Welcome to NovaQuant, ${safeName}`,
    '',
    'Your account has been created successfully.',
    '',
    `You can now sign in at ${appUrl()} and start using NovaQuant.`,
    '',
    'If you did not create this account, reply to this email and we will help you secure it.',
  ].join('\n');
}

function buildWelcomeHtml(args: SignupWelcomeEmailArgs) {
  const safeName = String(args.name || '').trim() || 'there';
  const safeUrl = appUrl();
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827">
      <h1 style="font-size:24px;line-height:1.2;margin:0 0 16px">Welcome to NovaQuant</h1>
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px">Hi ${safeName}, your account has been created successfully.</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px">You can now sign in and start using NovaQuant.</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px"><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;border-radius:12px;background:#111827;color:#ffffff;text-decoration:none;font-weight:600">Open NovaQuant</a></p>
      <p style="font-size:13px;line-height:1.6;color:#6b7280;margin:16px 0 0">If you did not create this account, reply to this email and we will help you secure it.</p>
    </div>
  `.trim();
}

export async function sendSignupWelcomeEmail(args: SignupWelcomeEmailArgs) {
  const apiKey = resendApiKey();
  const from = resetEmailFrom();
  if (!apiKey || !from) {
    throw new Error('SIGNUP_EMAIL_NOT_CONFIGURED');
  }

  const payload: Record<string, unknown> = {
    from,
    to: [args.email],
    subject: 'Welcome to NovaQuant',
    text: buildWelcomeText(args),
    html: buildWelcomeHtml(args),
  };
  const replyTo = resetEmailReplyTo();
  if (replyTo) {
    payload.reply_to = [replyTo];
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: resendHeaders(apiKey),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).trim().slice(0, 240);
    throw new Error(`SIGNUP_EMAIL_SEND_FAILED${detail ? `:${detail}` : ''}`);
  }

  return true;
}
