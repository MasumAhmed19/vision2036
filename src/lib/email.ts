import nodemailer from 'nodemailer';

const GMAIL_USER = process.env.GMAIL_USER!;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD!;

if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD must be set in .env.local');
}

// Reusable transporter — Gmail SMTP with App Password (free, no OAuth needed)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASSWORD,
    },
});

export async function sendPasswordResetEmail(
    to: string,
    recipientName: string,
    resetLink: string
): Promise<void> {
    const expiryMinutes = 15;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Reset your Vision2036 password</title>
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
              <h2 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#18181b;">
                Reset your password
              </h2>
              <p style="margin:0 0 24px;font-size:15px;color:#71717a;line-height:1.6;">
                Hi ${recipientName},
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

    await transporter.sendMail({
        from: `"Vision2036" <${GMAIL_USER}>`,
        to,
        subject: 'Reset your Vision2036 password',
        html,
    });
}
