import nodemailer from 'nodemailer';

export function getMailSender(env = process.env) {
  if (env.SMTP_FROM && env.SMTP_FROM.trim()) {
    return env.SMTP_FROM.trim();
  }
  const fromName = env.SMTP_FROM_NAME?.trim();
  const fromEmail = (env.SMTP_FROM_EMAIL || env.SMTP_USER)?.trim();
  if (fromName && fromEmail) {
    return `"${fromName}" <${fromEmail}>`;
  }
  return fromEmail || '';
}

export function createMailTransport(env = process.env) {
  if (!env.SMTP_HOST || !env.SMTP_HOST.trim()) return null;

  const port = Number(env.SMTP_PORT || 587);
  // Port 465 requires secure: true; port 587/25 requires secure: false (STARTTLS)
  const isDirectTlsPort = port === 465;
  const isStartTlsPort = [587, 25].includes(port);

  let secure = isDirectTlsPort;
  if (env.SMTP_SECURE !== undefined && env.SMTP_SECURE !== '') {
    // If port 587 or 25 is configured, force secure: false to avoid SSL wrong version errors
    secure = isStartTlsPort ? false : env.SMTP_SECURE === 'true';
  }

  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASSWORD;

  return nodemailer.createTransport({
    host: env.SMTP_HOST.trim(),
    port,
    secure,
    auth: user ? { user, pass } : undefined,
  });
}

export async function sendEmailViaBrevo({ apiKey, from, to, subject, text, html, replyTo }) {
  let senderName = 'The Face of Congo';
  let senderEmail = from;
  const match = from?.match(/^(?:"?([^"]*)"?\s)?<?([^>]+)>?$/);
  if (match) {
    if (match[1]?.trim()) senderName = match[1].trim();
    if (match[2]?.trim()) senderEmail = match[2].trim();
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey.trim(),
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: to }],
      ...(replyTo ? { replyTo: { email: replyTo } } : {}),
      subject,
      textContent: text,
      htmlContent: html,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(`Brevo API (${response.status}): ${errorBody.message || response.statusText}`);
  }
  return true;
}

export async function sendEmailViaResend({ apiKey, from, to, subject, text, html, replyTo }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(`Resend API (${response.status}): ${errorBody.message || response.statusText}`);
  }
  return true;
}

export async function sendGeneralEmail({ to, subject, text, html, from = null, replyTo = null, transport = null }) {
  const recipient = to?.trim();
  if (!recipient) return false;

  const sender = from || getMailSender();
  const effectiveReplyTo = replyTo || process.env.SMTP_REPLY_TO || process.env.SMTP_FROM_EMAIL || undefined;

  // 1. Brevo HTTP API (Port 443 - never blocked by Render Free Tier)
  if (process.env.BREVO_API_KEY?.trim()) {
    return sendEmailViaBrevo({
      apiKey: process.env.BREVO_API_KEY,
      from: sender,
      to: recipient,
      subject,
      text,
      html,
      replyTo: effectiveReplyTo,
    });
  }

  // 2. Resend HTTP API (Port 443 - never blocked by Render Free Tier)
  if (process.env.RESEND_API_KEY?.trim()) {
    return sendEmailViaResend({
      apiKey: process.env.RESEND_API_KEY,
      from: sender,
      to: recipient,
      subject,
      text,
      html,
      replyTo: effectiveReplyTo,
    });
  }

  // 3. Nodemailer SMTP transport fallback
  const mailer = transport || createMailTransport();
  if (!mailer || !sender) return false;

  await mailer.sendMail({
    from: sender,
    to: recipient,
    ...(effectiveReplyTo ? { replyTo: effectiveReplyTo } : {}),
    subject,
    text,
    html,
  });
  return true;
}

export async function sendAcceptanceEmail({ transport, from, candidate, replyTo = null }) {
  const recipient = candidate?.email?.trim();
  if (!recipient) return false;

  const prenom = candidate?.prenom?.trim();
  const salutation = prenom ? `Bonjour ${prenom},` : 'Bonjour,';

  const subject = 'Votre candidature est acceptée - The Face of Congo';
  const text = [
    salutation,
    '',
    'Nous avons le plaisir de vous informer que votre candidature au concours The Face of Congo est acceptée.',
    'Notre équipe vous contactera prochainement pour vous communiquer les prochaines étapes.',
    '',
    'Félicitations,',
    'L’équipe Kazert Évent',
  ].join('\n');

  const html = [
    '<div style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; color: #1f2937; line-height: 1.6; border: 1px solid #e5e7eb; border-radius: 8px;">',
    '  <h2 style="color: #b8860b; margin-top: 0; text-align: center;">The Face of Congo</h2>',
    `  <p style="font-size: 16px;">${salutation}</p>`,
    '  <p>Nous avons le plaisir de vous informer que votre candidature au concours <strong>The Face of Congo</strong> est <strong>acceptée</strong>.</p>',
    '  <p>Notre équipe vous contactera prochainement pour vous communiquer les prochaines étapes.</p>',
    '  <p style="margin-top: 24px; margin-bottom: 4px;">Félicitations,</p>',
    '  <p style="margin-top: 0; font-weight: bold; color: #4b5563;">L’équipe Kazert Évent</p>',
    '</div>',
  ].join('\n');

  return sendGeneralEmail({
    to: recipient,
    subject,
    text,
    html,
    from,
    replyTo,
    transport,
  });
}