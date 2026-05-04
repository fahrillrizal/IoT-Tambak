import { NextResponse } from 'next/server';
import { auth, hashPassword } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const setPasswordSchema = z.object({
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .max(12, 'Password must be at most 12 characters')
    .refine(val => /[A-Z]/.test(val), 'Password must include an uppercase letter')
    .refine(val => /[a-z]/.test(val), 'Password must include a lowercase letter')
    .refine(val => /\d/.test(val), 'Password must include a number'),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Password confirmation does not match',
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
      return NextResponse.json({ error: 'You already have a password. Use password reset instead.' }, { status: 400 });
    }

    // Set new password
    const hashedPassword = await hashPassword(parsed.data.password);
    await prisma.user.update({
      where: { id: Number(session.user.id) },
      data: { password: hashedPassword }
    });

    return NextResponse.json({ message: 'Password created successfully' });
  } catch (e: any) {
    console.error('Set password error', e);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
