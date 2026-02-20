const fetch = global.fetch || require("node-fetch");

function extractOpenRouterText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const output = Array.isArray(data?.output) ? data.output : [];
  const contentParts = output.flatMap((item) => (Array.isArray(item?.content) ? item.content : []));
  const fromOutput = contentParts
    .filter((part) => part?.type === "output_text")
    .map((part) => part?.text || "")
    .join("\n")
    .trim();
  if (fromOutput) {
    return fromOutput;
  }

  const fromChoices = Array.isArray(data?.choices)
    ? data.choices
        .map((choice) => choice?.message?.content || choice?.text || "")
        .join("\n")
        .trim()
    : "";
  return fromChoices;
}

async function callViaOpenRouter({ apiKey, model, baseUrl, prompt }) {
  const url = `${baseUrl}/responses`;
  const payload = {
    model,
    input: prompt,
    temperature: 0.2,
  };

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  if (process.env.OPENROUTER_REFERER) {
    headers["HTTP-Referer"] = process.env.OPENROUTER_REFERER;
  }
  if (process.env.OPENROUTER_TITLE) {
    headers["X-Title"] = process.env.OPENROUTER_TITLE;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = data?.error?.message || `OpenRouter request failed, HTTP ${response.status}`;
    throw new Error(msg);
  }

  const text = extractOpenRouterText(data);
  if (!text) {
    throw new Error("OpenRouter returned empty output.");
  }

  return text;
}

async function callViaGoogleGemini({ apiKey, model, baseUrl, prompt }) {
  const url = `${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = data?.error?.message || `Gemini request failed, HTTP ${response.status}`;
    throw new Error(msg);
  }

  const text = (data?.candidates || [])
    .flatMap((item) => item?.content?.parts || [])
    .map((part) => part?.text || "")
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Gemini returned empty output.");
  }

  return text;
}

async function callGemini({ apiKey, model, baseUrl, prompt }) {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing.");
  }

  const base = String(baseUrl || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
  const host = base.replace(/^https?:\/\//i, "").split("/")[0].toLowerCase();

  if (host.endsWith("openrouter.ai")) {
    return callViaOpenRouter({ apiKey, model, baseUrl: base, prompt });
  }

  return callViaGoogleGemini({ apiKey, model, baseUrl: base, prompt });
}

module.exports = {
  callGemini,
};
