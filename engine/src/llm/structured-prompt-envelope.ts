import type { NormalizedStructuredLlmRequest } from "./structured-llm-service.js";

// The single canonical structured-output prompt envelope. Extracted verbatim from
// the codex provider so codex and cursor share one prompt shape; the codex prompt
// snapshot pins this byte-for-byte. It restates the instructions, the role-tagged
// conversation, and the structured output contract with the schema inline.
export const buildStructuredPromptEnvelope = <TOutput>(
  request: NormalizedStructuredLlmRequest<TOutput>,
): string =>
  [
    "Task instructions:",
    request.instructions,
    "",
    "Conversation:",
    ...request.turns.map((turn) => `[${turn.role}]\n${turn.content}`),
    "",
    "Structured output contract:",
    `Name: ${request.structuredOutput.name}`,
    `Strict: ${request.structuredOutput.strict ? "true" : "false"}`,
    "Return exactly one single JSON object that conforms to this JSON Schema.",
    "Do not include Markdown, code fences, prose before or after JSON, JSONL events, or additional JSON values.",
    JSON.stringify(request.structuredOutput.schema, null, 2),
  ].join("\n");
