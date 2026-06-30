import type {
  GenerateCategory,
  JudgeVerdict,
} from "@x-builder/shared";
import type { JudgeAnnotation } from "@x-builder/shared";
import type { CSSProperties, ReactElement, RefObject } from "react";

import type { ExplainerSource } from "../explainer/types";
import { CompositionHighlightLayer } from "../highlight/composition-highlight-layer";
import { JudgeStrip, type JudgeState } from "../judge/judge-strip";
import { ProvenanceController } from "../provenance/provenance-controller";

import { ChannelDivider } from "./channel-divider";
import { ComposeGenerateRail } from "./compose-generate-rail";
import type { ApplyState } from "./compose-machine";
import { StaticEngineColumn, type AnalyzeState } from "./static-engine-column";
import type { ScoredPostItem } from "./types";
import type { SnapshotRect } from "./use-compose-snapshot";

const EMPTY_ANNOTATIONS: readonly JudgeAnnotation[] = Object.freeze([]);

const JUDGE_GAP_PX = 20;

const ROOT_STYLE: CSSProperties = {
  position: "fixed",
  inset: 0,
  overflowX: "hidden",
  pointerEvents: "none",
  zIndex: "var(--xb-z-pin)",
};

const STACKED_ROOT_EXTRA: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-4)",
  padding: "var(--space-4)",
  overflowY: "auto",
};

const PIN_BASE_STYLE: CSSProperties = {
  position: "absolute",
  overflow: "auto",
  overscrollBehavior: "contain",
  maxHeight: "80vh",
  pointerEvents: "auto",
};

const STACKED_PIN_STYLE: CSSProperties = {
  position: "relative",
  overflow: "auto",
  overscrollBehavior: "contain",
  maxHeight: "60vh",
  pointerEvents: "auto",
};

export type ComposeCockpitAssemblyProps = {
  rootRef: RefObject<HTMLDivElement | null>;
  stacked: boolean;
  snapshot: {
    modal: SnapshotRect | null;
  };
  composerEl: HTMLElement;
  composerText: string;
  annotations: JudgeAnnotation[];
  latestVerdict: JudgeVerdict | null;
  categories: GenerateCategory[];
  pendingCategory: string | undefined;
  onGenerate: (category: GenerateCategory) => void;
  analyzeState: AnalyzeState;
  followers: number | undefined;
  onRetryStatic: () => void;
  explainer: ExplainerSource;
  judgeState: JudgeState;
  applyState: ApplyState;
  onRunJudge: () => void;
  canRunJudge: boolean;
  showRunJudge: boolean;
  onApplyAll: () => void;
  feedbackControl: ReactElement;
  captureSetAnchor: (setAnchor: (text: string) => void) => void;
};

export function ComposeCockpitAssembly({
  rootRef,
  stacked,
  snapshot,
  composerEl,
  composerText,
  annotations,
  latestVerdict,
  categories,
  pendingCategory,
  onGenerate,
  analyzeState,
  followers,
  onRetryStatic,
  explainer,
  judgeState,
  applyState,
  onRunJudge,
  canRunJudge,
  showRunJudge,
  onApplyAll,
  feedbackControl,
  captureSetAnchor,
}: ComposeCockpitAssemblyProps): ReactElement {
  const railStyle = widePinStyle(snapshot.modal, "left");
  const staticStyle = widePinStyle(snapshot.modal, "right");
  const judgeStyle = wideJudgeStyle(snapshot.modal);

  return (
    <div
      ref={rootRef}
      data-cockpit={stacked ? "stacked" : "wide"}
      style={stacked ? { ...ROOT_STYLE, ...STACKED_ROOT_EXTRA } : ROOT_STYLE}
    >
      <ProvenanceController
        composerEl={composerEl}
        composerText={composerText}
        annotations={annotations}
        latestVerdict={latestVerdict}
      >
        {(ctx) => {
          captureSetAnchor(ctx.setAnchor);
          return (
            <>
              <div data-cockpit-pin style={stacked ? STACKED_PIN_STYLE : railStyle}>
                <ComposeGenerateRail
                  categories={categories}
                  pending={pendingCategory}
                  onGenerate={onGenerate}
                />
              </div>

              <div data-cockpit-pin style={stacked ? STACKED_PIN_STYLE : staticStyle}>
                {stacked ? <ChannelDivider leading="Static engine" trailing="AI judge" /> : null}
                <StaticEngineColumn
                  analyzeState={analyzeState}
                  followers={followers}
                  onRetryStatic={onRetryStatic}
                  explainer={explainer}
                />
              </div>

              <div data-cockpit-pin style={stacked ? STACKED_PIN_STYLE : judgeStyle}>
                {stacked ? <ChannelDivider leading="Static engine" trailing="AI judge" /> : null}
                <JudgeStrip
                  judge={judgeState}
                  provenance={ctx.provenanceState}
                  applyState={applyState}
                  onRunJudge={onRunJudge}
                  canRunJudge={canRunJudge}
                  showRunJudge={showRunJudge}
                  approved={ctx.approved}
                  onApplyAll={onApplyAll}
                  explainer={explainer}
                />
                {feedbackControl}
              </div>

              <CompositionHighlightLayer
                composerEl={composerEl}
                annotations={ctx.showGreen ? (EMPTY_ANNOTATIONS as JudgeAnnotation[]) : annotations}
                showGreen={ctx.showGreen}
              />
            </>
          );
        }}
      </ProvenanceController>
    </div>
  );
}

function widePinStyle(modal: SnapshotRect | null, side: "left" | "right"): CSSProperties {
  if (modal === null) {
    return {
      ...PIN_BASE_STYLE,
      top: 0,
      left: side === "left" ? 0 : undefined,
      right: side === "right" ? 0 : undefined,
      width: "320px",
    };
  }
  const width = 320;
  const gap = JUDGE_GAP_PX;
  if (side === "left") {
    return { ...PIN_BASE_STYLE, top: `${modal.top}px`, left: `${modal.left - width - gap}px`, width: `${width}px` };
  }
  return { ...PIN_BASE_STYLE, top: `${modal.top}px`, left: `${modal.left + modal.width + gap}px`, width: `${width}px` };
}

function wideJudgeStyle(modal: SnapshotRect | null): CSSProperties {
  if (modal === null) {
    return { ...PIN_BASE_STYLE, bottom: 0, left: 0, width: "480px" };
  }
  return {
    ...PIN_BASE_STYLE,
    top: `${modal.top + modal.height + JUDGE_GAP_PX}px`,
    left: `${modal.left}px`,
    width: `${modal.width}px`,
  };
}
