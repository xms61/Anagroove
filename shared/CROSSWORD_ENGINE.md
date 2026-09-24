# Crossword Engine

## Modules
- `musicIdentity.ts`: `canonicalMusicKey` (Unicode-aware identity key), `toCrosswordAnswer` (A–Z/0–9 only, `&`/`+` become `AND`, rejects non-Latin), and blacklist matching.
- `musicKeywords.ts`: `extractAnswerKeyword`, `extractAllAnswerCandidates`, `splitArtistNames`, and `isSingleEntityArtist`.
- `clueGenerator.ts`: `formatCrosswordClue`, `sanitizeClue`, and `containsAnswerLeak`.
- `liveCrossword.ts`: `generateLiveCrossword(songs, title, targetWords)`, the grid placement engine.
- `types.ts`: `Song`, `Clue`, `Puzzle` and the other puzzle types, shared with the client.

## Answer rules
- Strip feat. credits and remaster/version tags before building answers.
- Multi-word titles are concatenated with no spaces, up to 14 letters (`DIE WITH A SMILE` → `DIEWITHASMILE`).
- Collaborations (`ROSÉ & Bruno Mars`, `A feat. B`) are never joined. Each artist becomes its own candidate (`ROSE`, `BRUNOMARS`).
- A single entity with an ampersand expands it: `Above & Beyond` → `ABOVEANDBEYOND`.
- Answers of `TV`, `OP`, `ED`, `OST`, or `BGM` are rejected unless the answer is an artist name.

## Clue rules
- A clue must **never** contain its answer (`containsAnswerLeak`). If any answer token of ≥3 letters appears in it, `sanitizeClue` falls back to a template.
- Artist-name clues mention the song, never the artist. Song-title clues mention the artist and year, never the title.
- Anime clues rotate between anime title, song title, artist, and keyword, and never name the entity that is the answer.
- The default clue mix rotates title/artist/keyword. A single-artist prompt uses no artist clues.

## Grid rules
- Every placed word crosses 1–3 existing words; placements with 2–3 crossings score higher.
- The bounding box is computed dynamically.
- 150 randomized trials (300 for `dense`), keeping the best score. A trial stops as soon as a whole pass over the remaining songs places nothing, since the grid can no longer change. Crossed words are found through per-direction owner grids and the bounding box is kept up to date, so checking a placement costs O(answer length).
- `options.rng` drives every random choice. `POST /api/puzzles/live` passes `createRng(`${seed}:grid`)` for a seeded request, so the same seed gives the same songs and the same layout.
