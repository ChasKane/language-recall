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

### 2026-06-18 — Taste Log introduced
- **Area:** docs
- **Change:** Added `docs/taste-log.md`; AGENTS.md **Taste Log** section (link at top, entry format, add on features/removals/refactors, update in same change as behavior).
- **Reason:** Cross-repo agent policy — preserve design intent and user-driven choices so future agents don’t revert them without understanding why.
