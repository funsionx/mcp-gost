import { OpenRouter } from "@openrouter/sdk";
import { EventEmitter } from "eventemitter3";
import { z } from "zod";
import type { OpenRouterConfig } from "../config/env.js";
import { documentSchema, type GostDocument } from "../schemas.js";

export type AgentMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type GostAgentEvents = {
  "message:user": (message: AgentMessage) => void;
  "message:assistant": (message: AgentMessage) => void;
  "stream:start": () => void;
  "stream:end": (fullText: string) => void;
  error: (error: Error) => void;
};

export type DraftDocumentInput = {
  prompt: string;
  sourceText?: string;
};

const agentResponseSchema = z.object({
  document: documentSchema,
  notes: z.array(z.string()).default([]),
});

export type DraftDocumentResult = z.infer<typeof agentResponseSchema>;

const instructions = `Ты агент сервиса mcp-gost. Твоя задача — преобразовать пользовательское задание или текст научной/учебной работы в JSON-модель для генерации PDF по ГОСТ 7.32-2017.

Верни только валидный JSON без markdown-блоков и пояснений вокруг него.
Формат ответа:
{
  "document": {
    "documentType": "report" | "coursework" | "diploma" | "practice-report",
    "standard": "GOST_7_32_2017",
    "language": "ru",
    "titlePage": {
      "university": "...",
      "faculty": "",
      "department": "",
      "title": "...",
      "subtitle": "...",
      "author": "...",
      "group": "",
      "supervisor": "...",
      "city": "...",
      "year": 2026
    },
    "abstract": "...",
    "introduction": "...",
    "sections": [
      { "id": "section-1", "title": "...", "content": "...", "level": 1 }
    ],
    "conclusion": "...",
    "bibliography": [
      { "id": "source-1", "kind": "website", "raw": "..." }
    ],
    "appendices": []
  },
  "notes": []
}

Если в исходных данных не хватает сведений для титульного листа, заполняй консервативные placeholders на русском, но не оставляй обязательные поля пустыми. sections.level допускает только 1, 2 или 3.
Каждый section.content должен содержать осмысленный непустой абзац.
Всегда заполняй introduction и conclusion. Делай минимум два основных раздела. Если источники не указаны, добавь 1-2 релевантных website-источника в bibliography.`;

export class GostAgentService extends EventEmitter<GostAgentEvents> {
  private readonly client: OpenRouter;

  constructor(private readonly config: OpenRouterConfig) {
    super();
    this.client = new OpenRouter({ apiKey: config.apiKey });
  }

  async draftDocument(input: DraftDocumentInput): Promise<DraftDocumentResult> {
    const userMessage = this.buildUserMessage(input);
    this.emit("message:user", { role: "user", content: userMessage });
    this.emit("stream:start");

    try {
      const result = this.client.callModel({
        model: this.config.model,
        instructions,
        input: userMessage,
      });
      const text = await result.getText();
      this.emit("stream:end", text);
      this.emit("message:assistant", { role: "assistant", content: text });

      return await this.parseOrRepair(userMessage, text);
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      this.emit("error", normalized);
      throw normalized;
    }
  }

  private async parseOrRepair(
    userMessage: string,
    text: string
  ): Promise<DraftDocumentResult> {
    try {
      return agentResponseSchema.parse(JSON.parse(extractJson(text)));
    } catch (error) {
      const repairPrompt = `Предыдущий ответ не прошёл валидацию. Исправь JSON и верни только валидный JSON в том же формате.

Ошибка валидации:
${error instanceof Error ? error.message : String(error)}

Исходное задание:
${userMessage}

Предыдущий ответ:
${text}`;

      const repair = this.client.callModel({
        model: this.config.model,
        instructions,
        input: repairPrompt,
      });
      const repairedText = await repair.getText();
      this.emit("message:assistant", {
        role: "assistant",
        content: repairedText,
      });

      return agentResponseSchema.parse(JSON.parse(extractJson(repairedText)));
    }
  }

  private buildUserMessage(input: DraftDocumentInput): string {
    return [
      `Задание пользователя: ${input.prompt}`,
      input.sourceText ? `Исходный текст работы:\n${input.sourceText}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");
  }
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("OpenRouter response does not contain JSON.");
  }

  return trimmed.slice(start, end + 1);
}
