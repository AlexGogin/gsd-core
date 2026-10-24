/**
 * Decimal child waves (`wave: 2.1`) — feature tests.
 *
 * A mid-phase replan lands as a DECIMAL CHILD WAVE: `wave: 2.1` is a distinct
 * wave ordered strictly between 2 and 3, closable only with its parent (wave 2
 * is not closable while any 2.x plan lacks a SUMMARY). Before this feature,
 * every wave parser used parseInt, which COLLAPSED 2.1 onto 2 — grouping the
 * child with its parent and silently reordering execution.
 *
 * These tests run against the COMPILED mirrors (gsd-core/bin/lib/*.cjs, built
 * by `npm run build:lib` from src/*.cts), like the rest of the suite.
 *
 * Coverage contract:
 * - phase-plan-index groups/sorts 2.1 as its own wave (2 < 2.1 < 3)
 * - plans[].wave emits 2.1 as a NUMBER (guard's numeric sort invariant)
 * - integer-wave output stays byte-identical (regression rows)
 * - roadmap annotate-dependencies renders a separate `**Wave 2.1**` header
 * - verify plan-structure warns on `wave: 2.1` with empty depends_on exactly
 *   as it does for integer `wave: 2` (child waves are > 1 too)
 * - template fill --wave 2.1 passes the decimal through into frontmatter
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');

// ─── fixtures ────────────────────────────────────────────────────────────────

function writePlan(dir, planFile, wave, dependsOn, objective) {
  const rel = path.join(dir, '.planning', 'phases', '01-wfixture', planFile);
  fs.mkdirSync(path.dirname(rel), { recursive: true });
  fs.writeFileSync(rel, [
    '---',
    'phase: 01-wfixture',
    `plan: ${planFile.replace(/^(01-)?(0?\d+).*$/, '$2')}`,
    'type: execute',
    `wave: ${wave}`,
    `depends_on: [${dependsOn.join(', ')}]`,
    'files_modified: []',
    'autonomous: true',
    'must_haves:',
    '  truths:',
    '    - "fixture truth"',
    '---',
    '',
    `<objective>${objective}</objective>`,
    '',
    '<tasks>',
    '<task type="auto">',
    '  <name>Task 1: Fixture</name>',
    '  <action>No-op fixture action</action>',
    '  <verify><automated>true</automated></verify>',
    '  <done>Fixture done</done>',
    '</task>',
    '</tasks>',
    '',
  ].join('\n'));
  return rel;
}

// The canonical decimal-wave project: 1 → 2 → 2.1 → 3.
// Fixture dependency ids reference ACTUAL plan file ids (file name minus
// -PLAN.md) so the DAG resolves edges — otherwise everything collapses to wave 1.
function makeDecimalWaveProject() {
  const dir = createTempProject('gsd-decwave-');
  writePlan(dir, '01-01-PLAN.md', 1, [], 'fixture 1');
  writePlan(dir, '01-02-PLAN.md', 2, ['01-01'], 'fixture 2');
  writePlan(dir, '01-03-PLAN.md', '2.1', ['01-02'], 'fixture 2.1');
  writePlan(dir, '01-04-PLAN.md', 3, ['01-03'], 'fixture 3');
  return dir;
}

// Integer-only twin of the same shape (1 → 2 → 3 → 4 via DAG) — regression
// rows: output must be identical to the pre-decimal format.
function makeIntegerWaveProject() {
  const dir = createTempProject('gsd-intwave-');
  writePlan(dir, '01-01-PLAN.md', 1, [], 'fixture 1');
  writePlan(dir, '01-02-PLAN.md', 2, ['01-01'], 'fixture 2');
  writePlan(dir, '01-03-PLAN.md', 3, ['01-02'], 'fixture 3');
  writePlan(dir, '01-04-PLAN.md', 4, ['01-03'], 'fixture 4');
  return dir;
}

// ─── phase-plan-index: grouping, ordering, numeric emission ─────────────────

describe('phase-plan-index: decimal child waves', () => {
  test('wave 2.1 is a group DISTINCT from 2, ordered 2 < 2.1 < 3 (no parseInt collapse)', () => {
    const dir = makeDecimalWaveProject();
    try {
      const result = runGsdTools(['phase-plan-index', '01', '--raw'], dir);
      assert.ok(result.success, `phase-plan-index should succeed: ${result.error}`);

      const data = JSON.parse(result.output);
      assert.ok(data.waves, 'output should have waves');
      assert.ok(Array.isArray(data.waves['2']), 'wave 2 group exists');
      assert.ok(Array.isArray(data.waves['2.1']), 'wave 2.1 group exists — must NOT collapse into 2');
      assert.deepStrictEqual(data.waves['2'], ['01-02'], 'wave 2 holds only the parent plan');
      assert.deepStrictEqual(data.waves['2.1'], ['01-03'], 'wave 2.1 holds only the child plan');
      assert.notDeepStrictEqual(data.waves['2'], data.waves['2.1'], '2 and 2.1 are distinct groups');

      // Numeric ordering across mixed integer/decimal keys. The successor plan
      // (01-04, declared 3, depending on the 2.1 child) lands on DAG level 4 —
      // integers stay DAG-authoritative, byte-identical to pre-decimal
      // behavior; the child wave itself is what must sit strictly between the
      // parent group and the successor group.
      const waveNumbers = Object.keys(data.waves).map(Number).sort((a, b) => a - b);
      assert.deepStrictEqual(waveNumbers, [1, 2, 2.1, 4], `wave order must keep 2 < 2.1 < successor: ${waveNumbers}`);
    } finally {
      cleanup(dir);
    }
  });

  test('plans[].wave emits 2.1 as a NUMBER (numeric-sort invariant downstream)', () => {
    const dir = makeDecimalWaveProject();
    try {
      const result = runGsdTools(['phase-plan-index', '01', '--raw'], dir);
      assert.ok(result.success, `phase-plan-index should succeed: ${result.error}`);

      const data = JSON.parse(result.output);
      const child = data.plans.find(p => p.id === '01-03');
      assert.ok(child, 'child plan 01-03 present');
      assert.strictEqual(typeof child.wave, 'number', 'wave must be a JSON number, never a string');
      assert.strictEqual(child.wave, 2.1, 'child plan carries wave === 2.1');
    } finally {
      cleanup(dir);
    }
  });

  test('declared child wave does not raise the wave-mismatch warning', () => {
    const dir = makeDecimalWaveProject();
    try {
      const result = runGsdTools(['phase-plan-index', '01', '--raw'], dir);
      assert.ok(result.success, `phase-plan-index should succeed: ${result.error}`);
      const data = JSON.parse(result.output);
      const childMismatch = (data.warnings || []).filter(
        w => w.includes('01-03') && w.includes('declared wave'),
      );
      assert.deepStrictEqual(childMismatch, [], 'declared child wave is the ordering itself — no mismatch verdict');
    } finally {
      cleanup(dir);
    }
  });

  test('REGRESSION integer waves: output shape identical to pre-decimal format', () => {
    const dir = makeIntegerWaveProject();
    try {
      const result = runGsdTools(['phase-plan-index', '01', '--raw'], dir);
      assert.ok(result.success, `phase-plan-index should succeed: ${result.error}`);

      const data = JSON.parse(result.output);
      // Group keys are plain integers, values grouped by DAG wave.
      assert.deepStrictEqual(Object.keys(data.waves), ['1', '2', '3', '4'], 'integer project keeps integer groups');
      assert.deepStrictEqual(data.waves['2'], ['01-02']);
      assert.deepStrictEqual(data.waves['3'], ['01-03']);
      const p3 = data.plans.find(p => p.id === '01-03');
      assert.strictEqual(p3.wave, 3, 'integer declared wave 3 stays DAG-authoritative');
      assert.strictEqual(typeof p3.wave, 'number');
    } finally {
      cleanup(dir);
    }
  });
});

// ─── roadmap annotate-dependencies: child-wave header ───────────────────────

describe('roadmap annotate-dependencies: decimal child waves', () => {
  const ROADMAP = [
    '# Roadmap', '',
    '### Phase 1: Fixture phase', '',
    'Plans:', '',
    '- [ ] 01-01-PLAN.md — fixture 1',
    '- [ ] 01-02-PLAN.md — fixture 2',
    '- [ ] 01-03-PLAN.md — fixture 2.1',
    '- [ ] 01-04-PLAN.md — fixture 3',
    '',
  ].join('\n');

  test('renders a separate **Wave 2.1** header between Wave 2 and Wave 3', () => {
    const dir = makeDecimalWaveProject();
    try {
      fs.writeFileSync(path.join(dir, '.planning', 'ROADMAP.md'), ROADMAP);
      const result = runGsdTools(['roadmap', 'annotate-dependencies', '1'], dir);
      assert.ok(result.success, `annotate-dependencies should succeed: ${result.error}`);

      const roadmap = fs.readFileSync(path.join(dir, '.planning', 'ROADMAP.md'), 'utf8');
      const header2 = roadmap.indexOf('**Wave 2**');
      const header21 = roadmap.indexOf('**Wave 2.1**');
      const header3 = roadmap.indexOf('**Wave 3**');
      assert.ok(header21 >= 0, `expected a **Wave 2.1** header, got: ${roadmap}`);
      assert.ok(header2 >= 0 && header2 < header21, 'Wave 2 header precedes Wave 2.1');
      assert.ok(header3 >= 0 && header21 < header3, 'Wave 2.1 header precedes Wave 3');
    } finally {
      cleanup(dir);
    }
  });
});

// ─── verify plan-structure: child waves are "> 1" for the depends_on warning ─

describe('verify plan-structure: decimal child waves', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTempProject(); });
  afterEach(() => { cleanup(tmpDir); });

  function writeStructurePlan(wave, dependsOn) {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-test'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.planning', 'phases', '01-test', '01-01-PLAN.md'), [
      '---', 'phase: 01-test', 'plan: 01', 'type: execute',
      `wave: ${wave}`, `depends_on: ${dependsOn}`,
      'files_modified: [some/file.ts]', 'autonomous: true',
      'must_haves:', '  truths:', '    - "something is true"', '---', '',
      '<tasks>', '<task type="auto">',
      '  <name>Task 1: Do something</name>',
      '  <files>some/file.ts</files>',
      '  <action>Do the thing</action>',
      '  <verify><automated>echo ok</automated></verify>',
      '  <done>Thing is done</done>',
      '</task>', '</tasks>', '',
    ].join('\n'));
    return path.join('.planning', 'phases', '01-test', '01-01-PLAN.md');
  }

  test('wave: 2.1 with empty depends_on warns exactly as wave: 2 does', () => {
    const rel = writeStructurePlan('2.1', '[]');
    const result = runGsdTools(['verify', 'plan-structure', rel], tmpDir);
    assert.ok(result.success, `verify plan-structure should succeed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.ok(
      output.warnings.some(w => w.includes('Wave > 1 but depends_on is empty')),
      `Expected "Wave > 1 but depends_on is empty" for wave 2.1: ${JSON.stringify(output.warnings)}`,
    );
  });

  test('wave: 2.1 with a dependency does NOT warn', () => {
    // A second plan so the dependency resolves within the phase.
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-test'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.planning', 'phases', '01-test', '01-02-PLAN.md'), [
      '---', 'phase: 01-test', 'plan: 02', 'type: execute',
      'wave: 1', 'depends_on: []',
      'files_modified: [some/other.ts]', 'autonomous: true',
      'must_haves:', '  truths:', '    - "something is true"', '---', '',
      '<tasks>', '<task type="auto">',
      '  <name>Task 1: Base</name>',
      '  <files>some/other.ts</files>',
      '  <action>Do the base thing</action>',
      '  <verify><automated>echo ok</automated></verify>',
      '  <done>Base done</done>',
      '</task>', '</tasks>', '',
    ].join('\n'));
    const rel = writeStructurePlan('2.1', '[01-02]');
    const result = runGsdTools(['verify', 'plan-structure', rel], tmpDir);
    assert.ok(result.success, `verify plan-structure should succeed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.ok(
      !output.warnings.some(w => w.includes('Wave > 1 but depends_on is empty')),
      `No empty-depends warning when the child wave carries a dependency: ${JSON.stringify(output.warnings)}`,
    );
  });
});

// ─── template fill: decimal passthrough into generated frontmatter ──────────

describe('template fill: decimal wave passthrough', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTempProject(); });
  afterEach(() => { cleanup(tmpDir); });

  test('template fill plan --wave 2.1 writes wave: 2.1 into frontmatter (not collapsed to 2)', () => {
    // A phase directory must exist for template fill to resolve the phase.
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-alpha'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.planning', 'phases', '01-alpha', '.keep'), '');

    const result = runGsdTools([
      'template', 'fill', 'plan', '--phase', '1', '--plan', '03', '--wave', '2.1', '--type', 'execute',
    ], tmpDir);
    assert.ok(result.success, `template fill should succeed: ${result.error}`);
    const out = JSON.parse(result.output);
    assert.ok(out.created, `template should be created: ${result.output}`);

    const created = fs.readFileSync(path.join(tmpDir, out.path), 'utf8');
    const waveLine = created.split(/\r?\n/).find(l => /^wave:/.test(l));
    assert.ok(waveLine, `generated frontmatter should carry a wave: line: ${created}`);
    // The frontmatter serializer quotes non-integer numeric scalars
    // (`wave: "2.1"`) so YAML round-trips them as strings — either spelling is
    // the VALUE 2.1 to every wave-key parser; what must never appear is the
    // parseInt collapse `wave: 2`.
    assert.ok(
      waveLine.trim() === 'wave: 2.1' || waveLine.trim() === 'wave: "2.1"',
      `decimal child wave passes through, no parseInt collapse: got ${waveLine}`,
    );
  });
});
