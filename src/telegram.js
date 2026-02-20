const fetch = global.fetch || require("node-fetch");

const TELEGRAM_API_BASE = String(process.env.TELEGRAM_API_BASE || "https://api.telegram.org").replace(/\/+$/, "");

async function sendTelegramMessage({ botToken, chatId, text }) {
  const token = String(botToken || "").trim();
  const targetChat = String(chatId || "").trim();
  const bodyText = String(text || "").trim();

  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is missing.");
  }
  if (!targetChat) {
    throw new Error("TELEGRAM_CHAT_ID is missing.");
  }
  if (!bodyText) {
    throw new Error("Telegram message text is empty.");
  }

  const url = `${TELEGRAM_API_BASE}/bot${token}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: targetChat,
      text: bodyText,
      disable_web_page_preview: true,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok !== true) {
    const message = data?.description || `Telegram request failed, HTTP ${response.status}`;
    throw new Error(message);
  }

  return data?.result || null;
}

module.exports = {
  sendTelegramMessage,
};
