import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return NextResponse.json({ linked: false });
    }
    const account = await prisma.account.findFirst({
      where: { userId: Number(session.user.id), provider: 'google' },
      select: { id: true },
    });
    return NextResponse.json({ linked: !!account });
  } catch (e) {
    return NextResponse.json({ linked: false });
  }
}

export async function DELETE() {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await prisma.account.deleteMany({
      where: { userId: Number(session.user.id), provider: 'google' },
    });

    return NextResponse.json({ message: 'Google account unlinked successfully' });
  } catch (e: any) {
    console.error('Unlink google error', e);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
