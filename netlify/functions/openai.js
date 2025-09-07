// netlify/functions/openai.js
const OpenAI = require("openai");

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

exports.handler = async function (event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const messages = body.messages || [];
    const model = body.model || "gpt-3.5-turbo";
    const temperature = body.temperature ?? 0;
    const max_tokens = body.max_tokens ?? 1000;

    const completion = await client.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens,
    });

    // parse JSON nếu GPT trả về string
    let result = completion.choices[0]?.message?.content || "{}";
    try {
      const parsed = JSON.parse(result);
      result = parsed;
    } catch (e) {
      // fallback: return raw string
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result }),
    };
  } catch (err) {
    console.error("OpenAI error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};

