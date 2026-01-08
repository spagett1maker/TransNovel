import { Resend } from "resend";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const EMAIL_FROM = process.env.EMAIL_FROM || "TransNovel <noreply@transnovel.com>";

// Lazy initialization to avoid build-time errors
let resendClient: Resend | null = null;

function getResendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) {
    return null;
  }
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

/**
 * 이메일 발송
 */
export async function sendEmail({ to, subject, html }: SendEmailOptions) {
  const resend = getResendClient();

  // 개발 환경에서는 콘솔에 출력만
  if (!resend) {
    console.log("=== Email (Dev Mode) ===");
    console.log("To:", to);
    console.log("Subject:", subject);
    console.log("HTML:", html);
    console.log("========================");
    return { id: "dev-mode" };
  }

  const { data, error } = await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject,
    html,
  });

  if (error) {
    console.error("Email sending failed:", error);
    throw new Error(`이메일 발송에 실패했습니다: ${error.message}`);
  }

  return data;
}

/**
 * 이메일 인증 템플릿
 */
export function generateVerificationEmail(token: string, name: string): string {
  const verifyUrl = `${APP_URL}/api/auth/verify-email?token=${token}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 40px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <tr>
      <td style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 32px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">TransNovel</h1>
      </td>
    </tr>
    <tr>
      <td style="padding: 40px 32px;">
        <h2 style="color: #1f2937; margin: 0 0 16px 0; font-size: 20px;">이메일 인증</h2>
        <p style="color: #4b5563; margin: 0 0 24px 0; line-height: 1.6;">
          안녕하세요, <strong>${name}</strong>님!<br>
          TransNovel 가입을 환영합니다. 아래 버튼을 클릭하여 이메일을 인증해주세요.
        </p>
        <a href="${verifyUrl}" style="display: inline-block; background: #3b82f6; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600;">
          이메일 인증하기
        </a>
        <p style="color: #9ca3af; margin: 24px 0 0 0; font-size: 14px;">
          버튼이 작동하지 않으면 아래 링크를 복사하여 브라우저에 붙여넣으세요:<br>
          <a href="${verifyUrl}" style="color: #3b82f6; word-break: break-all;">${verifyUrl}</a>
        </p>
      </td>
    </tr>
    <tr>
      <td style="background: #f9fafb; padding: 24px 32px; text-align: center;">
        <p style="color: #9ca3af; margin: 0; font-size: 12px;">
          이 링크는 24시간 동안 유효합니다.<br>
          본인이 요청하지 않은 경우 이 이메일을 무시하세요.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * 비밀번호 재설정 이메일 템플릿
 */
export function generatePasswordResetEmail(
  token: string,
  name: string
): string {
  const resetUrl = `${APP_URL}/reset-password?token=${token}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 40px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <tr>
      <td style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 32px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">TransNovel</h1>
      </td>
    </tr>
    <tr>
      <td style="padding: 40px 32px;">
        <h2 style="color: #1f2937; margin: 0 0 16px 0; font-size: 20px;">비밀번호 재설정</h2>
        <p style="color: #4b5563; margin: 0 0 24px 0; line-height: 1.6;">
          안녕하세요, <strong>${name}</strong>님!<br>
          비밀번호 재설정을 요청하셨습니다. 아래 버튼을 클릭하여 새 비밀번호를 설정해주세요.
        </p>
        <a href="${resetUrl}" style="display: inline-block; background: #3b82f6; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600;">
          비밀번호 재설정
        </a>
        <p style="color: #9ca3af; margin: 24px 0 0 0; font-size: 14px;">
          버튼이 작동하지 않으면 아래 링크를 복사하여 브라우저에 붙여넣으세요:<br>
          <a href="${resetUrl}" style="color: #3b82f6; word-break: break-all;">${resetUrl}</a>
        </p>
      </td>
    </tr>
    <tr>
      <td style="background: #f9fafb; padding: 24px 32px; text-align: center;">
        <p style="color: #9ca3af; margin: 0; font-size: 12px;">
          이 링크는 1시간 동안 유효합니다.<br>
          본인이 요청하지 않은 경우 이 이메일을 무시하세요.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
