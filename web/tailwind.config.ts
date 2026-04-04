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
        // Farmer Buddy dark palette
        fb: {
          bg: '#0d1b2a',
          card: '#1a2d3f',
          border: '#2a3f52',
          text: '#ffffff',
          subtext: '#8fa8bb',
          accent: '#4ade80',
          red: '#EF4444',
          yellow: '#F59E0B',
          blue: '#3B82F6',
        },
      },
    },
  },
  plugins: [],
};

export default config;
