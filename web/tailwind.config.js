/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f6f7f9',
          100: '#eceef2',
          200: '#d5d9e2',
          300: '#b0b8c9',
          400: '#8591aa',
          500: '#66738f',
          600: '#515c76',
          700: '#424b60',
          800: '#3a4152',
          900: '#181c25',
          950: '#0d1017',
        },
        brand: {
          50: '#eef6ff',
          100: '#d9ebff',
          200: '#bcdcff',
          300: '#8ec7ff',
          400: '#59a7ff',
          500: '#3385fc',
          600: '#1c66f1',
          700: '#1550de',
          800: '#1843b4',
          900: '#1a3c8e',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(13,16,23,.04), 0 8px 24px -12px rgba(13,16,23,.18)',
        lift: '0 2px 4px rgba(13,16,23,.05), 0 18px 40px -16px rgba(13,16,23,.28)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'none' } },
        'slide-in': { '0%': { transform: 'translateX(100%)' }, '100%': { transform: 'none' } },
        pulseOnce: { '0%': { transform: 'scale(1)' }, '40%': { transform: 'scale(1.12)' }, '100%': { transform: 'scale(1)' } },
      },
      animation: {
        'fade-up': 'fade-up .28s ease-out both',
        'slide-in': 'slide-in .24s cubic-bezier(.32,.72,0,1)',
        'pulse-once': 'pulseOnce .45s ease-out',
      },
    },
  },
  plugins: [],
};
