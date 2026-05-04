import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendOTPEmail, generateOTP } from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json({
        success: true,
        message: "If the email is registered, you will receive an OTP code",
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
              "OTP resend limit reached. Please try again in 5 minutes.",
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
            error: `Please wait ${remainingSeconds} seconds before requesting a new OTP`,
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
          { error: "Failed to send email. Please try again." },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "OTP code has been resent to your email",
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
        { error: "Failed to send email. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "OTP code has been sent to your email",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
