exports.handler = async function (event) {
  try {
    // Sử dụng import() động để nhập node-fetch
    const { default: fetch } = await import("node-fetch");

    const body = JSON.parse(event.body || "{}");
    const { messages, model, temperature, max_tokens, systemInstruction } = body;

    const apiKey = process.env.GEMINI_API_KEY; // Replace with your environment variable name
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const payload = {
      contents: messages,
      generationConfig: {
        temperature: temperature,
        max_tokens: max_tokens,
        responseMimeType: "application/json",
      },
      systemInstruction: systemInstruction,
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
    const result = data.candidates[0]?.content?.parts[0]?.text || "{}";

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result }),
    };
  } catch (err) {
    console.error("Gemini API error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
