# Release Process

## Guardrails (non-negotiable)
- **Never push to `main`.** Work on `feat/<name>`, `fix/<name>`, or `chore/<name>`.
- **Never commit** `.env`, API keys, `*.sqlite*` (catalog, anime or user DB), `server/data/store.json*`, audio (`*.mp3|m4a|aac|wav|flac|ogg|opus|webm`), sample folders, or dataset dumps under `data/`.
- Run `git status` before `git add`, and stage explicit paths.

## Version bump (every PR)
- `patch` for fixes/cleanup, `minor` for new capability.
- Keep these in sync: `package.json` `version`, `package-lock.json` (`version` + `packages[""].version`), and a new `CHANGELOG.md` entry ([Keep a Changelog](https://keepachangelog.com/en/1.1.0/): Added/Changed/Fixed/Removed).
- Update `README.md` when commands, setup, or features change.

## Pre-commit checklist
1. `npm run lint`: 0 errors, 0 warnings.
2. `npm test`: all pass.
3. `git status`: no forbidden files staged.
4. Version bumped and CHANGELOG/README updated.

## Pull request
```bash
git push -u origin <branch>
gh pr create --base main --head <branch> --title "<type>(<scope>): <summary> (v<version>)" --body "<summary, key changes, test results>"
```
If a PR is already open for the branch, push more commits to it.

CI (`.github/workflows/ci.yml`, Node from `.nvmrc`) runs lint, tests, and build. `manual-release.yml` does the tagged Docker release.
