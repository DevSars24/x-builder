import { readFile } from "node:fs/promises";
import type { DetectedPostFormat } from "@x-builder/shared";

const PLAYBOOK_SLICE_CHAR_LIMIT = 6_000;

export type GenerationGuidanceRequest = {
  format: DetectedPostFormat;
  idea?: string;
  voiceProfileId?: string;
  useKnownPostIds: string[];
};

export type FormatPlaybookMapping = Readonly<
  Record<
    DetectedPostFormat,
    {
      sectionIds: string[];
      priority: "primary" | "secondary";
      includeFallbackGeneral: boolean;
    }
  >
>;

export type PlaybookSlice = {
  format: DetectedPostFormat;
  sourcePath?: string;
  sections: Array<{
    id: string;
    heading: string;
    content: string;
    charCount: number;
  }>;
  content: string;
  charCount: number;
  truncated: boolean;
};

export type VoiceSamplePost = {
  id: string;
  platformPostId: string;
  text: string;
  createdAt: string;
  kind: "original";
  source: "known_post_id" | "profile_sample" | "recent_original";
};

export type GenerationContext = {
  request: GenerationGuidanceRequest;
  playbook: PlaybookSlice;
  voiceSamples: VoiceSamplePost[];
  renderedGuidance?: string;
};

export type GenerationGuidanceResolver = (
  request: GenerationGuidanceRequest,
) => Promise<string | undefined>;

export type ResolvePlaybookSliceInput = {
  format: DetectedPostFormat;
  knowledgeBasePath?: string;
};

type FounderStoryGuardrail = {
  preserveUserSuppliedStakes: true;
  forbidInventedEmotionalContent: true;
};

type FormatPlaybookMappingWithMetadata = FormatPlaybookMapping & {
  readonly founder_story: FormatPlaybookMapping["founder_story"] & {
    readonly founderStoryGuardrail: FounderStoryGuardrail;
  };
};

const baseFormatPlaybookMapping = {
  genuine_question: {
    sectionIds: ["format-taxonomy", "growth-loop", "daily-playbook"],
    priority: "primary",
    includeFallbackGeneral: false,
  },
  hot_take: {
    sectionIds: ["format-taxonomy", "status-gate"],
    priority: "secondary",
    includeFallbackGeneral: false,
  },
  audience_question: {
    sectionIds: ["format-taxonomy", "growth-loop", "daily-playbook"],
    priority: "primary",
    includeFallbackGeneral: false,
  },
  story: {
    sectionIds: ["format-taxonomy", "core-finding", "daily-playbook"],
    priority: "primary",
    includeFallbackGeneral: false,
  },
  founder_story: {
    sectionIds: ["founder-story", "format-taxonomy", "daily-playbook"],
    priority: "primary",
    includeFallbackGeneral: false,
  },
  insight_share: {
    sectionIds: ["format-taxonomy", "core-finding", "status-gate"],
    priority: "secondary",
    includeFallbackGeneral: false,
  },
  ab_choice: {
    sectionIds: ["format-taxonomy", "growth-loop"],
    priority: "primary",
    includeFallbackGeneral: false,
  },
  connect: {
    sectionIds: ["format-taxonomy", "growth-loop", "graph-quality"],
    priority: "secondary",
    includeFallbackGeneral: false,
  },
  other: {
    sectionIds: ["general"],
    priority: "secondary",
    includeFallbackGeneral: true,
  },
  fill_blank_tribal: {
    sectionIds: ["format-taxonomy", "core-finding", "daily-playbook"],
    priority: "primary",
    includeFallbackGeneral: false,
  },
  cta_farm: {
    sectionIds: ["format-taxonomy", "growth-loop", "graph-quality"],
    priority: "secondary",
    includeFallbackGeneral: false,
  },
  fantasy_question: {
    sectionIds: ["format-taxonomy", "growth-loop"],
    priority: "primary",
    includeFallbackGeneral: false,
  },
  binary_choice: {
    sectionIds: ["format-taxonomy", "growth-loop"],
    priority: "primary",
    includeFallbackGeneral: false,
  },
  nuanced_question: {
    sectionIds: ["format-taxonomy", "status-gate"],
    priority: "secondary",
    includeFallbackGeneral: false,
  },
  recognition_roast: {
    sectionIds: ["format-taxonomy", "core-finding", "daily-playbook"],
    priority: "primary",
    includeFallbackGeneral: false,
  },
  wisdom_one_liner: {
    sectionIds: ["format-taxonomy", "status-gate"],
    priority: "secondary",
    includeFallbackGeneral: false,
  },
  milestone: {
    sectionIds: ["format-taxonomy", "growth-loop", "graph-quality"],
    priority: "secondary",
    includeFallbackGeneral: false,
  },
} as const satisfies FormatPlaybookMapping;

export const formatPlaybookMapping = {
  ...baseFormatPlaybookMapping,
  founder_story: {
    ...baseFormatPlaybookMapping.founder_story,
    founderStoryGuardrail: {
      preserveUserSuppliedStakes: true,
      forbidInventedEmotionalContent: true,
    },
  },
} as const satisfies FormatPlaybookMappingWithMetadata;

type ParsedPlaybookSection = {
  id: string;
  heading: string;
  content: string;
};

type MarkdownHeading = {
  lineIndex: number;
  level: number;
  heading: string;
};

const emptyPlaybookSlice = (input: ResolvePlaybookSliceInput): PlaybookSlice => ({
  format: input.format,
  ...(input.knowledgeBasePath === undefined ? {} : { sourcePath: input.knowledgeBasePath }),
  sections: [],
  content: "",
  charCount: 0,
  truncated: false,
});

const normalizeSectionId = (heading: string): string => {
  const normalized = heading
    .trim()
    .replace(/^\d+\.\s*/, "")
    .replaceAll("_", "-")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/[\s-]+/g, "-")
    .replace(/^-|-$/g, "");

  if (normalized === "founder-story-is-real-but-amplifier-gated") {
    return "founder-story";
  }

  return normalized;
};

const parseMarkdownHeadings = (markdown: string): MarkdownHeading[] => {
  const lines = markdown.split(/\r?\n/);
  const headings: MarkdownHeading[] = [];
  const headingPattern = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

  lines.forEach((line, lineIndex) => {
    const match = headingPattern.exec(line);
    const marker = match?.[1];
    const heading = match?.[2];
    if (marker === undefined || heading === undefined) {
      return;
    }

    headings.push({
      lineIndex,
      level: marker.length,
      heading: heading.trim(),
    });
  });

  return headings;
};

const parsePlaybookSections = (markdown: string): Map<string, ParsedPlaybookSection> => {
  const lines = markdown.split(/\r?\n/);
  const headings = parseMarkdownHeadings(markdown);
  const sections = new Map<string, ParsedPlaybookSection>();

  headings.forEach((heading, headingIndex) => {
    const id = normalizeSectionId(heading.heading);
    if (id.length === 0 || sections.has(id)) {
      return;
    }

    const nextPeerOrParent = headings
      .slice(headingIndex + 1)
      .find((candidate) => candidate.level <= heading.level);
    const endLineIndex = nextPeerOrParent?.lineIndex ?? lines.length;
    const content = lines.slice(heading.lineIndex + 1, endLineIndex).join("\n").trim();

    sections.set(id, {
      id,
      heading: heading.heading,
      content,
    });
  });

  return sections;
};

const renderPlaybookSection = (section: ParsedPlaybookSection, content: string): string =>
  content.length === 0 ? `## ${section.heading}` : `## ${section.heading}\n\n${content}`;

const appendRenderedSection = (
  currentContent: string,
  section: ParsedPlaybookSection,
): {
  content: string;
  sectionContent: string;
  truncated: boolean;
} => {
  const separator = currentContent.length === 0 ? "" : "\n\n";
  const fullSection = renderPlaybookSection(section, section.content);
  const fullContent = `${currentContent}${separator}${fullSection}`;

  if (fullContent.length <= PLAYBOOK_SLICE_CHAR_LIMIT) {
    return {
      content: fullContent,
      sectionContent: section.content,
      truncated: false,
    };
  }

  const remainingBudget = PLAYBOOK_SLICE_CHAR_LIMIT - currentContent.length - separator.length;
  if (remainingBudget <= 0) {
    return {
      content: currentContent,
      sectionContent: "",
      truncated: true,
    };
  }

  const sectionPrefix = section.content.length === 0 ? `## ${section.heading}` : `## ${section.heading}\n\n`;
  if (sectionPrefix.length >= remainingBudget) {
    return {
      content: `${currentContent}${separator}${sectionPrefix.slice(0, remainingBudget).trimEnd()}`,
      sectionContent: "",
      truncated: true,
    };
  }

  const sectionContent = section.content.slice(0, remainingBudget - sectionPrefix.length).trimEnd();

  return {
    content: `${currentContent}${separator}${sectionPrefix}${sectionContent}`,
    sectionContent,
    truncated: true,
  };
};

export const resolvePlaybookSlice = async (
  input: ResolvePlaybookSliceInput,
): Promise<PlaybookSlice> => {
  if (input.knowledgeBasePath === undefined) {
    return emptyPlaybookSlice(input);
  }

  let markdown: string;
  try {
    markdown = await readFile(input.knowledgeBasePath, "utf8");
  } catch {
    return emptyPlaybookSlice(input);
  }

  if (markdown.trim().length === 0) {
    return emptyPlaybookSlice(input);
  }

  const parsedSections = parsePlaybookSections(markdown);
  const mappedSectionIds = formatPlaybookMapping[input.format].sectionIds;
  const selectedSections = mappedSectionIds
    .map((sectionId) => parsedSections.get(sectionId))
    .filter((section): section is ParsedPlaybookSection => section !== undefined);

  if (selectedSections.length === 0) {
    return emptyPlaybookSlice(input);
  }

  const sections: PlaybookSlice["sections"] = [];
  let content = "";
  let truncated = false;

  for (const section of selectedSections) {
    const appended = appendRenderedSection(content, section);
    if (appended.truncated && appended.sectionContent.length === 0 && appended.content === content) {
      truncated = true;
      break;
    }

    content = appended.content;
    sections.push({
      id: section.id,
      heading: section.heading,
      content: appended.sectionContent,
      charCount: appended.sectionContent.length,
    });

    if (appended.truncated) {
      truncated = true;
      break;
    }
  }

  if (sections.length === 0) {
    return emptyPlaybookSlice(input);
  }

  return {
    format: input.format,
    sourcePath: input.knowledgeBasePath,
    sections,
    content,
    charCount: content.length,
    truncated,
  };
};
