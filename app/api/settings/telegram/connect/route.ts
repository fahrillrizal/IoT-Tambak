import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildTelegramConnectUrl } from "@/lib/telegram";

function isMissingTelegramColumnError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("telegram_") && message.includes("column");
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: Number(session.user.id) },
      select: { telegramChatId: true },
    });

    return NextResponse.json({
      connected: Boolean(user?.telegramChatId),
      username: null,
    });
  } catch (error: unknown) {
    console.error("Telegram status error:", error);
    if (isMissingTelegramColumnError(error)) {
      return NextResponse.json(
        { error: "Kolom Telegram belum ada di database. Jalankan migration terlebih dulu." },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: "Gagal memuat status Telegram" },
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.user.update({
      where: { id: Number(session.user.id) },
      data: {
        telegramConnectToken: token,
        telegramConnectTokenExpiresAt: expiresAt,
      },
    });

    return NextResponse.json({
      success: true,
      connectUrl: buildTelegramConnectUrl(token),
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error: unknown) {
    console.error("Telegram connect error:", error);
    if (isMissingTelegramColumnError(error)) {
      return NextResponse.json(
        { error: "Kolom Telegram belum ada di database. Jalankan migration terlebih dulu." },
        { status: 500 },
      );
    }
    const message = error instanceof Error ? error.message : "Gagal membuat koneksi Telegram";
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
