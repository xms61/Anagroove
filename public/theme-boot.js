// Applies the saved theme before the app loads, so the first paint already uses its colours.
// A separate file because the production CSP blocks inline scripts. Theme ids: src/themes.ts.
try {
  const theme = JSON.parse(localStorage.getItem('spotyspice_settings') || '{}').theme;
  if (theme === 'city' || theme === 'berlin' || theme === 'vinyl') document.documentElement.dataset.theme = theme;
} catch {
  // Storage blocked or corrupt: the default theme applies
}
