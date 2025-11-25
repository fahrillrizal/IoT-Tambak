import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return NextResponse.json({ needsPassword: false });
    }

    const user = await prisma.user.findUnique({
      where: { id: Number(session.user.id) },
      select: { password: true },
    });

    return NextResponse.json({ needsPassword: !user?.password });
  } catch (e) {
    return NextResponse.json({ needsPassword: false });
  }
}
