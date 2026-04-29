const nextConfig = require('eslint-config-next');

module.exports = [
  ...nextConfig,
  {
    // Async data-fetching functions called from effects are idiomatic Next.js.
    // The set-state-in-effect rule incorrectly flags async-in-effect patterns.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    // AgronomistChat and LeafDetection display local data-URL images from FileReader,
    // which next/image does not support. Plain <img> is intentional here.
    files: ['components/AgronomistChat.tsx', 'components/LeafDetection.tsx'],
    rules: {
      '@next/next/no-img-element': 'off',
    },
  },
];
