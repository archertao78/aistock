const BASE_PROMPT = `Role:
You are a senior public-equity research analyst.

Task:
Write a rigorous stock research report using verifiable facts only. Do not invent numbers. When you cite facts, metrics, or events, include the source type and date when possible.

Structure:
1. Fundamentals
- Explain what the company does in plain language.
- Analyze revenue growth, margin trend, and free cash flow.
- Compare valuation versus peers where relevant, such as P/E or EV/EBITDA.
- Note insider ownership or recent insider trading if available.

2. Thesis Review
- Give 3 reasons that support the investment thesis.
- Give 2 counterarguments or key risks.
- End with a final view: bullish, bearish, or neutral, with concise reasoning.

3. Industry And Macro
- Summarize the industry backdrop.
- Summarize the relevant macro drivers.
- Explain the company's competitive position.

Output requirements:
- Use Markdown.
- Start directly with the report title and body.
- Keep the writing concise, professional, and mobile-friendly.
- Do not include conversational filler before the report.`;

function buildPrompt({ symbolOrName, thesis, target }) {
  return `${BASE_PROMPT}

Company or ticker: ${symbolOrName}
Investment thesis: ${thesis || "Not provided"}
Target or objective: ${target || "Not provided"}`;
}

function buildCryptoSignalPrompt({ instId, signalType, candleTime, close, macd, signalLine, histogram }) {
  const signalLabel = signalType === "golden_cross" ? "MACD golden cross" : "MACD death cross";

  return `Role:
You are an experienced crypto market analyst.

Task:
Based on the technical signal below, provide a short actionable note with clear risk awareness.

Signal data:
- Instrument: ${instId}
- Signal type: ${signalLabel}
- Timeframe: 30m
- Candle time: ${candleTime}
- Latest close: ${close}
- MACD: ${macd}
- Signal line: ${signalLine}
- Histogram: ${histogram}

Output requirements:
1. Use Markdown.
2. Include signal interpretation, likely scenario, risks, and a short-term action reference.
3. Keep it around 200-300 words.
4. Start directly with the conclusion and avoid filler.`;
}

module.exports = {
  buildPrompt,
  buildCryptoSignalPrompt,
};
