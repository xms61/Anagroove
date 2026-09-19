---
name: release-discipline
description: Enforce repository release discipline, version bumps, changelog updates, git hygiene, and pull request creation.
---

# Release Discipline Skill

Use this skill when preparing, committing, pushing, and raising Pull Requests in the SpotySpice repository.

## Non-Negotiable Directives

1. **Never Push to `main`**:
   - Always verify the current branch with `git status` or `git branch --show-current`.
   - If on `main`, switch to a new branch: `git checkout -b <type>/<feature-name>`.

2. **Security & Secrets Guard**:
   - Never stage `.env` or files containing secret keys (`GEMINI_API_KEY`, `SPOTIFY_CLIENT_SECRET`, etc.).
   - Always check `git status` before `git add` to verify no credentials or SQLite database files are staged.

3. **SQLite Database Exclusions**:
   - Ensure `server/data/catalog.sqlite`, `server/data/catalog.sqlite-wal`, and `server/data/catalog.sqlite-shm` are untracked and gitignored.

4. **Version Synchronization**:
   - Every commit / PR must bump either a **patch** (e.g. `1.9.6` -> `1.9.7`) or **minor** (e.g. `1.9.6` -> `1.10.0`) or **major** (e.g. `1.0.0` -> `2.0.0`) version.
   - Files to update:
     - `package.json` (`"version"`)
     - `package-lock.json` (`"version"` and top-level package version)
     - `CHANGELOG.md` (add version heading, date, and Added/Changed/Fixed sections)
     - `README.md` (update docs/tables if flags or features were added)

5. **Quality Gates**:
   - Linter must pass with 0 errors and 0 warnings:
     ```bash
     npm run lint
     ```
   - All tests must pass:
     ```bash
     npm test
     ```

6. **Pull Request Protocol**:
   - Push to remote feature branch: `git push -u origin <branch-name>`.
   - Create PR using GitHub CLI:
     ```bash
     gh pr create --base main --head <branch-name> --title "<type>(<scope>): <concise description> (v<version>)" --body "<structured summary>"
     ```
   - Keep the summary informative and not too long (highlight key changes, metrics, and test results).
   - If PR is already open on that branch, simple `git push origin <branch-name>` updates the existing PR.
