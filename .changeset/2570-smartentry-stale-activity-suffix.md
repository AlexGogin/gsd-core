---
type: Fixed
pr: 2571
---
**The idle/staleness detector now fires when `last_activity` carries a description** — a `last_activity` written in the shape `templates/state.md` prescribes (`[YYYY-MM-DD] — [What happened]`) parsed to `NaN`, and because the detector treats an unparseable value as "not stale" it failed open to `false`. Any project whose `last_activity` kept its description was never reported idle, no matter how long it had sat. The leading date is now parsed out of the value, so the description no longer blinds the only staleness signal in the front door. (#2570)
