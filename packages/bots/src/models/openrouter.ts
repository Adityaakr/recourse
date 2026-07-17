// OpenRouter backend (OpenAI-compatible). Reads OPENROUTER_API_KEY only from
// the bot's own env — nothing secret ever touches the chain or the frontend.
// Used by the `steady` and `premium` personas when a key is present; falls
// back to mock otherwise so the demo never hard-depends on a key.

import type { Task } from "@recourse/tasks";
import { mockSolve } from "./mock.js";

const BASE = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
const MODEL = process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4";

/** Strip accidental markdown fences the model may wrap code in. */
function unfence(text: string): string {
  const m = text.match(/```(?:[a-z]*)?\n([\s\S]*?)```/i);
  return (m ? m[1]! : text).trim();
}

export async function openrouterSolve(task: Task): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return mockSolve(task);

  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/Adityaakr/recourse",
      "X-Title": "recourse",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a precise assistant. Follow the task's output format exactly. " +
            "Output only the requested content (code or JSON as asked) with no explanation and no markdown fences.",
        },
        { role: "user", content: task.prompt },
      ],
      max_tokens: 800,
      temperature: 0,
    }),
  });
  if (!res.ok) throw new Error(`openrouter ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return unfence(data.choices[0]!.message.content);
}
