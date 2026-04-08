export const themes = {
  dark: {
    // Backgrounds
    background: '#161814',      // primary page background
    card: '#20241C',            // surface / card
    elevatedCard: '#2A3024',    // modals / raised cards / pressed state
    // Text
    text: '#DCDAD0',            // primary text
    subtext: '#94988A',         // muted / secondary text
    heading: '#DCDAD0',         // headings (same as primary text)
    faint: '#585E4E',           // section labels / faint UI text
    textOnAccent: '#F0F2EA',    // text on filled accent buttons
    // Accents
    accent: '#4A7838',          // buttons / active states
    accentPressed: '#3A622C',   // hover / pressed state
    emphasis: '#8EA578',        // icons / secondary accent labels
    border: '#3A4232',          // borders / dividers
    // Status
    statusOk: '#60A048',
    statusWarn: '#C49430',
    statusAlert: '#BE5040',
    // Feature tile tokens (all share card surface — distinction comes from layout)
    tileBodycam: '#20241C',
    tileLeaf: '#20241C',
    tileSensor: '#20241C',
    tileChat: '#20241C',
    tileIcon: '#20241C',        // no longer used (icon circle removed)
    tileIconSymbol: '#8EA578',  // icon color
    tileLabel: '#DCDAD0',       // tile label text
  },
  light: {
    // Backgrounds
    background: '#e6eae2',
    card: '#ffffff',
    elevatedCard: '#ffffff',
    // Text
    text: '#1a1a1a',
    subtext: '#4a5e45',
    heading: '#2d3d29',
    faint: '#5a7050',
    textOnAccent: '#ffffff',
    // Accents
    accent: '#16a34a',
    accentPressed: '#15803d',
    emphasis: '#3d4f39',
    border: '#dde3ea',
    // Status
    statusOk: '#3d7a28',
    statusWarn: '#9a7218',
    statusAlert: '#9a3228',
    // Feature tile tokens
    tileBodycam: '#3d4f39',
    tileLeaf: '#3d4f39',
    tileSensor: '#3d4f39',
    tileChat: '#3d4f39',
    tileIcon: '#e6eae2',
    tileIconSymbol: '#3d4f39',
    tileLabel: '#2d3d29',
  },
};

export type ThemeType = 'dark' | 'light';
export type ThemeColors = typeof themes['dark'];
