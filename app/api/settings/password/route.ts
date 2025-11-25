import { NextResponse } from 'next/server';
import { auth, verifyPassword, hashPassword } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { passwordResetSchema } from '@/lib/validations';

export async function PATCH(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const json = await req.json();
    const parsed = passwordResetSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const { oldPassword, newPassword } = parsed.data;

    const user = await prisma.user.findUnique({ where: { id: Number(session.user.id) } });
    if (!user) {
      return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 });
    }
    if (!user.password) {
      return NextResponse.json({ error: 'Akun OAuth tidak bisa reset password kredensial' }, { status: 400 });
    }

    const validOld = await verifyPassword(oldPassword, user.password);
    if (!validOld) {
      return NextResponse.json({ error: 'Password lama salah' }, { status: 400 });
    }

    const hashed = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });

    return NextResponse.json({ message: 'Password berhasil direset' });
  } catch (e: any) {
    console.error('Password reset error', e);
    return NextResponse.json({ error: 'Terjadi kesalahan' }, { status: 500 });
  }
}
