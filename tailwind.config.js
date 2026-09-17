/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        darkBg: "#0b0e14",
        darkSurface: "#131722",
        darkPanel: "#1a202e",
        warmAmber: "#f59e0b",
        creamCell: "#f8fafc",
        spotifyGreen: "#1db954",
        kissa: {
          base: "#0c0d12",
          surface: "#12141c",
          card: "#171a25",
          panel: "#1e2230",
          brass: "#d97706",
          amber: "#f59e0b",
          gold: "#fbbf24",
          parchment: "#fbf9f4",
          ink: "#18181b",
          crimson: "#b91c1c",
          sage: "#15803d",
        },
      },
      animation: {
        'spin-slow': 'spin 22s linear infinite',
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'filament': 'pulse 2.5s ease-in-out infinite',
      }
    },
  },
  plugins: [],
}
