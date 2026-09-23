# Frontend & UI

React 19 + TypeScript + Vite (dev on :3000, proxying `/api`, `/ws`, and `/audio` to :3001). Tailwind CSS, `lucide-react` icons, `canvas-confetti`.

## Structure
- `App.tsx`: top-level state, header, grid + clue layout, and all modals.
- `hooks/useCrosswordGame.ts`: grid state, cursor, validation, hints, progress. `hooks/useBlacklist.ts`: local + server blacklist sync.
- `services/apiClient.ts`: REST calls plus the anonymous user id. `socketService.ts`: WS client. `dynamicMusicService.ts`: recent-song history.
- `components/`: `CrosswordGrid`, `ClueList`, `AudioPlayerBar`, `ThemeBar`, `LoungeDrawer`, and the modals (`LiveGenerator`, `Multiplayer`, `Blacklist`, `Hint`, `EndScreen`, `Settings`).
- `types/crossword.ts`: shared puzzle types. `shared/*.d.ts` types the shared JS modules.

## Styling
- Dark theme. Palette tokens live in `tailwind.config.js` (`kissa.*`, `darkBg`, `warmAmber`, ...). **Use tokens, not hex literals** like `bg-[#131722]`.
- Fonts: Plus Jakarta Sans and JetBrains Mono.

## Rules
- Modals need `role="dialog"`, `aria-modal`, Esc to close, and a focus trap (not done yet; see plan Phase 6).
- Wrap every `localStorage` access in try/catch. Keys: `spotyspice_user_id`, `spotyspice_settings`, `spotyspice_active_genre`, `spotyspice_active_config`, `spotyspice_active_live_puzzle`, `spotyspice_recent_songs`, `spotyspice_player_name`, `spotyspice_local_blacklist`.
- Play audio through `playableAudioUrl(song)` (`services/audioSource.ts`). It keeps `/api/preview/...` and `/audio/...` paths and rebuilds a stable path for older saved puzzles that hold expiring Deezer URLs.
- Multiplayer: `socketService` remembers the room seat (`resumeToken`) and rejoins on reconnect. `room_joined` with `resumed: true` must not reset local progress.
- `npm run build` runs `tsc` in strict mode, then `vite build`.
