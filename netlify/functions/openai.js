// netlify/functions/openai.js
const OpenAI = require("openai"); // dùng require thay vì import

// tạo client
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

exports.handler = async function (event, context) {
  try {
    const body = JSON.parse(event.body || "{}");
    const query = body.query || "";

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Extract object and context keywords from the query. Return only JSON.",
        },
        { role: "user", content: query },
      ],
      temperature: 0,
      max_tokens: 1000,
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        result: completion.choices[0].message.content || "{}",
      }),
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
