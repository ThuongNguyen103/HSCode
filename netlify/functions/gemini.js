import fetch from "cross-fetch";

export async function handler(event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const { model, messages, temperature, max_tokens } = body;

    const apiKey = process.env.GEMINI_API_KEY;
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const payload = {
      contents: messages,
      generationConfig: {
        temperature: temperature || 0,
        responseMimeType: "application/json",
      },
      // Lưu ý: Gemini 1.5 Flash không hỗ trợ `systemInstruction` trong JSON,
      // nên chúng ta sẽ bỏ nó đi và gộp vào `messages`.
    };

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API call failed with status ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result: data }),
    };
  } catch (err) {
    console.error("Gemini API error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
}
