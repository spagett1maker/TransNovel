import { randomBytes } from "crypto";
import { db } from "@/lib/db";

/**
 * 이메일 인증 토큰 생성 (24시간 유효)
 */
export async function generateVerificationToken(email: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24시간

  // 기존 토큰 삭제
  await db.verificationToken.deleteMany({
    where: { identifier: email },
  });

  // 새 토큰 생성
  await db.verificationToken.create({
    data: {
      identifier: email,
      token,
      expires,
    },
  });

  return token;
}

/**
 * 이메일 인증 토큰 검증
 */
export async function verifyEmailToken(token: string): Promise<string | null> {
  const verificationToken = await db.verificationToken.findUnique({
    where: { token },
  });

  if (!verificationToken) {
    return null;
  }

  if (verificationToken.expires < new Date()) {
    // 만료된 토큰 삭제
    await db.verificationToken.delete({
      where: { token },
    });
    return null;
  }

  return verificationToken.identifier;
}

/**
 * 이메일 인증 토큰 삭제
 */
export async function deleteVerificationToken(token: string): Promise<void> {
  await db.verificationToken.delete({
    where: { token },
  });
}

/**
 * 비밀번호 재설정 토큰 생성 (1시간 유효)
 */
export async function generatePasswordResetToken(email: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1시간

  // 기존 토큰 삭제
  await db.passwordResetToken.deleteMany({
    where: { email },
  });

  // 새 토큰 생성
  await db.passwordResetToken.create({
    data: {
      email,
      token,
      expires,
    },
  });

  return token;
}

/**
 * 비밀번호 재설정 토큰 검증
 */
export async function verifyPasswordResetToken(
  token: string
): Promise<string | null> {
  const resetToken = await db.passwordResetToken.findUnique({
    where: { token },
  });

  if (!resetToken) {
    return null;
  }

  if (resetToken.expires < new Date()) {
    // 만료된 토큰 삭제
    await db.passwordResetToken.delete({
      where: { token },
    });
    return null;
  }

  return resetToken.email;
}

/**
 * 비밀번호 재설정 토큰 삭제
 */
export async function deletePasswordResetToken(token: string): Promise<void> {
  await db.passwordResetToken.delete({
    where: { token },
  });
}
