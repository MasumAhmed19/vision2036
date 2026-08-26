import nodemailer from 'nodemailer';

// Only escapes the handful of characters that matter inside HTML text
// content — recipientName comes from a user-editable profile field and is
// interpolated directly into the email body below.
function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getTransporter() {
    const GMAIL_USER = process.env.GMAIL_USER;
    const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
        // Deferred to call time so a missing env var only breaks the routes
        // that actually send email, not every route that imports this module.
        throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD must be set in .env.local');
    }

    return {
        gmailUser: GMAIL_USER,
        transporter: nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: GMAIL_USER,
                pass: GMAIL_APP_PASSWORD,
            },
        }),
    };
}

// Shared shell (header/footer chrome) so every Vision2036 email looks like
// it came from the same system — `bodyHtml` is trusted, pre-built markup
// from the functions below, never raw user input.
function renderEmailShell(bodyHtml: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background:#18181b;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">
                Vision<span style="color:#a1a1aa;">2036</span>
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#fafafa;padding:20px 40px;border-top:1px solid #f4f4f5;text-align:center;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;">
                © ${new Date().getFullYear()} Vision2036. This is a private system.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

export async function sendPasswordResetEmail(
    to: string,
    recipientName: string,
    resetLink: string
): Promise<void> {
    const { gmailUser, transporter } = getTransporter();
    const expiryMinutes = 15;
    const safeName = escapeHtml(recipientName);

    const html = renderEmailShell(`
              <h2 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#18181b;">
                Reset your password
              </h2>
              <p style="margin:0 0 24px;font-size:15px;color:#71717a;line-height:1.6;">
                Hi ${safeName},
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6;">
                We received a request to reset the password for your Vision2036 account.
                Click the button below to choose a new password.
              </p>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="border-radius:8px;background:#18181b;">
                    <a href="${resetLink}"
                       style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Expiry notice -->
              <p style="margin:0 0 20px;font-size:13px;color:#a1a1aa;line-height:1.5;">
                ⏱ This link expires in <strong>${expiryMinutes} minutes</strong> and can only be used once.
              </p>

              <!-- Divider -->
              <hr style="border:none;border-top:1px solid #f4f4f5;margin:24px 0;" />

              <p style="margin:0 0 12px;font-size:13px;color:#a1a1aa;line-height:1.5;">
                If you didn't request a password reset, you can safely ignore this email.
                Your password will remain unchanged.
              </p>

              <!-- Fallback link -->
              <p style="margin:0;font-size:12px;color:#a1a1aa;line-height:1.5;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:6px 0 0;font-size:12px;word-break:break-all;">
                <a href="${resetLink}" style="color:#18181b;">${resetLink}</a>
              </p>
    `);

    await transporter.sendMail({
        from: `"Vision2036" <${gmailUser}>`,
        to,
        subject: 'Reset your Vision2036 password',
        html,
    });
}

/**
 * Sent by a co_admin/admin from the "Send Notification" tool (see
 * /api/notifications/send) to nudge a member about a specific month's
 * contribution. Amounts are computed server-side from the ledger — never
 * trust client-supplied figures for what someone owes.
 */
export async function sendMissedPaymentEmail(
    to: string,
    recipientName: string,
    monthLabel: string,
    amountDuePaisaAsTaka: number,
    amountPaidAsTaka: number,
    deadlineDay: number
): Promise<void> {
    const { gmailUser, transporter } = getTransporter();
    const safeName = escapeHtml(recipientName);
    const remaining = Math.max(amountDuePaisaAsTaka - amountPaidAsTaka, 0);
    const taka = (n: number) => `৳ ${n.toLocaleString('en-IN')}`;

    const statusLine = remaining > 0
        ? `<p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6;">
             For <strong>${monthLabel}</strong>, you've paid ${taka(amountPaidAsTaka)} of the ${taka(amountDuePaisaAsTaka)} expected —
             <strong style="color:#b3261e;">${taka(remaining)} still remaining</strong>, due by day ${deadlineDay}.
           </p>`
        : `<p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6;">
             For <strong>${monthLabel}</strong>, our records show you've already paid ${taka(amountPaidAsTaka)} of the
             ${taka(amountDuePaisaAsTaka)} expected. This is just a friendly check-in — no action needed if that's correct.
           </p>`;

    const html = renderEmailShell(`
              <h2 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#18181b;">
                Payment reminder — ${monthLabel}
              </h2>
              <p style="margin:0 0 24px;font-size:15px;color:#71717a;line-height:1.6;">
                Hi ${safeName},
              </p>
              ${statusLine}
              <p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.5;">
                Sent from Vision2036 by a Co-Admin/Admin. Do not reply to this email. Please reach out in the group if anything looks off.
              </p>
    `);

    await transporter.sendMail({
        from: `"Vision2036" <${gmailUser}>`,
        to,
        subject: `Payment reminder — ${monthLabel}`,
        html,
    });
}

/**
 * Free-form message from a co_admin/admin — subject and body are their own
 * words, escaped before interpolation. Line breaks in `message` become <br>
 * so plain-text paragraphs read naturally in an HTML email.
 */
/**
 * Sent to every admin/co_admin (except the submitter, if they happen to be
 * one) right after a member submits a payment — see /api/transfers POST.
 * Fire-and-forget via after(), same pattern as sendPasswordResetEmail: a
 * failed send must never affect the payment submission itself.
 */
export async function sendPaymentSubmittedEmail(
    to: string,
    recipientName: string,
    submitterName: string,
    amountTaka: number,
    periodLabel: string,
    channel: string,
    reviewLink: string
): Promise<void> {
    const { gmailUser, transporter } = getTransporter();
    const safeName = escapeHtml(recipientName);
    const safeSubmitter = escapeHtml(submitterName);
    const safeChannel = escapeHtml(channel);
    const amount = `৳ ${amountTaka.toLocaleString('en-IN')}`;

    const html = renderEmailShell(`
              <h2 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#18181b;">
                New payment to review
              </h2>
              <p style="margin:0 0 24px;font-size:15px;color:#71717a;line-height:1.6;">
                Hi ${safeName},
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6;">
                <strong>${safeSubmitter}</strong> just submitted a payment of <strong>${amount}</strong>
                for <strong>${escapeHtml(periodLabel)}</strong> via ${safeChannel}. It's waiting on someone to verify it.
              </p>

              <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="border-radius:8px;background:#18181b;">
                    <a href="${reviewLink}"
                       style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                      Review Payment
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:12px;color:#a1a1aa;line-height:1.5;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:6px 0 0;font-size:12px;word-break:break-all;">
                <a href="${reviewLink}" style="color:#18181b;">${reviewLink}</a>
              </p>
    `);

    await transporter.sendMail({
        from: `"Vision2036" <${gmailUser}>`,
        to,
        subject: `${submitterName} submitted a payment — please review`,
        html,
    });
}

export async function sendCustomEmail(
    to: string,
    recipientName: string,
    subject: string,
    message: string
): Promise<void> {
    const { gmailUser, transporter } = getTransporter();
    const safeName = escapeHtml(recipientName);
    const safeSubject = escapeHtml(subject);
    const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');

    const html = renderEmailShell(`
              <h2 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#18181b;">
                ${safeSubject}
              </h2>
              <p style="margin:0 0 24px;font-size:15px;color:#71717a;line-height:1.6;">
                Hi ${safeName},
              </p>
              <p style="margin:0;font-size:15px;color:#52525b;line-height:1.6;">
                ${safeMessage}
              </p>
    `);

    await transporter.sendMail({
        from: `"Vision2036" <${gmailUser}>`,
        to,
        subject,
        html,
    });
}
