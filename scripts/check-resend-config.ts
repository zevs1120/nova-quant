import dotenv from 'dotenv';
import { getAuthEmailConfigStatus } from '../src/server/auth/resetEmail.js';

dotenv.config();

type ResendDomain = {
  id?: string;
  name?: string;
  status?: string;
  region?: string;
  capabilities?: {
    sending?: string;
    receiving?: string;
  };
};

type ResendApiEnvelope = {
  statusCode?: number;
  message?: string;
  name?: string;
};

function normalizeDomain(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\.+$/, '');
}

function maskApiKey(value: string | null) {
  if (!value) return 'missing';
  if (value.length <= 10) return `${value.slice(0, 2)}***`;
  return `${value.slice(0, 5)}...${value.slice(-4)}`;
}

async function listResendDomains(apiKey: string) {
  const response = await fetch('https://api.resend.com/domains', {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'User-Agent': 'nova-quant-auth-doctor/1.0',
    },
  });
  const raw = (await response.text().catch(() => '')).trim();
  let parsed: { data?: ResendDomain[]; message?: string } | null = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw) as { data?: ResendDomain[]; message?: string };
    } catch {
      parsed = null;
    }
  }
  return {
    ok: response.ok,
    status: response.status,
    body: parsed as { data?: ResendDomain[]; message?: string; name?: string } | null,
    raw,
  };
}

async function sendProbeEmail(apiKey: string, from: string) {
  const probeTo = String(
    process.env.RESEND_DOCTOR_PROBE_TO || 'delivered+doctor@resend.dev',
  ).trim();
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'nova-quant-auth-doctor/1.0',
    },
    body: JSON.stringify({
      from,
      to: [probeTo],
      subject: 'NovaQuant Resend doctor probe',
      text: 'This is a delivery probe from NovaQuant.',
      html: '<strong>This is a delivery probe from NovaQuant.</strong>',
    }),
  });
  const raw = (await response.text().catch(() => '')).trim();
  let parsed: ResendApiEnvelope | null = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw) as ResendApiEnvelope;
    } catch {
      parsed = null;
    }
  }
  return {
    ok: response.ok,
    status: response.status,
    body: parsed,
    raw,
    probeTo,
  };
}

function printSection(title: string) {
  console.log(`\n${title}`);
}

async function main() {
  const config = getAuthEmailConfigStatus();
  const resendApiKey = String(process.env.RESEND_API_KEY || '').trim();

  console.log('NovaQuant Resend doctor');
  printSection('Local config');
  console.log(`- RESEND_API_KEY: ${maskApiKey(resendApiKey || null)}`);
  console.log(`- NOVA_AUTH_EMAIL_FROM: ${config.from || 'missing'}`);
  console.log(`- Parsed sender address: ${config.fromEmail || 'missing'}`);
  console.log(`- Parsed sender domain: ${config.fromDomain || 'missing'}`);
  console.log(`- NOVA_AUTH_REPLY_TO: ${config.replyTo || 'not set'}`);
  console.log(`- NOVA_APP_URL: ${config.appUrl}`);

  if (!config.configured) {
    printSection('Diagnosis');
    console.log(
      '- Signup success emails are currently skipped before NovaQuant even calls Resend.',
    );
    console.log(`- Missing items: ${config.missing.join(', ')}`);
    console.log(
      '- Fix the missing values in your runtime env or `.env`, then run this doctor again.',
    );
    process.exitCode = 1;
    return;
  }

  if (!resendApiKey) {
    process.exitCode = 1;
    return;
  }

  const runRestrictedKeyProbe = async (label: string) => {
    console.log(`- ${label}`);
    const probeResponse = await sendProbeEmail(resendApiKey, config.from || '');
    console.log(`- Probe recipient: ${probeResponse.probeTo}`);
    console.log(`- Probe result: HTTP ${probeResponse.status}`);
    console.log(
      `- Probe response: ${probeResponse.raw || probeResponse.body?.message || 'empty response'}`,
    );
    if (
      probeResponse.status === 403 &&
      String(probeResponse.body?.message || probeResponse.raw || '')
        .toLowerCase()
        .includes('domain is not verified')
    ) {
      console.log(
        '- Diagnosis: your Resend API key works, but the sender domain is not verified yet.',
      );
      console.log(
        '- Go to the Resend dashboard, add this domain, publish the DNS records it gives you, and wait until the domain shows as verified.',
      );
      process.exitCode = 1;
      return true;
    }
    if (probeResponse.ok) {
      console.log('- Diagnosis: Resend accepted a live send probe from the current sender.');
      console.log(
        '- If real users still do not receive mail, check the Resend Emails/Logs pages for delivery outcomes.',
      );
      return true;
    }
    process.exitCode = 1;
    return true;
  };

  printSection('Resend domains');
  let domainResponse: Awaited<ReturnType<typeof listResendDomains>> | null = null;
  try {
    domainResponse = await listResendDomains(resendApiKey);
  } catch (error) {
    console.log(`- Could not query Resend domains API due to a network error: ${String(error)}`);
    const handled = await runRestrictedKeyProbe(
      'Trying a live send probe anyway so we can still diagnose the sender domain.',
    ).catch((probeError) => {
      console.log(`- The fallback send probe also failed: ${String(probeError)}`);
      return false;
    });
    if (!handled) {
      console.log(
        '- This looks like a temporary network issue between this machine and api.resend.com. Please retry in a minute.',
      );
      process.exitCode = 1;
    }
    return;
  }
  if (!domainResponse.ok) {
    console.log(`- Could not query Resend domains API (HTTP ${domainResponse.status}).`);
    console.log(
      `- Response: ${domainResponse.raw || domainResponse.body?.message || 'empty response'}`,
    );
    if (
      domainResponse.status === 401 &&
      String(domainResponse.body?.name || '')
        .trim()
        .toLowerCase() === 'restricted_api_key'
    ) {
      const handled = await runRestrictedKeyProbe(
        'This key can send email but cannot list domains, so running a send probe instead.',
      );
      if (handled) return;
    } else {
      console.log('- Check whether the API key is valid and has permission to read domains.');
    }
    process.exitCode = 1;
    return;
  }

  const domains = Array.isArray(domainResponse.body?.data) ? domainResponse.body.data : [];
  if (domains.length === 0) {
    console.log('- Resend API is reachable, but this account has no domains yet.');
    console.log(
      '- Add your domain in Resend, publish the DNS records, and wait until the status is `verified`.',
    );
    process.exitCode = 1;
    return;
  }

  const normalizedFromDomain = normalizeDomain(config.fromDomain || '');
  const exactMatch = domains.find(
    (domain) => normalizeDomain(domain.name || '') === normalizedFromDomain,
  );
  const nearbyMatches = domains.filter((domain) => {
    const domainName = normalizeDomain(domain.name || '');
    return domainName && normalizedFromDomain.endsWith(`.${domainName}`);
  });

  for (const domain of domains) {
    console.log(
      `- ${domain.name || '(unnamed)'}: status=${domain.status || 'unknown'}, sending=${domain.capabilities?.sending || 'unknown'}, receiving=${domain.capabilities?.receiving || 'unknown'}, region=${domain.region || 'unknown'}`,
    );
  }

  printSection('Diagnosis');
  if (!exactMatch) {
    console.log(
      `- Your sender uses ${config.fromDomain}, but Resend does not show an exact matching domain for that sender address.`,
    );
    if (nearbyMatches.length > 0) {
      console.log(
        `- Nearby parent-domain matches: ${nearbyMatches
          .map((domain) => domain.name || '')
          .filter(Boolean)
          .join(', ')}`,
      );
      console.log(
        '- If you intend to send from a subdomain, verify in the Resend dashboard that this exact sender domain is supported by your current setup.',
      );
    }
    process.exitCode = 1;
    return;
  }

  if (String(exactMatch.status || '').toLowerCase() !== 'verified') {
    console.log(
      `- The sender domain ${exactMatch.name} exists in Resend, but its status is ${exactMatch.status || 'unknown'} instead of verified.`,
    );
    console.log(
      '- The most common cause is that SPF or DKIM DNS records are still missing, incorrect, or not propagated yet.',
    );
    process.exitCode = 1;
    return;
  }

  if (normalizedFromDomain === 'resend.dev') {
    console.log('- You are using the default resend.dev sender domain.');
    console.log(
      '- That sender is only for testing and cannot be used to send signup emails to arbitrary user addresses.',
    );
    process.exitCode = 1;
    return;
  }

  console.log('- Local env is configured and the sender domain is verified in Resend.');
  console.log(
    '- If users still do not receive mail, check the Resend Emails/Logs pages for the actual delivery outcome.',
  );
}

main().catch((error) => {
  console.error('Resend doctor failed.', error);
  process.exitCode = 1;
});
