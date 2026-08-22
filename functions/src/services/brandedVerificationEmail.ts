const ACTION_HANDLER_URL = 'https://gathr-m1.web.app/auth/action';
const CONTINUE_URL = 'https://www.gathrapp.ca/app?source=email-verification';
const LOGO_URL = 'https://www.gathrapp.ca/assets/logos/icon.png';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function verificationContinueUrl(): string {
  return CONTINUE_URL;
}

export function brandedVerificationActionUrl(firebaseActionLink: string): string {
  const source = new URL(firebaseActionLink);
  if (source.searchParams.get('mode') !== 'verifyEmail' || !source.searchParams.get('oobCode')) {
    throw new Error('Firebase did not return a valid email-verification action link.');
  }

  const branded = new URL(ACTION_HANDLER_URL);
  source.searchParams.forEach((value, key) => branded.searchParams.set(key, value));
  return branded.toString();
}

export type BrandedVerificationEmail = {
  subject: string;
  text: string;
  html: string;
};

export function buildBrandedVerificationEmail(
  verificationUrl: string,
  displayName?: string | null
): BrandedVerificationEmail {
  const firstName = String(displayName || '').trim().split(/\s+/, 1)[0];
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  const safeGreeting = escapeHtml(greeting);
  const safeUrl = escapeHtml(verificationUrl);

  return {
    subject: 'Verify your email for GathR',
    text: [
      greeting,
      '',
      'Confirm this email address to keep your GathR account secure and unlock trusted community contributions.',
      '',
      verificationUrl,
      '',
      'If you did not request this email, you can safely ignore it.',
      '',
      'The GathR Team',
    ].join('\n'),
    html: `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f4f7fb;color:#14263b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:28px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #dde6f0;border-radius:24px;box-shadow:0 14px 40px rgba(20,38,59,.10);overflow:hidden;">
          <tr><td style="height:7px;background:linear-gradient(90deg,#25bce7,#3568ef,#7a5ae8);"></td></tr>
          <tr><td style="padding:34px 34px 12px;">
            <img src="${LOGO_URL}" width="82" height="82" alt="GathR" style="display:block;width:82px;height:82px;border:0;" />
          </td></tr>
          <tr><td style="padding:10px 34px 34px;">
            <div style="font-size:13px;line-height:18px;font-weight:800;letter-spacing:1.2px;color:#2867e8;text-transform:uppercase;">Account security</div>
            <h1 style="margin:10px 0 14px;font-size:32px;line-height:38px;letter-spacing:-.7px;color:#14263b;">Verify your email</h1>
            <p style="margin:0 0 16px;font-size:17px;line-height:27px;color:#455a70;">${safeGreeting}</p>
            <p style="margin:0 0 26px;font-size:17px;line-height:27px;color:#455a70;">Confirm this email address to keep your GathR account secure and unlock trusted community contributions.</p>
            <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 26px;"><tr><td bgcolor="#14263b" style="border-radius:14px;">
              <a href="${safeUrl}" style="display:inline-block;padding:16px 28px;color:#ffffff;text-decoration:none;font-size:17px;font-weight:800;line-height:22px;">Verify email</a>
            </td></tr></table>
            <p style="margin:0;padding-top:22px;border-top:1px solid #e6edf4;font-size:14px;line-height:22px;color:#728398;">If you did not request this email, you can safely ignore it.</p>
          </td></tr>
        </table>
        <p style="margin:20px 0 0;font-size:13px;line-height:20px;color:#7a8da3;">Discover what&rsquo;s happening nearby.</p>
      </td></tr>
    </table>
  </body>
</html>`,
  };
}
