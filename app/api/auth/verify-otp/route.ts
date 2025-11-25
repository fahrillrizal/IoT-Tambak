import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { email, otp } = await request.json();

    if (!email || !otp) {
      return NextResponse.json(
        { error: 'Email dan OTP harus diisi' },
        { status: 400 }
      );
    }

    // Find OTP record
    const otpRecord = await prisma.passwordResetOTP.findFirst({
      where: {
        email,
        otp,
        verified: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!otpRecord) {
      return NextResponse.json(
        { error: 'Kode OTP tidak valid atau sudah kadaluarsa' },
        { status: 400 }
      );
    }

    // Mark OTP as verified
    await prisma.passwordResetOTP.update({
      where: { id: otpRecord.id },
      data: { verified: true },
    });

    return NextResponse.json({
      success: true,
      message: 'OTP berhasil diverifikasi',
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    return NextResponse.json(
      { error: 'Terjadi kesalahan. Silakan coba lagi.' },
      { status: 500 }
    );
  }
}
