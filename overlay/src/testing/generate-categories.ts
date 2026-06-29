// @x-builder/overlay — ComposeGenerateRail test fixtures (ticket-owned)
//
// These are the canonical `GenerateCategory[]` shapes the rail tests pin. They
// use the REAL `GenerateCategory` type from `@x-builder/shared` (no Zod dup) so
// the fixtures stay in lockstep with the schema.
//
// `defaultCategories` is the cold-start set (all `basis: "default"`,
// `sampleCount: 0`, `recentCount: 0`, `windowDays: 7`, `cooldownStatus:
// "clear"`). `cooldownCategory` is a single corpus-backed (`basis:
// "top_performer"`) category in cooldown, used to drive the warning-badge
// annotation case.

import type { GenerateCategory } from "@x-builder/shared";

const FORMATS: GenerateCategory["format"][] = [
  "hot_take",
  "founder_story",
  "audience_question",
  "story",
];

/** The 4 cold-start categories returned before any corpus exists. */
export const defaultCategories: GenerateCategory[] = [
  {
    id: "hot_take",
    label: "Hot take",
    format: "hot_take",
    basis: "default",
    cooldownStatus: "clear",
    sampleCount: 0,
    recentCount: 0,
    windowDays: 7,
  },
  {
    id: "founder_story",
    label: "Build-in-public",
    format: "founder_story",
    basis: "default",
    cooldownStatus: "clear",
    sampleCount: 0,
    recentCount: 0,
    windowDays: 7,
  },
  {
    id: "audience_question",
    label: "Question",
    format: "audience_question",
    basis: "default",
    cooldownStatus: "clear",
    sampleCount: 0,
    recentCount: 0,
    windowDays: 7,
  },
  {
    id: "story",
    label: "Story",
    format: "story",
    basis: "default",
    cooldownStatus: "clear",
    sampleCount: 0,
    recentCount: 0,
    windowDays: 7,
  },
];

/** A corpus-backed category in cooldown — drives the warning-badge annotation. */
export const cooldownCategory: GenerateCategory = {
  id: "hot_take",
  label: "Hot take",
  format: "hot_take",
  basis: "top_performer",
  cooldownStatus: "cooldown",
  sampleCount: 4,
  recentCount: 4,
  windowDays: 7,
};

/** Build a long, valid category list for rail overflow coverage. */
export function makeCategoryList(count = 16): GenerateCategory[] {
  return Array.from({ length: count }, (_, index) => {
    const ordinal = String(index + 1).padStart(2, "0");
    return {
      id: `category_${ordinal}`,
      label:
        index === 0 ? `Detailed category label number ${ordinal}` : `Category ${ordinal}`,
      format: FORMATS[index % FORMATS.length]!,
      basis: index % 2 === 0 ? "default" : "top_performer",
      cooldownStatus: "clear",
      sampleCount: index,
      recentCount: 0,
      windowDays: 7,
    };
  });
}
