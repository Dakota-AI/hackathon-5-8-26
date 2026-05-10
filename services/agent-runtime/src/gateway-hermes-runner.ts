import type { HermesRunner } from "./ports.js";

export interface GatewayHermesRunnerOptions {
  readonly url: string;
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly fetch?: typeof fetch;
}

export class GatewayHermesRunner implements HermesRunner {
  private readonly fetchImpl: typeof fetch;

  public constructor(private readonly options: GatewayHermesRunnerOptions) {
    this.fetchImpl = options.fetch ?? fetch;
  }

  public static fromEnvironment(): GatewayHermesRunner {
    const apiKey = process.env.HERMES_GATEWAY_API_KEY ?? process.env.API_SERVER_KEY;
    if (!apiKey) {
      throw new Error("Missing required HERMES_GATEWAY_API_KEY (or API_SERVER_KEY) for the Hermes gateway client");
    }
    return new GatewayHermesRunner({
      url: process.env.HERMES_GATEWAY_URL ?? "http://127.0.0.1:8642",
      apiKey,
      model: process.env.HERMES_MODEL ?? "hermes-agent",
      timeoutMs: Number(process.env.HERMES_TIMEOUT_MS ?? "600000")
    });
  }

  async run(prompt: string): Promise<{ summary: string; rawOutput: string; mode: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.options.url}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.options.apiKey}`
        },
        body: JSON.stringify({
          model: this.options.model,
          messages: [{ role: "user", content: prompt }],
          stream: false
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await safeReadText(response);
        throw new Error(`Hermes gateway returned ${response.status} ${response.statusText}: ${errorText}`);
      }

      const payload = (await response.json()) as ChatCompletionResponse;
      const content = extractAssistantContent(payload);
      return {
        summary: firstNonEmptyLine(content) ?? "Hermes gateway returned an empty response.",
        rawOutput: content,
        mode: "hermes-gateway"
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

interface ChatCompletionResponse {
  readonly choices?: ReadonlyArray<{
    readonly message?: { readonly content?: string };
  }>;
}

function extractAssistantContent(payload: ChatCompletionResponse): string {
  const message = payload.choices?.[0]?.message?.content;
  if (typeof message !== "string") {
    throw new Error("Hermes gateway response missing choices[0].message.content");
  }
  return message;
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "<no response body>";
  }
}

function firstNonEmptyLine(value: string): string | undefined {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
}
