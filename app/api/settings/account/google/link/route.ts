import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { googleId, email, name, image } = await request.json();

    const existingAccount = await prisma.account.findFirst({
      where: {
        provider: "google",
        providerAccountId: googleId,
      },
    });

    if (existingAccount) {
      if (existingAccount.userId === Number(session.user.id)) {
        return NextResponse.json({ message: "Google account already linked" });
      }
      return NextResponse.json(
        { error: "This Google account is already linked to another user" },
        { status: 400 }
      );
    }

    await prisma.account.create({
      data: {
        userId: Number(session.user.id),
        type: "oauth",
        provider: "google",
        providerAccountId: googleId,
      },
    });

    return NextResponse.json({ message: "Google account linked successfully" });
  } catch (e: any) {
    console.error("Link google error", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
