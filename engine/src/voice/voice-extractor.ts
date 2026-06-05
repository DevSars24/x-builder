import type { VoiceProfile } from "@x-builder/shared";

export function extractVoiceProfile(posts: string[]): VoiceProfile {
  const now = new Date().toISOString();

  return {
    id: "voice_default",
    name: "Default voice",
    tone: inferTone(posts),
    sentenceShape: ["short lines", "direct claims"],
    commonMoves: ["specific tradeoff", "operator lesson"],
    topics: inferTopics(posts),
    phrasesToAvoid: ["revolutionary", "game-changing", "seamless"],
    examplePostIds: [],
    enabled: true,
    updatedAt: now
  };
}

function inferTone(posts: string[]): string[] {
  const joined = posts.join(" ").toLowerCase();
  const tones = ["direct"];
  if (joined.includes("founder") || joined.includes("operator")) tones.push("founder-led");
  if (joined.includes("agent") || joined.includes("api") || joined.includes("infra")) tones.push("technical");
  return tones;
}

function inferTopics(posts: string[]): string[] {
  const joined = posts.join(" ").toLowerCase();
  return ["agents", "product", "founder"].filter((topic) => joined.includes(topic));
}
