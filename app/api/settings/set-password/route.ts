import { NextResponse } from 'next/server';
import { auth, hashPassword } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const setPasswordSchema = z.object({
  password: z
    .string()
    .min(6, 'Password minimal 6 karakter')
    .max(12, 'Password maksimal 12 karakter')
    .refine(val => /[A-Z]/.test(val), 'Password harus mengandung huruf besar')
    .refine(val => /[a-z]/.test(val), 'Password harus mengandung huruf kecil')
    .refine(val => /\d/.test(val), 'Password harus mengandung angka'),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Konfirmasi password tidak cocok',
  path: ['confirmPassword'],
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const json = await req.json();
    const parsed = setPasswordSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    // Check if user already has password
    const user = await prisma.user.findUnique({
      where: { id: Number(session.user.id) },
      select: { password: true }
    });

    if (user?.password) {
      return NextResponse.json({ error: 'Anda sudah memiliki password. Gunakan fitur reset password.' }, { status: 400 });
    }

    // Set new password
    const hashedPassword = await hashPassword(parsed.data.password);
    await prisma.user.update({
      where: { id: Number(session.user.id) },
      data: { password: hashedPassword }
    });

    return NextResponse.json({ message: 'Password berhasil dibuat' });
  } catch (e: any) {
    console.error('Set password error', e);
    return NextResponse.json({ error: 'Terjadi kesalahan' }, { status: 500 });
  }
}
