export const themes = {
  dark: {
    background: '#0d1b2a',
    card: '#1a2d3f',
    text: '#ffffff',
    subtext: '#9ab',
    accent: '#4ade80',
    border: '#2a3f52',
  },
  light: {
    background: '#f0f4f8',
    card: '#ffffff',
    text: '#1a1a1a',
    subtext: '#666',
    accent: '#16a34a',
    border: '#dde3ea',
  },
};

export type ThemeType = 'dark' | 'light';
export type ThemeColors = typeof themes['dark'];
