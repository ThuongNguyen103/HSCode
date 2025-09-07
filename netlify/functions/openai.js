// netlify/functions/openai.js
import { OpenAI } from "openai"; // <-- dùng named import

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function handler(event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const query = body.query || "";

    // Gọi OpenAI Chat Completions
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
}
