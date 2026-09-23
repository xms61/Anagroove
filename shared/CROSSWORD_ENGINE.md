# Crossword Engine

## Modules
- `musicIdentity.js`: `canonicalMusicKey` (Unicode-aware identity key), `toCrosswordAnswer` (A–Z/0–9 only, `&`/`+` become `AND`, rejects non-Latin), and blacklist matching.
- `musicKeywords.js`: `extractAnswerKeyword`, `extractAllAnswerCandidates`, `splitArtistNames`, and `isSingleEntityArtist`.
- `clueGenerator.js`: `formatCrosswordClue`, `sanitizeClue`, and `containsAnswerLeak`.
- `liveCrossword.js`: `generateLiveCrossword(songs, title, targetWords)`, the grid placement engine.

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
