import { STAGES, type Stage } from "../shared/progress";

/** Where a booklet in progress has got to. */
export interface ProgressState {
  stage: Stage;
  /** When this stage (or print pass) started, from Date.now(). */
  since: number;
  /** For stages that can count: images loaded, bytes received. */
  done?: number;
  total?: number;
  /** Print pass, from 1. */
  pass?: number;
}

const PASS_SHARE = 0.55; // the first print pass is the slow one; later passes split the rest

/**
 * Percent complete. Stages that report counts fill their share exactly.
 * Others creep towards the end of their share, slowing down as they go, so
 * the bar keeps moving without ever claiming to be done early.
 */
export function percent(state: ProgressState, now: number): number {
  let { from, to } = STAGES[state.stage];

  if (state.stage === "printing" && state.pass) {
    const span = to - from;
    if (state.pass === 1) to = from + span * PASS_SHARE;
    else {
      from = from + span * PASS_SHARE + ((span * (1 - PASS_SHARE)) / 2) * (state.pass - 2);
      to = Math.min(STAGES.printing.to, from + (span * (1 - PASS_SHARE)) / 2);
    }
  }

  if (state.total) return from + ((to - from) * Math.min(state.done ?? 0, state.total)) / state.total;
  const elapsed = Math.max(0, now - state.since);
  return from + (to - from) * 0.9 * (1 - Math.exp(-elapsed / 4000));
}

export function describe(state: ProgressState): string {
  const label = STAGES[state.stage].label;
  if (state.stage === "loading" && state.total) return `${label} (${state.done ?? 0} of ${state.total})`;
  if (state.stage === "printing" && state.pass && state.pass > 1) return `${label}, adding page numbers`;
  if (state.stage === "downloading" && state.total) {
    return `${label} (${(state.done ?? 0) >> 10} of ${state.total >> 10} KB)`;
  }
  return label;
}

/** 7s, 1:05 */
export function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
