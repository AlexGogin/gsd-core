/**
 * Wave key — shared parser for `wave:` frontmatter values, decimal-child-wave aware.
 *
 * A wave number may now be a DECIMAL CHILD WAVE (`wave: 2.1`): a replan
 * inserted mid-phase, ordered strictly between wave 2 and wave 3 and closable
 * only as part of its parent wave (wave 2 is not closable while any 2.x plan
 * lacks a SUMMARY). Historically every consumer parsed `wave` with
 * `parseInt(..., 10)`, which COLLAPSED `2.1` onto `2` — grouping the child
 * with its parent and silently re-ordering execution. This module is the one
 * place that knows how a `wave:` value becomes a comparable key; all former
 * parseInt wave sites (plan-document's declaredWave, roadmap's parse + two
 * sorts, template's producer passthrough, verify's three filter points) route
 * through it.
 *
 * Semantics:
 * - `1`, `2` (number or string) → integer key `{ int: 2, frac: '' }`.
 * - `"2.1"`, `2.1` → child key `{ int: 2, frac: '1' }`.
 * - `"-1"` → `{ int: -1, frac: '' }` — sign preserved, matching parseInt.
 * - Anything else (`"abc"`, `""`, `null`, `"2abc"`, multi-dot) → `null`.
 *   Callers decide the fallback (`null` declared-wave vs `1` default-wave)
 *   exactly as they did with `NaN` before.
 *
 * Comparisons are tuple-based on (int, fraction value): `2 < 2.1 < 2.2 < 3`,
 * and `"2.10"` equals `"2.1"` (same value). The numeric projection
 * (`waveKeyToNumber`) emits the JSON field (`wave: 2.1` as a Number) that
 * downstream consumers — the dispatch guard's phase-state sort, wave filters —
 * already order numerically.
 */

/** Parsed wave key: integer part, plus decimal-child fraction digits. */
export interface WaveKey {
  /** Integer part: `2` for `2.1`. Always an integer (sign included). */
  int: number;
  /** Fraction digit string without the dot: `'1'` for `2.1`, `'05'` for `2.05`. Empty → integer wave. */
  frac: string;
}

// One optional leading sign, digits, optionally ONE dot followed by digits.
// Deliberately stricter than parseInt's prefix parsing ("2abc" → null, not 2):
// a wave field that isn't a clean integer or decimal is authoring noise and
// must fall to the caller's null/default path, never half-parse.
const WAVE_RE = /^(-?)(\d+)(?:\.(\d+))?$/;

/** Fraction digits → fractional value (`'1'` → 0.1, `'05'` → 0.05, `''` → 0). */
function fracValue(frac: string): number {
  return frac === '' ? 0 : parseInt(frac, 10) / Math.pow(10, frac.length);
}

/**
 * Parse a raw frontmatter/CLI wave value into a {@link WaveKey}, or `null`
 * when absent/unparseable (the caller's `NaN` equivalent).
 */
export function parseWaveKey(raw: unknown): WaveKey | null {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    raw = String(raw); // 2.1 → "2.1" (short-decimal JS number formatting is exact here)
  }
  if (typeof raw !== 'string') return null;
  const m = WAVE_RE.exec(raw.trim());
  if (!m) return null;
  const neg = m[1] === '-';
  const int = parseInt(m[2], 10) * (neg ? -1 : 1);
  return { int, frac: m[3] ?? '' };
}

/** True when the key carries a non-empty fraction (`2.1`, not `2`). */
export function isChildWaveKey(key: WaveKey): boolean {
  return key.frac.length > 0;
}

/**
 * Numeric projection of the key (`2.1` for `{ int: 2, frac: '1' }`). This is
 * the value emitted into JSON (`plans[].wave`, `waves` grouping) — a Number,
 * never a string, so numeric sorters keep `2 < 2.1 < 3` and never hit the
 * `"10" < "2"` string-order trap.
 */
export function waveKeyToNumber(key: WaveKey): number {
  const f = fracValue(key.frac);
  return key.int + (key.int < 0 ? -f : f);
}

/**
 * Tuple comparison on (int, fraction value): negative when `a < b`, positive
 * when `a > b`, 0 on equal values (`2.10` equals `2.1`).
 */
export function compareWaveKeys(a: WaveKey, b: WaveKey): number {
  if (a.int !== b.int) return a.int - b.int;
  return fracValue(a.frac) - fracValue(b.frac);
}

/**
 * Parse-and-default helper for the `parseInt(raw, 10) || fallback` call sites:
 * returns the numeric projection, or `fallback` when unparseable — and, like
 * `||`, maps a literal `0` to `fallback` (a `wave: 0` declaration historically
 * read as the default, not as wave zero).
 */
export function waveKeyOrDefault(raw: unknown, fallback: number): number {
  const key = parseWaveKey(raw);
  if (key === null) return fallback;
  const value = waveKeyToNumber(key);
  return value === 0 ? fallback : value;
}

/**
 * Display form: `'2'` for integers, `'2.1'` for children (normalized —
 * `2.10` prints as `2.1`). Used by ROADMAP wave headers.
 */
export function formatWaveKey(key: WaveKey): string {
  return key.frac === '' ? String(key.int) : `${key.int}.${key.frac}`;
}

/**
 * The `wave > 1` predicate of plan-structure's "Wave > 1 but depends_on is
 * empty" warning, decimal-child aware: a child wave (`2.1`) also exceeds 1
 * and must carry dependencies — it is ordered after its parent by definition.
 * Returns false for unparseable values (the old parseInt(NaN) > 1 was false).
 */
export function waveKeyExceedsOne(raw: unknown): boolean {
  const key = parseWaveKey(raw);
  return key !== null && (key.int > 1 || (key.int === 1 && key.frac !== ''));
}
