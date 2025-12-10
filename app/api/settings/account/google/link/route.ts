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
        return NextResponse.json({ message: "Akun Google sudah terhubung" });
      }
      return NextResponse.json(
        { error: "Akun Google ini sudah terhubung ke user lain" },
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

    return NextResponse.json({ message: "Akun Google berhasil dihubungkan" });
  } catch (e: any) {
    console.error("Link google error", e);
    return NextResponse.json({ error: "Terjadi kesalahan" }, { status: 500 });
  }
}
