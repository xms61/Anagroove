---
name: crossword-engine
description: Design, generate, test, and debug music crossword puzzles, prompt steering, keyword extraction, and LLM judgment.
---

# Crossword Engine Skill

Use this skill when developing or debugging crossword puzzle generation, prompt parsing, keyword extraction, clue distribution, or the Gemini LLM judge.

## Key Files & Modules

- `server/services/crosswordGenerator.js`: Backtracking crossword grid layout placement engine.
- `server/services/keywordExtractor.js`: Extracts canonical answers, cleans titles, handles artist collaborations, and balances length variety.
- `server/services/promptParser.js`: Parses user prompt directives (genres, decades, artists, popularity).
- `server/services/geminiJudge.js`: Zero-overhead LLM judge evaluating user prompt relevance.
- `server/services/musicService.js`: Aggregates candidates from SQLite catalog, Deezer, and iTunes.
- `scripts/test_prompts_crossword_suite.js`: Comprehensive 50-puzzle prompt verification test.

## Key Rules & Heuristics

1. **Answer Extraction Rules**:
   - Strip feature credits `(feat. ...)`, `[feat. ...]`, `ft. ...` before generating answers.
   - Strip remaster annotations `(Remastered ...)`, `[2024 Remaster]`.
   - Titles up to 14 characters can be concatenated without spaces (e.g. `DIE WITH A SMILE` -> `DIEWITHASMILE`).
   - For collaborating artists (`Artist A & Artist B` or `Artist A feat. Artist B`), never concatenate into a single word. Extract individual candidates (`ARTISTA`, `ARTISTB`).
   - For single-entity bands with ampersands (`Above & Beyond`, `Mumford & Sons`), expand `&` to `AND` (`ABOVEANDBEYOND`).

2. **Homonym & Foreign Artist Protection**:
   - Guard against name prefix collisions (e.g. `DJ AniMe` for anime prompts, `The Game` for gaming prompts, `The Japanese House` for Japanese City Pop).
   - Enforce storefront routing (e.g. `JP` for Japanese City Pop, `KR` for Korean Trot) to prevent western lookalike leakage.

3. **Artist Directives & Clue Distribution**:
   - If user asks for "songs by [Artist]", the engine must allow multiple songs from that artist.
   - For single-artist crosswords, enforce **0% "Artist name" clues** and **100% "Song title" or "Keyword" clues** (since all answers would otherwise be identical to the artist name).

4. **Testing Procedures**:
   ```bash
   # Run full unit and integration test suite (291 tests)
   npm test

   # Run prompt steering and theme generator test suite
   npm run test:prompts
   ```
