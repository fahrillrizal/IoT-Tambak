import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendTelegramMessage } from "@/lib/telegram";

function extractToken(text?: string | null): string | null {
  if (!text?.trim().startsWith("/start")) return null;
  const parts = text.trim().split(/\s+/);
  return parts[1] || null;
}

export async function POST(request: NextRequest) {
  try {
    const update = await request.json();
    const message = update?.message || update?.edited_message;
    if (!message) return NextResponse.json({ ok: true });

    const chatId = message?.chat?.id != null ? String(message.chat.id) : null;
    const text = (message?.text as string | undefined)?.trim();
    const name = message?.chat?.first_name ?? "User";

    if (!chatId) return NextResponse.json({ ok: true });

    const token = extractToken(text);

    // ── /start TOKEN — deep link dari aplikasi ─────────────────────────────
    if (token) {
      const user = await prisma.user.findFirst({
        where: {
          telegramConnectToken: token,
          telegramConnectTokenExpiresAt: { gt: new Date() },
        },
        select: { id: true, name: true, email: true },
      });

      if (!user) {
        await sendTelegramMessage(
          chatId,
          `❌ Link expired or invalid.\n\n` +
            `Open the TascaID app → Profile → click "Connect Telegram" again to get a new link.`,
        );
        return NextResponse.json({ ok: true });
      }

      // Simpan chat ID, hapus token
      await prisma.user.update({
        where: { id: user.id },
        data: {
          telegramChatId: chatId,
          telegramConnectToken: null,
          telegramConnectTokenExpiresAt: null,
          telegramConnectedAt: new Date(),
        },
      });

      await sendTelegramMessage(
        chatId,
        `✅ Connected successfully!\n\n` +
          `Account: ${user.name}\n` +
          `Email: ${user.email}\n\n` +
          `You will receive pond alert notifications here.\n\n` +
          `Type /status to check, /disconnect to unlink.`,
      );
      return NextResponse.json({ ok: true, connected: true });
    }

    // ── /start tanpa token ─────────────────────────────────────────────────
    if (text === "/start") {
      // Cek apakah chat ID ini sudah terhubung ke akun
      const existing = await prisma.user.findFirst({
        where: { telegramChatId: chatId },
        select: { name: true },
      });

      if (existing) {
        await sendTelegramMessage(
          chatId,
          `✅ You are already connected as ${existing.name}.\n\n` +
            `Type /status for details, /disconnect to unlink.`,
        );
      } else {
        await sendTelegramMessage(
          chatId,
          `Hi ${name}! 👋\n\n` +
            `To connect your TascaID account:\n` +
            `1. Open the TascaID app\n` +
            `2. Go to the Profile page\n` +
            `3. Tap "Connect Telegram"\n` +
            `4. Click the link — you will be redirected here automatically\n\n` +
            `Type /status to check connection status.`,
        );
      }
      return NextResponse.json({ ok: true });
    }

    // ── /status ────────────────────────────────────────────────────────────
    if (text === "/status") {
      const user = await prisma.user.findFirst({
        where: { telegramChatId: chatId },
        select: { name: true, email: true },
      });
      await sendTelegramMessage(
        chatId,
        user
          ? `✅ Connected!\n\nAccount: ${user.name}\nEmail: ${user.email}\n\nNotifications are active.`
          : `❌ Not connected.\n\nOpen TascaID Profile → click "Connect Telegram".`,
      );
      return NextResponse.json({ ok: true });
    }

    // ── /disconnect ────────────────────────────────────────────────────────
    if (text === "/disconnect") {
      const user = await prisma.user.findFirst({
        where: { telegramChatId: chatId },
        select: { id: true, name: true },
      });
      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: { telegramChatId: null, telegramConnectedAt: null },
        });
        await sendTelegramMessage(
          chatId,
          `✅ Account ${user.name} disconnected successfully.`,
        );
      } else {
        await sendTelegramMessage(chatId, `No account is connected.`);
      }
      return NextResponse.json({ ok: true });
    }

    // ── Pesan lain ─────────────────────────────────────────────────────────
    await sendTelegramMessage(chatId, `Type /status to check connection.`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return NextResponse.json({ ok: true }); // selalu 200 ke Telegram
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok" });
}
