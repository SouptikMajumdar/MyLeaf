export const runtime = "nodejs";

import { ask } from "@/lib/ai/provider";
import { PROMPTS } from "@/lib/ai/prompts";

const MAX_PROMPT_LENGTH = 500;

interface MathRequest {
  prompt: string;
}

function isValidRequest(body: unknown): body is MathRequest {
  return (
    typeof body === "object" &&
    body !== null &&
    "prompt" in body &&
    typeof (body as MathRequest).prompt === "string"
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!isValidRequest(body)) {
      return Response.json(
        { error: "Invalid request. Expected: { prompt: string }" },
        { status: 400 }
      );
    }

    const { prompt } = body;

    if (prompt.length === 0) {
      return Response.json(
        { error: "Prompt cannot be empty" },
        { status: 400 }
      );
    }

    if (prompt.length > MAX_PROMPT_LENGTH) {
      return Response.json(
        { error: `Prompt too long. Maximum ${MAX_PROMPT_LENGTH} characters.` },
        { status: 400 }
      );
    }

    const latex = await ask(PROMPTS.mathHelper, prompt, {
      maxTokens: 256,
      temperature: 0.3, // Lower temperature for more deterministic math output
    });

    // Clean up the response (remove any accidental markdown fences or explanations)
    const cleaned = latex
      .replace(/^```(?:latex)?\n?/i, "")
      .replace(/\n?```$/i, "")
      .trim();

    return Response.json({ latex: cleaned });
  } catch (error) {
    console.error("Math helper error:", error);

    const message = error instanceof Error ? error.message : "Unknown error";

    // Check for missing API key errors
    if (message.includes("API_KEY") || message.includes("not set")) {
      return Response.json(
        { error: "AI provider not configured. Set the appropriate API key." },
        { status: 503 }
      );
    }

    return Response.json({ error: message }, { status: 500 });
  }
}
