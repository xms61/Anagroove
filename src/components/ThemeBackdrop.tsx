/**
 * Decoration behind the page. Every theme's layer is rendered; `themes.css` shows only the
 * active one, so switching themes needs no re-render.
 */
export function ThemeBackdrop() {
  return (
    <div className="theme-backdrop fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true">
      <div className="backdrop-city absolute inset-0">
        <div className="neon bg-hi/10 w-[520px] h-[520px] -left-36 top-[45%]" />
        <div className="neon bg-accent/15 w-[560px] h-[560px] -right-24 -top-36" />
        <div className="neon bg-hi/10 w-[380px] h-[380px] left-1/2 top-[70%]" />
        <div className="rain" />
        <div className="sign hidden xl:block">音楽クロスワード</div>
      </div>
      <div className="backdrop-berlin" />
      <div className="backdrop-vinyl" />
    </div>
  );
}
