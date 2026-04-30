const TELEGRAM_API_BASE = "https://api.telegram.org";

export function buildTelegramConnectUrl(token: string): string {
  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  if (!botUsername) {
    throw new Error("Telegram bot username is not configured");
  }

  return `https://t.me/${botUsername}?start=${encodeURIComponent(token)}`;
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error("[Telegram] TELEGRAM_BOT_TOKEN tidak dikonfigurasi");
    return false;
  }

  try {
    const response = await fetch(
      `${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
        }),
      },
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error("[Telegram] API error:", err.description ?? response.status);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[Telegram] fetch error:", error);
    return false;
  }
}

export function buildAlertTelegramMessage(input: {
  severity: "WARNING" | "CRITICAL";
  pondName?: string | null;
  deviceId: string;
  message: string;
  action?: string | null;
  status: "ACTIVE" | "CLEARED" | "ACKNOWLEDGED";
  eventTime: Date;
}): string {
  const lines = [
    `ALERT ${input.severity}`,
    `Kolam: ${input.pondName || "Kolam"}`,
    `Device: ${input.deviceId}`,
    `Status: ${input.status}`,
    `Pesan: ${input.message}`,
  ];

  if (input.action) {
    lines.push(`Aksi: ${input.action}`);
  }

  lines.push(`Waktu: ${input.eventTime.toLocaleString("id-ID")}`);

  return lines.join("\n");
}
