import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Sansation', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Farmer Buddy dark palette — mirrors mobile themes.ts dark tokens
        fb: {
          bg: '#161814',        // background
          card: '#20241C',      // card / surface
          elevated: '#2A3024',  // modals / raised cards
          border: '#3A4232',    // borders / dividers
          text: '#DCDAD0',      // primary text
          subtext: '#94988A',   // muted / secondary text
          faint: '#585E4E',     // section labels / faint UI
          accent: '#4A7838',    // buttons / active states
          accentHover: '#3A622C', // hover / pressed accent
          emphasis: '#8EA578',  // icons / secondary accent labels
          ok: '#60A048',        // success / active status
          warn: '#C49430',      // warning status
          alert: '#BE5040',     // error / alert status
          blue: '#3B82F6',      // informational (kept for links/info badges)
        },
      },
    },
  },
  plugins: [],
};

export default config;
