const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL;
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME;

export async function sendOTPEmail(email: string, otp: string): Promise<boolean> {
  if (!BREVO_API_KEY) {
    console.error('BREVO_API_KEY is not set');
    return false;
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: BREVO_SENDER_NAME,
          email: BREVO_SENDER_EMAIL,
        },
        to: [{ email }],
        subject: 'Password Reset OTP - IoT Tambak',
        htmlContent: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Reset Password OTP</title>
          </head>
          <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f4f7fa;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background-color: #ffffff; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); overflow: hidden;">
                <div style="background: linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%); padding: 30px; text-align: center;">
                  <h1 style="color: #ffffff; margin: 0; font-size: 24px;">🐟 IoT Tambak</h1>
                  <p style="color: #e0f2fe; margin: 10px 0 0;">Password Reset</p>
                </div>
                <div style="padding: 40px 30px;">
                  <h2 style="color: #1e293b; margin: 0 0 20px; font-size: 20px;">Hello,</h2>
                  <p style="color: #64748b; line-height: 1.6; margin: 0 0 30px;">
                    We received a request to reset your account password. Use the OTP code below to continue the reset process:
                  </p>
                  <div style="background-color: #f1f5f9; border-radius: 8px; padding: 25px; text-align: center; margin: 0 0 30px;">
                    <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #2563eb;">${otp}</span>
                  </div>
                  <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 0 0 30px; border-radius: 0 8px 8px 0;">
                    <p style="color: #92400e; margin: 0; font-size: 14px;">
                      ⏰ <strong>This code is valid for 5 minutes only.</strong>
                    </p>
                  </div>
                  <p style="color: #64748b; line-height: 1.6; margin: 0;">
                    If you did not request a password reset, please ignore this email. Your account remains secure.
                  </p>
                </div>
                <div style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
                  <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                    © ${new Date().getFullYear()} IoT Tambak. All rights reserved.
                  </p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `,
        textContent: `Your IoT Tambak password reset OTP is: ${otp}. This code is valid for 5 minutes.`,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Brevo API error:', errorData);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error sending OTP email:', error);
    return false;
  }
}

export function generateOTP(): string {
  return Math.floor(10000 + Math.random() * 90000).toString();
}
