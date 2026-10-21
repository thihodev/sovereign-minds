# Sovereign Minds — notes for Claude

## Versioning (always)
Every change to the code bumps the version in `package.json` in the same commit:
- **patch** (0.7.0 → 0.7.1): fixes, balance tweaks, UI or tooling changes that leave the rules as they were;
- **minor** (0.7.x → 0.8.0): new rules or mechanics (a new section in `docs/RULES.md`), new actions, changed observations;
  bump `RULES_VERSION` in `src/rules.ts` to the same `major.minor`, and start a new `## vX.Y` section in `CHANGELOG.md`.
Documentation-only commits keep the version. The Watcher UI shows `package.json` version + git hash.

## Working rules
- Never call a real AI locally (no `claude` CLI, no API keys): tests use `test/fake-claude.mjs` and bots.
- `npm test` must pass; after rule changes run `node --disable-warning=ExperimentalWarning tools/pace.ts` and keep every line ✓.
- The engine is deterministic: randomness only via `rngFor(world.seed, tick, ...)`; stock and tile changes only through the ledger.
- User-facing text (UI, docs, events, advice) is Vietnamese; the nations' rules prompt is English.
- When a change is finished (tests and pace targets pass, version bumped, committed), push it to `origin main` without asking: the user gave a standing go-ahead.
