# Frontend & UI

React 19 + TypeScript + Vite (dev on :3000, proxying `/api`, `/ws`, and `/audio` to :3001). Tailwind CSS, `lucide-react` icons, `canvas-confetti`, self-hosted fonts (`@fontsource`).

## Structure
- `App.tsx`: top-level state, header, grid + clue layout, and all modals.
- `hooks/`:
  - `useCrosswordGame.ts`: grid state, cursor, validation, hints, progress, and solve time for history.
  - `useBlacklist.ts`: local + server blacklist sync.
  - `useSettings.ts`: the single settings source (`readSettings()` for non-React readers).
  - `useDialog.ts`: dialog focus/Esc behavior.
- `services/`:
  - `apiClient.ts`: REST calls plus the anonymous user id.
  - `socketService.ts`: WS client.
  - `dynamicMusicService.ts`: live puzzle requests and recent-song history.
  - `storage.ts`: guarded storage.
  - `audioSource.ts`
- `components/`:
  - `CrosswordGrid`, `ClueList`, `AudioPlayerBar`, `LoungeDrawer`
  - `Modal` (shared shell)
  - the modals: `LiveGenerator`, `Multiplayer`, `Blacklist`, `Hint`, `EndScreen` (current puzzle tracklist), `History` (all solved puzzles), `Settings`, plus the room victory dialog in `App.tsx`.
- `types/crossword.ts`: shared puzzle types. `shared/*.d.ts` types the shared JS modules (e.g. `canonicalArtistKey`, which the client uses for recent-artist keys so they match the server).

## Styling
- **Dark theme, palette tokens only.** Surfaces from darkest to lightest: `kissa-base`, `kissa-surface`, `kissa-card`, `kissa-panel`. Accents: `kissa.amber`/`gold`, `spotifyGreen`, and Tailwind colors. Never use hex literals like `bg-[#131722]`.
- Page background: the body uses `theme('colors.kissa.base')`. `index.html` also inlines the same color in `<head>` so the first paint is dark (no light flash).
- **Fonts:** Plus Jakarta Sans (400/600/700/800) and JetBrains Mono (700), Latin subsets imported in `main.tsx`. There are no third-party font requests, and the CSP allows `font-src 'self'` only. CJK text uses system fonts.
- **Readability:**
  - Body/secondary text on dark surfaces is `text-slate-400` or lighter (WCAG AA); never `slate-500`/`600` on dark.
  - The minimum text size is `text-xs` (12 px); clue text is `text-sm` (14 px).
  - The exception is the grid's cell numbers, which sit on light cells.
- **Mobile:** the header wraps and collapses button labels to icons below `sm`. The race leaderboard wraps. The page must not scroll horizontally at 375 px.

## Rules
- **Every dialog uses `<Modal>`**, which gives it:
  - `role="dialog"` and `aria-modal`
  - `aria-labelledby`/`aria-describedby` via the `titleId`/`descriptionId` render props
  - a focus trap, Esc and backdrop close, and focus returned to the opener
  - a built-in labelled close button (`closeLabel={null}` hides it)

  Pass the accent border color in `className`. Drawers use `useDialog` directly. Put `data-autofocus` on the element that should receive focus first.
- Icon-only buttons need an `aria-label`. Decorative icons get `aria-hidden`. Toggle buttons use `aria-pressed`.
- **Storage:** go through `services/storage.ts` (`readString`/`writeString`/`readJson`/`writeJson`, `STORAGE_KEYS`) and never touch `localStorage` directly. Storage may be blocked or hold corrupt JSON. The user id in `apiClient.ts` has its own guarded reader.
  - Keys: `spotyspice_user_id`, `spotyspice_settings`, `spotyspice_active_genre`, `spotyspice_active_config`, `spotyspice_active_live_puzzle`, `spotyspice_recent_songs`, `spotyspice_player_name`, `spotyspice_local_blacklist`.
- **Settings:** read and write through `useSettings()`/`readSettings()`. Don't parse `spotyspice_settings` in components.
- **Language filter:** the live generator's EN/JA/KO chips send `languages` (a subset of en/ja/ko; empty means the theme decides). The server applies it to the catalog window and the picker.
- **Themes:** the generator and multiplayer theme pickers render `THEMES` from `shared/themes.js`. A saved theme id that no longer exists (the removed "latin") falls back to Mixed (`knownThemeOr` in `App.tsx`).
- **Audio:** play through `playableAudioUrl(song)` (`services/audioSource.ts`). It keeps `/api/preview/...` and `/audio/...` paths and rebuilds a stable path for older saved puzzles that hold expiring Deezer URLs.
- **Multiplayer:** `socketService` remembers the room seat (`resumeToken`) and rejoins on reconnect. A `room_joined` with `resumed: true` must not reset local progress.
- **Grid key handlers** build the next grid from the rendered state (`withCell`) for their checks and saves, and apply it with a functional `setUserLetters`. Never read values out of a state updater: React may run it later, and the handler then sees an empty grid.
- **Tests:** hooks are tested with Vitest + React Testing Library (`src/**/*.test.ts`, fixtures in `src/test/`), and the full flow with a Playwright smoke test. See `scripts/tests/TESTING.md`.
- `npm run build` runs `tsc` in strict mode, then `vite build`.

## Known gaps
- "SpotySpice" and Spotify green (`spotifyGreen`) are a trademark risk if the app goes public.
