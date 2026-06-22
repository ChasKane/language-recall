# Agent instructions — Language Recall

Obsidian plugin for language-learning spaced repetition (forked from Better Recall). Execute work yourself; do not stop at suggestions unless blocked. Product/design decisions: **[docs/taste-log.md](docs/taste-log.md)**.

## Taste Log

Maintain **[docs/taste-log.md](docs/taste-log.md)** — a running log of intentional product choices and why they were made.

- **Add an entry** when shipping a feature or behavior change, including small ones driven by a specific user request.
- **Removal:** add a removal note (what was removed, why, and what replaced it or why nothing replaced it).
- **Refactor:** update existing entries when intent changes; don’t leave stale rationale.
- Each entry: date, area (plugin / tooling / docs), what changed, and reasoning (user request, constraint, trade-off).

Agents: update the Taste Log in the same change that implements the behavior — not as a follow-up.

## Default behavior

- **Run commands.** Install, build, lint, git, push, release — execute them in the terminal. Never tell the user to run something you can run.
- **Work on `main`.** Do not create feature branches unless asked.
- **Minimal diffs.** Match existing code style. Only change what the task requires.
- **Both CSS files.** `src/styles.css` is the source; `styles.css` at repo root must stay in sync (release ships the root copy).

## Git commits

When the user asks to commit (or the task clearly includes shipping changes):

1. Run `git status`, `git diff`, and `git log -5 --oneline` in parallel.
2. Stage relevant files only — never commit secrets (API keys, `.env`).
3. Commit with a HEREDOC message focused on **why**.
4. Run `git status` after to confirm success.
5. Do not push unless asked.

Do not commit unless explicitly requested or clearly implied (e.g. “ship it”, “commit and push”).

## Version bump, squash, and push

When asked to release, bump, or “push it” after feature work:

1. Stay on `main` — no branches.
2. If there are multiple local commits that should be one, squash with `git reset --soft` before the version commit (user prefers a clean history on main).
3. Pre-release checks: `pnpm lint && pnpm build` (lint uses `eslint-plugin-obsidianmd` — same rules Obsidian’s automated review checks).
4. Bump version:
   ```sh
   pnpm version patch --no-git-tag-version   # or minor/major as appropriate
   git add manifest.json versions.json package.json
   git commit -m "X.Y.Z"
   ```
5. Push: `git push origin main`
6. Tag after the tree is clean (triggers CI release):
   ```sh
   ./release.sh X.Y.Z "Short release note"
   ```
   Tags trigger `.github/workflows/release.yml`, which lints, builds, attests `main.js`/`styles.css`, and publishes a GitHub Release with `main.js`, `styles.css`, and `manifest.json`.

## Obsidian Community distribution

Obsidian scans **GitHub releases** automatically — no PR to `obsidian-releases` per version.

- **Dashboard:** [Obsidian Community](https://obsidian.md/community) → sign in → connect GitHub → claim Language Recall. Use it to confirm the linked repo is `ChasKane/language-recall` (legacy `community-plugins.json` may still reference `chaskane/better-recall`), view scan results, and run preview scans on a branch/tag/commit before releasing.
- **After tagging:** automated review usually finishes in minutes; the version appears in Community Plugins in the app within ~24 hours if it passes.
- **Failed scan:** plugin can drop out of search within 24 hours — check the developer dashboard for failure details and fix before re-releasing.

Reference: [The future of Obsidian plugins](https://obsidian.md/blog/future-of-plugins/)

## Pull requests

Use `gh` for GitHub tasks. When creating a PR, run status/diff/log and `git diff main...HEAD` in parallel first.

## Development

```sh
pnpm install
pnpm dev      # watch build; needs env.mjs with obsidianExportPath
pnpm build
pnpm lint
```

## Plugin conventions

- Icon-only controls: use `createIconButton()` from `src/ui/components/createIconButton.ts` (div + `getIcon`, class `better-recall-icon-button`). Same pattern as deck list icons — not `ButtonComponent`.
- SVG sizing: use `var(--size-4-4)` on `.svg-icon`, not `--icon-size` or `--icon-m`.
- Saved AI chat state: class `has-conversation` on the icon button (not bare `is-active`).