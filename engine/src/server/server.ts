import Fastify from "fastify";
import { generateIdeaRequestSchema } from "@x-builder/shared";
import { generateCandidates } from "../writer/writer-engine";

export function buildServer() {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ ok: true }));

  app.post("/ideas/generate", async (request) => {
    const input = generateIdeaRequestSchema.parse(request.body);
    return generateCandidates(input);
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = buildServer();
  await app.listen({ port: 8787, host: "127.0.0.1" });
}
