/** Decoration behind the page. Each theme's layer sits in an `only-<theme>` wrapper (themes.css). */
export function ThemeBackdrop() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true">
      <div className="only-city">
        <div className="backdrop-city">
          <div className="neon bg-hi/10 w-[520px] h-[520px] -left-36 top-[45%]" />
          <div className="neon bg-accent/15 w-[560px] h-[560px] -right-24 -top-36" />
          <div className="neon bg-hi/10 w-[380px] h-[380px] left-1/2 top-[70%]" />
          <div className="rain" />
          <div className="sign hidden xl:block">音楽クロスワード</div>
        </div>
      </div>
      <div className="only-berlin">
        <div className="backdrop-berlin" />
      </div>
      <div className="only-vinyl">
        <div className="backdrop-vinyl" />
      </div>
    </div>
  );
}
