# Decimal Child Waves (Mid-Phase Replans)

A plan may declare a **decimal child wave** — `wave: 2.1` — to insert a replan
into the middle of a running phase without reordering the phase's tail.

## Motivation

Mid-phase, a wave's execution can uncover a blocker the phase's plans did not
anticipate: every task is done, yet the outcome is not achieved. Before child
waves, there was no formal place for the follow-up work:

- a **quick task** bypassed planning, checking, and verification entirely;
- a **new tail-of-queue wave** (`wave: 5` when the phase has four waves)
  executed the fix long after the wave that needed it, and could not express
  "this belongs between 2 and 3";
- a **decimal phase number** (`999.1`) broke the phase scale itself.

A child wave says exactly what is meant: *this plan was born from wave 2, runs
after wave 2 completes, and before wave 3 starts.*

## Semantics

### The wave key

A `wave:` frontmatter value is parsed as a key — integer part plus fraction:

| Declaration | Key | Ordering value |
|---|---|---|
| `wave: 1` | `(1, '')` | 1 |
| `wave: 2` | `(2, '')` | 2 |
| `wave: 2.1` | `(2, '1')` | 2.1 |
| `wave: 2.05` | `(2, '05')` | 2.05 |
| `wave: 3` | `(3, '')` | 3 |

Ordering is numeric on the pair: `2 < 2.05 < 2.1 < 2.2 < 3`. Trailing zeros
are value-equal (`2.10` == `2.1`). Unparseable values (`abc`, `2abc`, `1.2.3`)
parse to `null`/default exactly as the previous `parseInt` NaN path did.

### Emission

`phase-plan-index` reports a child plan with `wave: 2.1` as a **JSON number**
and groups it under its own wave key:

```json
{
  "plans": [ { "id": "03", "wave": 2.1, ... } ],
  "waves": { "2": ["02"], "2.1": ["03"], "3": ["04"] }
}
```

Numbers — never strings — keep every numeric consumer (sorters, filters, the
`--wave` equality check) correct, including the `"10" < "2"` trap.

Declared **integer** waves remain DAG-authoritative exactly as before: the
depends_on DAG still decides an integer plan's wave, and the declared-vs-DAG
mismatch warning still fires for integers. A declared **child** wave is
honored as the ordering itself (it cannot match an integer DAG level by
construction, so the mismatch verdict is skipped for it).

### Closure: wave N closed ⇔ N.x closed

- Wave N is **not closable** while any N.x child plan lacks a SUMMARY.
- A child wave N.x is **never dispatched** while its parent wave N has
  incomplete plans.
- Wave selection picks the **earliest open (wave, subwave) pair**: with 2 and
  2.1 both incomplete, wave 2 dispatches first; once 2 completes, 2.1 is next;
  only when every 2.x has a SUMMARY does wave 3 become selectable.

### Filters

- `--wave 2` selects wave 2 **only** — it does not capture 2.1.
- `--wave 2.1` selects the child wave only.
- The wave safety check ("finish earlier waves first") treats 2.1 as a lower
  wave of 3 and a peer barrier of 2.

## The mid-phase replan process

1. **STOP** at the uncovered blocker (report it; no improvised fixes beyond
   the executor's deviation rules).
2. **Plan**: `/gsd-plan-phase {phase} --gaps` — the planner authors gap plans
   with `wave: N.1` (N = the wave that uncovered the blocker) and
   `gap_closure: true`, the born-from-a-blocker marker.
3. **Check**: the plan-checker round runs on child-wave plans as on any other.
4. **Execute**: `/gsd-execute-phase {phase} --wave N.1`.
5. **Proceed**: wave N+1 only after every N.x plan has a SUMMARY.

## Example

```yaml
---
phase: 07-hardening
plan: 04
type: execute
wave: 2.1
depends_on: [07-03]
gap_closure: true
...
---
```

A phase `07` with waves 1, 2, 2.1 (`gap_closure`), 3 executes 1 → 2 → 2.1 → 3,
and `roadmap annotate-dependencies` renders the child under its own header:

```
**Wave 2**
- [ ] 07-03-PLAN.md — ...
**Wave 2.1** *(blocked on Wave 2 completion)*
- [ ] 07-04-PLAN.md — ...
**Wave 3** *(blocked on Wave 2.1 completion)*
```

## Tool impact (the six former parseInt-wave points)

| Site | Behavior after |
|---|---|
| `plan-document` (declaredWave) | parses `2.1` as 2.1; null on unparseable |
| `phase-plan-index` emission | child wave honored; integers stay DAG-decided |
| `roadmap` annotate-dependencies (parse + two sorts) | child wave grouped under its own header, numeric order 2 < 2.1 < 3 |
| `template fill plan --wave` | decimal passes through into generated frontmatter |
| `verify plan-structure` ("wave > 1 but depends_on empty") | child waves count as > 1 |
| `verify key-links` (both minWave filters) | `wave: 2.1` passes a `minWave` of 2, not of 3 |

## Compatibility

Integer-only phases are byte-identical: every integer behavior (DAG wave
placement, group keys, header text, filter equality, warnings) is unchanged.
A child wave only changes behavior for plans that declare one.
