// Single TIME classification for inventory, details, diagrams, the matrix, and edit preview.

export const TIME_OPTIONS = [
  { value: 'TOLERATE', label: 'Tolerate', color: '#228be6', bg: 'rgba(34, 139, 230, 0.12)', border: 'rgba(34, 139, 230, 0.3)' },
  { value: 'INVEST', label: 'Invest', color: '#2b8a3e', bg: 'rgba(43, 138, 62, 0.12)', border: 'rgba(43, 138, 62, 0.3)' },
  { value: 'MIGRATE', label: 'Migrate', color: '#e67700', bg: 'rgba(230, 119, 0, 0.12)', border: 'rgba(230, 119, 0, 0.3)' },
  { value: 'ELIMINATE', label: 'Eliminate', color: '#c92a2a', bg: 'rgba(201, 42, 42, 0.12)', border: 'rgba(201, 42, 42, 0.3)' },
] as const;

export type TimeValue = (typeof TIME_OPTIONS)[number]['value'];

export interface TimeThresholds {
  technicalFit: number;
  functionalFit: number;
  businessCriticality: number;
  cost: number;
}

export const DEFAULT_TIME_THRESHOLDS: TimeThresholds = {
  technicalFit: 3,
  functionalFit: 3,
  businessCriticality: 4,
  cost: 4,
};

const STORAGE_KEY = 'openea_time_thresholds';

function cutoff(value: unknown, fallback: number): number {
  const score = Number(value);
  if (!Number.isFinite(score)) return fallback;
  return Math.min(5, Math.max(1, score));
}

export function readStoredTimeThresholds(): TimeThresholds {
  if (typeof localStorage === 'undefined') return DEFAULT_TIME_THRESHOLDS;
  try {
    const item = localStorage.getItem(STORAGE_KEY);
    if (!item) return DEFAULT_TIME_THRESHOLDS;
    const parsed = JSON.parse(item) as Partial<TimeThresholds>;
    return {
      technicalFit: cutoff(parsed.technicalFit, DEFAULT_TIME_THRESHOLDS.technicalFit),
      functionalFit: cutoff(parsed.functionalFit, DEFAULT_TIME_THRESHOLDS.functionalFit),
      businessCriticality: cutoff(parsed.businessCriticality, DEFAULT_TIME_THRESHOLDS.businessCriticality),
      cost: cutoff(parsed.cost, DEFAULT_TIME_THRESHOLDS.cost),
    };
  } catch {
    return DEFAULT_TIME_THRESHOLDS;
  }
}

function recordedScore(value: unknown): number | null {
  const score = Number(value);
  if (!Number.isFinite(score) || score <= 0) return null;
  return Math.min(5, Math.max(1, score));
}

export function getAppTimeAssessment(app: { technicalFit?: unknown; functionalFit?: unknown } | null | undefined, thresholds?: TimeThresholds) {
  const active = thresholds ?? DEFAULT_TIME_THRESHOLDS;
  const recordedTech = recordedScore(app?.technicalFit);
  const recordedFunc = recordedScore(app?.functionalFit);
  if (recordedTech == null && recordedFunc == null) return null;

  const techScore = recordedTech ?? 3;
  const funcScore = recordedFunc ?? 3;
  const isTechHigh = techScore >= active.technicalFit;
  const isFuncHigh = funcScore >= active.functionalFit;

  const value: TimeValue = !isTechHigh && isFuncHigh
    ? 'MIGRATE'
    : isTechHigh && isFuncHigh
      ? 'INVEST'
      : isTechHigh
        ? 'TOLERATE'
        : 'ELIMINATE';

  const option = TIME_OPTIONS.find((item) => item.value === value)!;
  return { ...option, techScore, funcScore, isTechHigh, isFuncHigh };
}
