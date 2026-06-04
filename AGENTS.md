# Agent instructions — Language Recall

Obsidian plugin for language-learning spaced repetition (forked from Better Recall). Execute work yourself; do not stop at suggestions unless blocked.

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
3. Bump version:
   ```sh
   pnpm version patch --no-git-tag-version   # or minor/major as appropriate
   git add manifest.json versions.json package.json
   git commit -m "X.Y.Z"
   ```
4. Push: `git push origin main`
5. For a GitHub release (CI builds and publishes artifacts), tag after the tree is clean:
   ```sh
   ./release.sh X.Y.Z "Short release note"
   ```
   Tags trigger `.github/workflows/release.yml`.

## Pull requests

Use `gh` for GitHub tasks. When creating a PR, run status/diff/log and `git diff main...HEAD` in parallel first.

## Development

```sh
pnpm install
pnpm dev      # watch build; needs env.mjs with obsidianExportPath
pnpm build
pnpm lint
```