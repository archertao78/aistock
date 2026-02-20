const fetch = global.fetch || require("node-fetch");

function extractText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const output = Array.isArray(data?.output) ? data.output : [];
  const parts = output.flatMap((item) => (Array.isArray(item?.content) ? item.content : []));
  const texts = parts
    .filter((part) => part?.type === "output_text")
    .map((part) => part?.text || "")
    .filter(Boolean);

  return texts.join("\n").trim();
}

async function callOpenAI({ apiKey, model, baseUrl, prompt }) {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  const base = String(baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const url = `${base}/responses`;
  const payload = {
    model,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: prompt,
          },
        ],
      },
    ],
    temperature: 0.2,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = data?.error?.message || `OpenAI request failed, HTTP ${response.status}`;
    throw new Error(msg);
  }

  const text = extractText(data);
  if (!text) {
    throw new Error("OpenAI returned empty output.");
  }

  return text;
}

module.exports = {
  callOpenAI,
};
