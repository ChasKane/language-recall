# Taste Log

Running record of intentional product and UX choices — what we changed, why, and what we removed. Agents update this in the same commit/change as the behavior (see **AGENTS.md**).

## Format

```markdown
### YYYY-MM-DD — Short title
- **Area:** plugin | tooling | docs
- **Change:** what shipped or changed
- **Reason:** user request, constraint, trade-off, or rejection of an alternative
```

For removals, use **Removed:** instead of **Change:** and note what replaced it (or why nothing replaced it). On refactors, edit the original entry or add a follow-up that points to it.

---

## Entries

### 2026-06-23 — Pass Obsidian community ESLint review
- **Area:** plugin
- **Change:** Removed forbidden ESLint disable directives; dropped Node `fs` sync workspace.json editing in favor of vault `DataAdapter`; replaced deprecated `activeLeaf`/`revealLeaf` with `getMostRecentLeaf`/`setActiveLeaf`; aligned settings UI strings with `obsidianmd/ui/sentence-case`.
- **Reason:** Obsidian Community automated review (v1.0.8) failed on disallowed eslint-disable comments for sentence-case, no-deprecated, and import/no-nodejs-modules. Direct filesystem access was already a behavior warning; vault adapter is the supported path.

### 2026-06-18 — Taste Log introduced
- **Area:** docs
- **Change:** Added `docs/taste-log.md`; AGENTS.md **Taste Log** section (link at top, entry format, add on features/removals/refactors, update in same change as behavior).
- **Reason:** Cross-repo agent policy — preserve design intent and user-driven choices so future agents don’t revert them without understanding why.
