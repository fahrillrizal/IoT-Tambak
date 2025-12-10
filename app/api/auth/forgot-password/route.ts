import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendOTPEmail, generateOTP } from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email harus diisi" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json({
        success: true,
        message: "Jika email terdaftar, Anda akan menerima kode OTP",
      });
    }

    const existingOTP = await prisma.passwordResetOTP.findFirst({
      where: {
        email,
        verified: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (existingOTP) {
      if (existingOTP.resendCount >= 2) {
        return NextResponse.json(
          {
            error:
              "Batas pengiriman ulang OTP tercapai. Silakan coba lagi setelah 5 menit.",
          },
          { status: 429 }
        );
      }

      const now = new Date();
      const lastResend = existingOTP.lastResendAt || existingOTP.createdAt;
      const cooldownSeconds = existingOTP.resendCount === 0 ? 30 : 120;
      const cooldownMs = cooldownSeconds * 1000;
      const timeSinceLastResend = now.getTime() - lastResend.getTime();

      if (timeSinceLastResend < cooldownMs) {
        const remainingSeconds = Math.ceil(
          (cooldownMs - timeSinceLastResend) / 1000
        );
        return NextResponse.json(
          {
            error: `Mohon tunggu ${remainingSeconds} detik sebelum meminta OTP baru`,
            remainingSeconds,
          },
          { status: 429 }
        );
      }

      const newOTP = generateOTP();

      await prisma.passwordResetOTP.update({
        where: { id: existingOTP.id },
        data: {
          otp: newOTP,
          resendCount: existingOTP.resendCount + 1,
          lastResendAt: now,
          expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
        },
      });

      const emailSent = await sendOTPEmail(email, newOTP);

      if (!emailSent) {
        return NextResponse.json(
          { error: "Gagal mengirim email. Silakan coba lagi." },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Kode OTP telah dikirim ulang ke email Anda",
        resendCount: existingOTP.resendCount + 1,
      });
    }

    await prisma.passwordResetOTP.deleteMany({
      where: { email },
    });

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await prisma.passwordResetOTP.create({
      data: {
        email,
        otp,
        expiresAt,
        resendCount: 0,
      },
    });

    const emailSent = await sendOTPEmail(email, otp);

    if (!emailSent) {
      return NextResponse.json(
        { error: "Gagal mengirim email. Silakan coba lagi." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Kode OTP telah dikirim ke email Anda",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan. Silakan coba lagi." },
      { status: 500 }
    );
  }
}
