/**
 * AI Provider Abstraction
 * Supports OpenAI, Anthropic (Claude), and Ollama backends.
 * Switch via AI_PROVIDER env var.
 */

export type AIProvider = "openai" | "anthropic" | "ollama";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionOptions {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface CompletionResult {
  content: string;
  finishReason: string | null;
}

function getProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER?.toLowerCase() ?? "openai";
  if (provider === "openai" || provider === "anthropic" || provider === "ollama") {
    return provider;
  }
  console.warn(`Unknown AI_PROVIDER "${provider}", defaulting to openai`);
  return "openai";
}

async function callOpenAI(options: CompletionOptions): Promise<CompletionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages: options.messages,
      max_tokens: options.maxTokens ?? 1024,
      temperature: options.temperature ?? 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content ?? "",
    finishReason: data.choices?.[0]?.finish_reason ?? null,
  };
}

async function callAnthropic(options: CompletionOptions): Promise<CompletionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  // Extract system message and convert to Anthropic format
  const systemMessage = options.messages.find((m) => m.role === "system");
  const nonSystemMessages = options.messages.filter((m) => m.role !== "system");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-20241022",
      max_tokens: options.maxTokens ?? 1024,
      system: systemMessage?.content ?? "",
      messages: nonSystemMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  return {
    content: data.content?.[0]?.text ?? "",
    finishReason: data.stop_reason ?? null,
  };
}

async function callOllama(options: CompletionOptions): Promise<CompletionResult> {
  const baseUrl = process.env.OLLAMA_URL ?? "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL ?? "llama3.2";

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: options.messages,
      stream: false,
      options: {
        num_predict: options.maxTokens ?? 1024,
        temperature: options.temperature ?? 0.7,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Ollama API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  return {
    content: data.message?.content ?? "",
    finishReason: data.done ? "stop" : null,
  };
}

/**
 * Call the configured AI provider with the given messages.
 */
export async function complete(options: CompletionOptions): Promise<CompletionResult> {
  const provider = getProvider();

  switch (provider) {
    case "openai":
      return callOpenAI(options);
    case "anthropic":
      return callAnthropic(options);
    case "ollama":
      return callOllama(options);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Simple helper for single-turn completions.
 */
export async function ask(
  systemPrompt: string,
  userPrompt: string,
  options?: Partial<CompletionOptions>
): Promise<string> {
  const result = await complete({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    ...options,
  });
  return result.content;
}
