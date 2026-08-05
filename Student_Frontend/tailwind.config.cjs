/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'warm-paper': '#FAFAF8',
        'pure-surface': '#FFFFFF',
        'deep-ink': '#1C1917',
        'warm-stone': '#78716C',
        'whisper-line': 'rgba(231, 229, 228, 0.9)',
        'deep-teal': '#0D9488',
        'teal-tint': '#F0FDFA',
        'alert-amber': '#D97706',
        'success-green': '#059669',
        'error-red': '#DC2626',
      },
      fontFamily: {
        sans: ['Satoshi', 'MiSans', '-apple-system', 'PingFang SC', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      maxWidth: {
        'max-width': '1320px',
        content: '800px',
      },
      borderRadius: {
        card: '0.75rem',
        comp: '0.5rem',
      },
      boxShadow: {
        none: 'none',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.4s infinite linear',
      },
    },
  },
  plugins: [],
}
