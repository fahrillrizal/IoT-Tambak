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
    console.error("[Telegram] TELEGRAM_BOT_TOKEN is not configured");
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
  deviceName?: string | null;
  message: string;
  action?: string | null;
  status: "ACTIVE" | "CLEARED" | "ACKNOWLEDGED";
  eventTime: Date;
}): string {
  const deviceLabel = input.deviceName?.trim() || input.deviceId;
  const emoji = input.severity === "CRITICAL" ? "🚨" : "⚠️";
  const lines = [
    `${emoji} ${input.severity} — Water Quality Alert`,
    `Pond: ${input.pondName || "Pond"}`,
    `Device: ${deviceLabel}`,
    `Status: ${input.status}`,
    `Message: ${input.message}`,
  ];

  if (input.action) {
    lines.push(`Action: ${input.action}`);
  }

  lines.push(
    `Time: ${input.eventTime.toLocaleString("en-US", {
      timeZone: "Asia/Jakarta",
    })}`,
  );

  return lines.join("\n");
}
