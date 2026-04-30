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
    const name = message?.chat?.first_name ?? "Pengguna";

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
          `❌ Link sudah kadaluarsa atau tidak valid.\n\n` +
            `Buka aplikasi TascaID → Profil → klik "Hubungkan Telegram" lagi untuk mendapat link baru.`,
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
        `✅ Berhasil terhubung!\n\n` +
          `Akun: ${user.name}\n` +
          `Email: ${user.email}\n\n` +
          `Kamu akan menerima notifikasi alert dari tambak di sini.\n\n` +
          `Ketik /status untuk cek, /disconnect untuk memutuskan.`,
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
          `✅ Kamu sudah terhubung sebagai ${existing.name}.\n\n` +
            `Ketik /status untuk info detail, /disconnect untuk memutuskan.`,
        );
      } else {
        await sendTelegramMessage(
          chatId,
          `Halo ${name}! 👋\n\n` +
            `Untuk menghubungkan akun TascaID:\n` +
            `1. Buka aplikasi TascaID\n` +
            `2. Pergi ke halaman Profil\n` +
            `3. Klik "Hubungkan Telegram"\n` +
            `4. Klik link yang muncul — kamu akan diarahkan ke sini otomatis\n\n` +
            `Ketik /status untuk cek status koneksi.`,
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
          ? `✅ Terhubung!\n\nAkun: ${user.name}\nEmail: ${user.email}\n\nNotifikasi aktif.`
          : `❌ Belum terhubung.\n\nBuka Profil TascaID → klik "Hubungkan Telegram".`,
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
          `✅ Akun ${user.name} berhasil diputuskan.`,
        );
      } else {
        await sendTelegramMessage(chatId, `Tidak ada akun yang terhubung.`);
      }
      return NextResponse.json({ ok: true });
    }

    // ── Pesan lain ─────────────────────────────────────────────────────────
    await sendTelegramMessage(chatId, `Ketik /status untuk cek koneksi.`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return NextResponse.json({ ok: true }); // selalu 200 ke Telegram
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok" });
}
