export const DEFAULT_COST_CURRENCY = 'SEK';

export const COMMON_COST_CURRENCIES = ['SEK', 'EUR', 'USD', 'NOK', 'DKK', 'GBP', 'CHF'] as const;

export const DEFAULT_COST_SCALE: readonly [number, number, number, number] = [
  100_000,
  500_000,
  1_000_000,
  5_000_000,
];

export const COST_TIER_COLORS: readonly [string, string, string, string, string] = [
  '#2b8a3e',
  '#94d82d',
  '#fab005',
  '#e67700',
  '#c92a2a',
];

export type CostUnitKey = 'base' | 'thousand' | 'million' | 'billion';

export interface CostUnit {
  key: CostUnitKey;
  multiplier: number;
  label: string;
  shortPrefix: string;
}

export interface CostScaleBand {
  value: '1' | '2' | '3' | '4' | '5';
  order: number;
  label: string;
  description: string;
  color: string;
  min: number;
  max: number | null;
}

export type TcoSpanKind = 'lifetime' | 'remaining' | 'elapsed';

export interface TcoSubSpanEstimate {
  label: string;
  formattedTotal: string;
  formattedFullTotal: string;
  durationLabel: string;
  startDate: string;
  endDate: string;
  years: number;
}

export interface ApplicationTcoEstimate {
  kind: TcoSpanKind;
  title: string;
  isRange: boolean;
  exactTotal: number | null;
  minTotal: number | null;
  maxTotal: number | null;
  formattedTotal: string;
  formattedFullTotal: string;
  formattedAnnualRate: string;
  years: number;
  durationLabel: string;
  basisLabel: string;
  startDate: string;
  endDate: string;
  remaining: TcoSubSpanEstimate | null;
  contractCommitment: TcoSubSpanEstimate | null;
}

export interface ApplicationTcoInput {
  annualCost?: number | null;
  cost?: string | null;
  lifecycleStartDate?: string | Date | null;
  lifecycleEndDate?: string | Date | null;
  contractStartDate?: string | Date | null;
  contractEndDate?: string | Date | null;
  disabledNativeFields?: Iterable<string> | null;
  currency?: string;
  costScale?: readonly number[] | null;
  referenceDate?: Date;
}

const PERIOD_DECIMAL_CURRENCIES = new Set([
  'USD',
  'GBP',
  'CAD',
  'AUD',
  'NZD',
  'JPY',
  'CNY',
  'HKD',
  'SGD',
  'INR',
]);

const NORDIC_THOUSAND_T_CURRENCIES = new Set(['SEK', 'NOK', 'DKK', 'ISK']);

export function normalizeCostCurrency(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_COST_CURRENCY;
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (cleaned.length >= 2 && cleaned.length <= 6) return cleaned;
  return DEFAULT_COST_CURRENCY;
}

export function validateCostScale(raw: unknown): [number, number, number, number] | null {
  let arr: unknown = raw;
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(arr) || arr.length !== 4) return null;
  const nums = arr.map(v => (typeof v === 'number' ? v : Number(v)));
  const [n0, n1, n2, n3] = nums;
  if (n0 === undefined || n1 === undefined || n2 === undefined || n3 === undefined) return null;
  if ([n0, n1, n2, n3].some(n => !Number.isFinite(n) || n <= 0 || n > 1e13)) return null;
  if (n1 <= n0 || n2 <= n1 || n3 <= n2) return null;
  return [n0, n1, n2, n3];
}

export function parseCostScale(raw: unknown): [number, number, number, number] {
  return validateCostScale(raw) ?? [...DEFAULT_COST_SCALE];
}

export function usesPeriodDecimal(currency?: string): boolean {
  return PERIOD_DECIMAL_CURRENCIES.has(normalizeCostCurrency(currency));
}

export function getCostUnits(currency?: string): [CostUnit, CostUnit, CostUnit, CostUnit] {
  const cur = normalizeCostCurrency(currency);
  const tPrefix = NORDIC_THOUSAND_T_CURRENCIES.has(cur) ? 'T' : 'k';
  return [
    { key: 'base', multiplier: 1, label: cur, shortPrefix: '' },
    { key: 'thousand', multiplier: 1_000, label: `${tPrefix}${cur}`, shortPrefix: tPrefix },
    { key: 'million', multiplier: 1_000_000, label: `M${cur}`, shortPrefix: 'M' },
    { key: 'billion', multiplier: 1_000_000_000, label: `B${cur}`, shortPrefix: 'B' },
  ];
}

export function formatDecimalValue(
  value: number,
  maxDecimals: number,
  currency?: string,
  groupThousands = false
): string {
  const periodDec = usesPeriodDecimal(currency);
  const decSep = periodDec ? '.' : ',';
  const groupSep = periodDec ? ',' : '\u00A0';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const factor = Math.pow(10, Math.max(0, maxDecimals));
  const rounded = Math.round((abs + Number.EPSILON) * factor) / factor;
  const fixed = rounded.toFixed(Math.max(0, maxDecimals));
  const [rawInt = '0', rawFrac = ''] = fixed.split('.');
  const trimmedFrac = rawFrac.replace(/0+$/, '');
  const intPart = groupThousands
    ? rawInt.replace(/\B(?=(\d{3})+(?!\d))/g, groupSep)
    : rawInt;
  return trimmedFrac ? `${sign}${intPart}${decSep}${trimmedFrac}` : `${sign}${intPart}`;
}

export function pickCostUnit(amount: number, currency?: string): CostUnit {
  const units = getCostUnits(currency);
  const abs = Math.abs(amount);
  if (abs >= 1_000_000_000) return units[3];
  if (abs >= 1_000_000) return units[2];
  if (abs >= 1_000) return units[1];
  return units[0];
}

export function formatShortCost(
  amount: number,
  currency?: string,
  options?: { maxDecimals?: number }
): string {
  const cur = normalizeCostCurrency(currency);
  if (!Number.isFinite(amount)) return `0 ${cur}`;
  if (amount === 0) return `0 ${cur}`;
  const units = getCostUnits(cur);
  let unitIdx = units.findIndex(u => u.key === pickCostUnit(amount, cur).key);
  if (unitIdx < 0) unitIdx = 0;

  const computeDecimals = (unit: CostUnit) => {
    if (options?.maxDecimals !== undefined) return options.maxDecimals;
    if (unit.key === 'base') return 0;
    const scaledAbs = Math.abs(amount) / unit.multiplier;
    return scaledAbs >= 100 ? 1 : 2;
  };

  let activeUnit: CostUnit = units[unitIdx] ?? units[0];
  let decimals = computeDecimals(activeUnit);
  let scaled = amount / activeUnit.multiplier;
  const factor = Math.pow(10, decimals);
  if (unitIdx < units.length - 1 && Math.round(Math.abs(scaled) * factor) / factor >= 1000) {
    activeUnit = units[unitIdx + 1] ?? activeUnit;
    decimals = computeDecimals(activeUnit);
    scaled = amount / activeUnit.multiplier;
  }

  const numStr = formatDecimalValue(scaled, decimals, cur, activeUnit.key === 'base');
  return `${numStr} ${activeUnit.label}`;
}

export function formatFullCost(amount: number, currency?: string): string {
  const cur = normalizeCostCurrency(currency);
  if (!Number.isFinite(amount)) return `0 ${cur}`;
  const abs = Math.abs(amount);
  const decimals = abs > 0 && abs < 100 && Math.abs(abs - Math.round(abs)) > 0.005 ? 2 : 0;
  return `${formatDecimalValue(amount, decimals, cur, true)} ${cur}`;
}

function isCleanScaledDecimal(value: number, maxDecimals: number): boolean {
  const factor = Math.pow(10, maxDecimals);
  return Math.abs(value * factor - Math.round(value * factor)) < 1e-6;
}

export function formatShortCostRange(min: number, max: number, currency?: string): string {
  const cur = normalizeCostCurrency(currency);
  const units = getCostUnits(cur);

  let chosenUnit: CostUnit | null = null;
  if (max >= 1_000_000_000 && (min === 0 || min >= 10_000_000)) {
    chosenUnit = units[3];
  } else if (max >= 1_000_000 && (min === 0 || min >= 100_000)) {
    chosenUnit = units[2];
  } else if (
    max >= 100_000 &&
    (min === 0 || min >= 100_000) &&
    isCleanScaledDecimal(min / 1_000_000, 2) &&
    isCleanScaledDecimal(max / 1_000_000, 2)
  ) {
    chosenUnit = units[2];
  } else if (max >= 1_000 && (min === 0 || min >= 1_000)) {
    chosenUnit = units[1];
  } else if (max < 1_000) {
    chosenUnit = units[0];
  }

  if (!chosenUnit) {
    const minFormatted = min === 0 ? '0' : formatShortCost(min, cur);
    const maxFormatted = formatShortCost(max, cur);
    return `${minFormatted}–${maxFormatted}`;
  }

  const maxDecimals = chosenUnit.key === 'base' ? 0 : 2;
  const minStr = min === 0 ? '0' : formatDecimalValue(min / chosenUnit.multiplier, maxDecimals, cur, chosenUnit.key === 'base');
  const maxStr = formatDecimalValue(max / chosenUnit.multiplier, maxDecimals, cur, chosenUnit.key === 'base');
  return `${minStr}–${maxStr} ${chosenUnit.label}`;
}

export function buildCostScaleBands(
  thresholds?: readonly number[] | null,
  currency?: string
): CostScaleBand[] {
  const cur = normalizeCostCurrency(currency);
  const [t1, t2, t3, t4] = parseCostScale(thresholds);
  const specs: Array<{
    value: '1' | '2' | '3' | '4' | '5';
    min: number;
    max: number | null;
    desc: string;
  }> = [
    { value: '1', min: 0, max: t1, desc: `Up to ${formatFullCost(t1, cur)} per year` },
    { value: '2', min: t1, max: t2, desc: `${formatFullCost(t1, cur)} to ${formatFullCost(t2, cur)} per year` },
    { value: '3', min: t2, max: t3, desc: `${formatFullCost(t2, cur)} to ${formatFullCost(t3, cur)} per year` },
    { value: '4', min: t3, max: t4, desc: `${formatFullCost(t3, cur)} to ${formatFullCost(t4, cur)} per year` },
    { value: '5', min: t4, max: null, desc: `Above ${formatFullCost(t4, cur)} per year` },
  ];

  return specs.map((spec, idx) => ({
    value: spec.value,
    order: idx + 1,
    label:
      spec.max !== null
        ? formatShortCostRange(spec.min, spec.max, cur)
        : `> ${formatShortCost(spec.min, cur)}`,
    description: spec.desc,
    color: COST_TIER_COLORS[idx] ?? '#868e96',
    min: spec.min,
    max: spec.max,
  }));
}

export function costTierForAmount(
  amount: number | null | undefined,
  thresholds?: readonly number[] | null
): '1' | '2' | '3' | '4' | '5' | null {
  if (amount === null || amount === undefined || !Number.isFinite(amount) || amount < 0) {
    return null;
  }
  const [t1, t2, t3, t4] = parseCostScale(thresholds);
  if (amount <= t1) return '1';
  if (amount <= t2) return '2';
  if (amount <= t3) return '3';
  if (amount <= t4) return '4';
  return '5';
}

export function decomposeCostForEditor(
  amount: number | null | undefined,
  currency?: string
): { text: string; unitKey: CostUnitKey } {
  const cur = normalizeCostCurrency(currency);
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return { text: '', unitKey: 'thousand' };
  }
  if (amount === 0) {
    return { text: '0', unitKey: 'thousand' };
  }
  const units = getCostUnits(cur);
  for (let idx = units.length - 1; idx >= 1; idx--) {
    const unit = units[idx];
    if (!unit) continue;
    if (Math.abs(amount) >= unit.multiplier && isCleanScaledDecimal(amount / unit.multiplier, 3)) {
      return {
        text: formatDecimalValue(amount / unit.multiplier, 3, cur, false),
        unitKey: unit.key,
      };
    }
  }
  return {
    text: formatDecimalValue(amount, 2, cur, false),
    unitKey: 'base',
  };
}

function detectInlineSuffixMultiplier(suffix: string): number | null {
  const s = suffix.toLowerCase().replace(/\./g, '').trim();
  if (!s) return null;
  if (/^(b|bn|md|mdr|b[a-z]{2,5})$/.test(s)) return 1_000_000_000;
  if (/^(m|mn|mkr|milj|m[a-z]{2,5})$/.test(s)) return 1_000_000;
  if (/^(k|t|tkr|k[a-z]{2,5}|t[a-z]{2,5})$/.test(s)) return 1_000;
  if (/^(kr|[a-z]{3})$/.test(s)) return 1;
  return null;
}

export function parseCostInput(
  raw: string | number | null | undefined,
  unitMultiplier = 1
): { value: number | null; error?: string } {
  if (raw === null || raw === undefined) return { value: null };
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0) {
      return { value: null, error: 'Enter a non-negative cost amount.' };
    }
    return { value: Math.round(raw * 100) / 100 };
  }

  let cleaned = raw.trim().replace(/\/(yr|year|år)$/i, '').trim();
  if (!cleaned) return { value: null };

  // Strip leading currency symbols if pasted (e.g. "$", "€", "£")
  cleaned = cleaned.replace(/^[$€£]\s*/, '').trim();

  const match = cleaned.match(/^([+-]?[\d\s\u00A0'.,]+)\s*([a-zA-Z.]{0,8})$/);
  if (!match) {
    return { value: null, error: 'Invalid cost format.' };
  }

  let numPart = (match[1] ?? '').replace(/[\s\u00A0']/g, '');
  const suffixPart = match[2] || '';

  let effectiveMultiplier = unitMultiplier;
  if (suffixPart) {
    const detected = detectInlineSuffixMultiplier(suffixPart);
    if (detected === null) {
      return { value: null, error: `Unrecognized unit "${suffixPart}".` };
    }
    effectiveMultiplier = detected;
  }

  const dotCount = (numPart.match(/\./g) || []).length;
  const commaCount = (numPart.match(/,/g) || []).length;

  if (dotCount > 0 && commaCount > 0) {
    const lastDot = numPart.lastIndexOf('.');
    const lastComma = numPart.lastIndexOf(',');
    if (lastDot > lastComma) {
      numPart = numPart.replace(/,/g, '');
    } else {
      numPart = numPart.replace(/\./g, '').replace(',', '.');
    }
  } else if (dotCount > 1) {
    numPart = numPart.replace(/\./g, '');
  } else if (commaCount > 1) {
    numPart = numPart.replace(/,/g, '');
  } else if (commaCount === 1) {
    if (effectiveMultiplier === 1 && /^[1-9]\d{0,2},\d{3}$/.test(numPart)) {
      numPart = numPart.replace(',', '');
    } else {
      numPart = numPart.replace(',', '.');
    }
  } else if (dotCount === 1) {
    if (effectiveMultiplier === 1 && /^[1-9]\d{0,2}\.\d{3}$/.test(numPart)) {
      numPart = numPart.replace('.', '');
    }
  }

  if (!/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(numPart)) {
    return { value: null, error: 'Invalid numeric cost value.' };
  }

  const parsed = Number(numPart);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { value: null, error: 'Annual cost cannot be negative.' };
  }

  const total = Math.round(parsed * effectiveMultiplier * 100) / 100;
  if (total > 1e12) {
    return { value: null, error: 'Annual cost exceeds maximum supported value.' };
  }

  return { value: total };
}

export function formatApplicationAnnualCost(
  app: { annualCost?: number | null; cost?: string | null },
  options?: {
    currency?: string;
    costScale?: readonly number[] | null;
    fallbackBandLabel?: string | null;
    withPerYear?: boolean;
  }
): string | null {
  const cur = normalizeCostCurrency(options?.currency);
  const suffix = options?.withPerYear ? '/yr' : '';
  if (typeof app.annualCost === 'number' && Number.isFinite(app.annualCost) && app.annualCost >= 0) {
    return `${formatShortCost(app.annualCost, cur)}${suffix}`;
  }
  if (app.cost) {
    const label =
      options?.fallbackBandLabel ||
      buildCostScaleBands(options?.costScale, cur).find(b => b.value === String(app.cost))?.label;
    if (label) return `${label}${suffix}`;
  }
  return null;
}

const MS_PER_DAY = 86_400_000;

function parseUtcDay(raw: string | Date | null | undefined): number | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    const isoDay = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoDay) {
      const y = Number(isoDay[1]);
      const m = Number(isoDay[2]);
      const d = Number(isoDay[3]);
      const ts = Date.UTC(y, m - 1, d);
      const check = new Date(ts);
      if (
        check.getUTCFullYear() === y &&
        check.getUTCMonth() === m - 1 &&
        check.getUTCDate() === d
      ) {
        return ts;
      }
      return null;
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;
    return Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
  }
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return Date.UTC(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate());
  }
  return null;
}

function formatUtcDayIso(ts: number): string {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysInUtcMonth(year: number, monthZeroIndexed: number): number {
  return new Date(Date.UTC(year, monthZeroIndexed + 1, 0)).getUTCDate();
}

function addClampedUtcMonths(
  baseYear: number,
  baseMonth: number,
  baseDay: number,
  monthsToAdd: number
): number {
  const totalMonths = baseYear * 12 + baseMonth + monthsToAdd;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;
  const clampedDay = Math.min(baseDay, daysInUtcMonth(targetYear, targetMonth));
  return Date.UTC(targetYear, targetMonth, clampedDay);
}

export function computeInclusiveSpanDuration(
  startUtc: number,
  endUtc: number,
  currency?: string
): { years: number; durationLabel: string; totalDays: number } {
  const exclusiveEnd = endUtc + MS_PER_DAY;
  const totalDays = Math.max(1, Math.round((exclusiveEnd - startUtc) / MS_PER_DAY));

  const sDate = new Date(startUtc);
  const eDate = new Date(exclusiveEnd);
  const y1 = sDate.getUTCFullYear();
  const m1 = sDate.getUTCMonth();
  const d1 = sDate.getUTCDate();
  const y2 = eDate.getUTCFullYear();
  const m2 = eDate.getUTCMonth();

  let wholeMonths = (y2 - y1) * 12 + (m2 - m1);
  if (wholeMonths < 0) wholeMonths = 0;
  while (wholeMonths > 0 && addClampedUtcMonths(y1, m1, d1, wholeMonths) > exclusiveEnd) {
    wholeMonths -= 1;
  }

  const anchorStart = addClampedUtcMonths(y1, m1, d1, wholeMonths);
  const anchorNext = addClampedUtcMonths(y1, m1, d1, wholeMonths + 1);
  const remDays = Math.max(0, Math.round((exclusiveEnd - anchorStart) / MS_PER_DAY));
  const monthSpanDays = Math.max(28, Math.round((anchorNext - anchorStart) / MS_PER_DAY));

  const exactMonths = wholeMonths + remDays / monthSpanDays;
  const years = exactMonths / 12;

  let durationLabel: string;
  if (wholeMonths === 0) {
    durationLabel = totalDays === 1 ? '1 day' : `${totalDays} days`;
  } else if (remDays === 0) {
    const wholeYears = Math.floor(wholeMonths / 12);
    const remMonths = wholeMonths % 12;
    if (wholeYears > 0 && remMonths === 0) {
      durationLabel = wholeYears === 1 ? '1 yr' : `${wholeYears} yrs`;
    } else if (wholeYears > 0) {
      const yrPart = wholeYears === 1 ? '1 yr' : `${wholeYears} yrs`;
      const moPart = remMonths === 1 ? '1 mo' : `${remMonths} mos`;
      durationLabel = `${yrPart} ${moPart}`;
    } else {
      durationLabel = remMonths === 1 ? '1 mo' : `${remMonths} mos`;
    }
  } else if (years >= 1) {
    durationLabel = `${formatDecimalValue(years, 1, currency)} yrs`;
  } else {
    durationLabel = `${formatDecimalValue(exactMonths, 1, currency)} mos`;
  }

  return { years, durationLabel, totalDays };
}

function formatTotalForRate(
  years: number,
  annualCost: number | null,
  band: CostScaleBand | null,
  currency: string
): {
  isRange: boolean;
  exactTotal: number | null;
  minTotal: number | null;
  maxTotal: number | null;
  formattedTotal: string;
  formattedFullTotal: string;
} {
  if (annualCost !== null) {
    const exactTotal = annualCost * years;
    return {
      isRange: false,
      exactTotal,
      minTotal: null,
      maxTotal: null,
      formattedTotal: formatShortCost(exactTotal, currency),
      formattedFullTotal: formatFullCost(exactTotal, currency),
    };
  }
  const minTotal = (band?.min ?? 0) * years;
  const maxTotal = band?.max !== null && band?.max !== undefined ? band.max * years : null;
  if (maxTotal !== null) {
    return {
      isRange: true,
      exactTotal: null,
      minTotal,
      maxTotal,
      formattedTotal: formatShortCostRange(minTotal, maxTotal, currency),
      formattedFullTotal: `${formatFullCost(minTotal, currency)} – ${formatFullCost(maxTotal, currency)}`,
    };
  }
  return {
    isRange: true,
    exactTotal: null,
    minTotal,
    maxTotal: null,
    formattedTotal: `> ${formatShortCost(minTotal, currency)}`,
    formattedFullTotal: `> ${formatFullCost(minTotal, currency)}`,
  };
}

export function estimateApplicationTco(input: ApplicationTcoInput): ApplicationTcoEstimate | null {
  const cur = normalizeCostCurrency(input.currency);
  const disabled = new Set<string>(input.disabledNativeFields ?? []);

  const hasExactAnnual =
    typeof input.annualCost === 'number' &&
    Number.isFinite(input.annualCost) &&
    input.annualCost >= 0;

  const bands = buildCostScaleBands(input.costScale, cur);
  const fallbackBand = !hasExactAnnual && input.cost
    ? bands.find(b => b.value === String(input.cost)) ?? null
    : null;

  if (!hasExactAnnual && !fallbackBand) {
    return null;
  }

  const exactAnnual = hasExactAnnual ? (input.annualCost as number) : null;
  const formattedAnnualRate =
    exactAnnual !== null
      ? `${formatShortCost(exactAnnual, cur)}/yr`
      : `${fallbackBand!.label}/yr`;

  const ls = disabled.has('lifecycleStart') ? null : parseUtcDay(input.lifecycleStartDate);
  const le = disabled.has('lifecycleEnd') ? null : parseUtcDay(input.lifecycleEndDate);
  const cs = disabled.has('contractStart') ? null : parseUtcDay(input.contractStartDate);
  const ce = disabled.has('contractEnd') ? null : parseUtcDay(input.contractEndDate);

  const ref = input.referenceDate ?? new Date();
  const today = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate());

  const starts = [ls, cs].filter((v): v is number => v !== null);
  const ends = [le, ce].filter((v): v is number => v !== null);

  let kind: TcoSpanKind;
  let title: string;
  let spanStart: number;
  let spanEnd: number;
  let basisLabel: string;

  if (starts.length > 0 && ends.length > 0) {
    const minStart = Math.min(...starts);
    const maxEnd = Math.max(...ends);

    if (minStart <= maxEnd) {
      spanStart = minStart;
      spanEnd = maxEnd;
      const startFromLifecycle = ls !== null && ls === minStart;
      const startFromContract = cs !== null && cs === minStart;
      const endFromLifecycle = le !== null && le === maxEnd;
      const endFromContract = ce !== null && ce === maxEnd;

      const usedLifecycle =
        (startFromLifecycle && (!startFromContract || (endFromLifecycle && !endFromContract))) ||
        (endFromLifecycle && (!endFromContract || (startFromLifecycle && !startFromContract)));
      const usedContract =
        (startFromContract && (!startFromLifecycle || (endFromContract && !endFromLifecycle))) ||
        (endFromContract && (!endFromLifecycle || (startFromContract && !startFromLifecycle)));

      if (startFromLifecycle && startFromContract && endFromLifecycle && endFromContract) {
        basisLabel = 'Lifecycle & contract';
      } else if (usedLifecycle && usedContract) {
        basisLabel = startFromLifecycle && !startFromContract
          ? 'Lifecycle start – contract end'
          : startFromContract && !startFromLifecycle
          ? 'Contract start – lifecycle end'
          : 'Lifecycle & contract';
      } else if (usedContract && !usedLifecycle) {
        basisLabel = 'Contract';
      } else if (usedLifecycle && !usedContract) {
        basisLabel = 'Lifecycle';
      } else {
        basisLabel = 'Lifecycle & contract';
      }
    } else {
      // Fallback if cross-field dates are inverted: pick whichever individual pair is valid
      const lifecycleValid = ls !== null && le !== null && ls <= le;
      const contractValid = cs !== null && ce !== null && cs <= ce;
      if (lifecycleValid && contractValid) {
        if (le - ls >= ce - cs) {
          spanStart = ls;
          spanEnd = le;
          basisLabel = 'Lifecycle';
        } else {
          spanStart = cs;
          spanEnd = ce;
          basisLabel = 'Contract';
        }
      } else if (lifecycleValid) {
        spanStart = ls;
        spanEnd = le;
        basisLabel = 'Lifecycle';
      } else if (contractValid) {
        spanStart = cs;
        spanEnd = ce;
        basisLabel = 'Contract';
      } else {
        return null;
      }
    }
    kind = 'lifetime';
    title = 'Estimated TCO';
  } else if (ends.length > 0) {
    const maxEnd = Math.max(...ends);
    if (maxEnd < today) return null;
    kind = 'remaining';
    title = 'Estimated Remaining TCO';
    spanStart = today;
    spanEnd = maxEnd;
    const endFromLifecycle = le !== null && le === maxEnd;
    const endFromContract = ce !== null && ce === maxEnd;
    basisLabel =
      endFromLifecycle && endFromContract
        ? 'Today – lifecycle & contract end'
        : endFromContract
        ? 'Today – contract end'
        : 'Today – lifecycle end';
  } else if (starts.length > 0) {
    const minStart = Math.min(...starts);
    if (minStart > today) return null;
    kind = 'elapsed';
    title = 'Estimated Cost to Date';
    spanStart = minStart;
    spanEnd = today;
    const startFromLifecycle = ls !== null && ls === minStart;
    const startFromContract = cs !== null && cs === minStart;
    basisLabel =
      startFromLifecycle && startFromContract
        ? 'Lifecycle & contract start – today'
        : startFromContract
        ? 'Contract start – today'
        : 'Lifecycle start – today';
  } else {
    return null;
  }

  const duration = computeInclusiveSpanDuration(spanStart, spanEnd, cur);
  const totals = formatTotalForRate(duration.years, exactAnnual, fallbackBand, cur);

  let remaining: TcoSubSpanEstimate | null = null;
  if (kind === 'lifetime' && spanStart < today && today <= spanEnd) {
    const remDur = computeInclusiveSpanDuration(today, spanEnd, cur);
    const remTotals = formatTotalForRate(remDur.years, exactAnnual, fallbackBand, cur);
    remaining = {
      label: 'Remaining',
      formattedTotal: remTotals.formattedTotal,
      formattedFullTotal: remTotals.formattedFullTotal,
      durationLabel: remDur.durationLabel,
      startDate: formatUtcDayIso(today),
      endDate: formatUtcDayIso(spanEnd),
      years: remDur.years,
    };
  }

  let contractCommitment: TcoSubSpanEstimate | null = null;
  if (
    kind === 'lifetime' &&
    cs !== null &&
    ce !== null &&
    cs <= ce &&
    (cs > spanStart || ce < spanEnd)
  ) {
    const contractDur = computeInclusiveSpanDuration(cs, ce, cur);
    const contractTotals = formatTotalForRate(contractDur.years, exactAnnual, fallbackBand, cur);
    contractCommitment = {
      label: 'Contract term',
      formattedTotal: contractTotals.formattedTotal,
      formattedFullTotal: contractTotals.formattedFullTotal,
      durationLabel: contractDur.durationLabel,
      startDate: formatUtcDayIso(cs),
      endDate: formatUtcDayIso(ce),
      years: contractDur.years,
    };
  }

  return {
    kind,
    title,
    isRange: totals.isRange,
    exactTotal: totals.exactTotal,
    minTotal: totals.minTotal,
    maxTotal: totals.maxTotal,
    formattedTotal: totals.formattedTotal,
    formattedFullTotal: totals.formattedFullTotal,
    formattedAnnualRate,
    years: duration.years,
    durationLabel: duration.durationLabel,
    basisLabel,
    startDate: formatUtcDayIso(spanStart),
    endDate: formatUtcDayIso(spanEnd),
    remaining,
    contractCommitment,
  };
}
