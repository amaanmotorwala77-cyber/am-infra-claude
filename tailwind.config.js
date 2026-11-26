/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 950: '#0B1422', 900: '#0F1B2D', 800: '#16253B', 700: '#1F3150', 600: '#2C4166' },
        gold: { 50: '#FBF6EC', 100: '#F4E8CF', 300: '#DCC08A', 400: '#CBA765', 500: '#B8915A', 600: '#9A7543', 700: '#7A5B33' },
        paper: '#FAF8F4',
        line: '#E7E2D8',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['"DM Serif Display"', 'Georgia', 'serif'],
      },
      boxShadow: { card: '0 1px 2px rgba(15,27,45,0.04), 0 1px 3px rgba(15,27,45,0.06)' },
    },
  },
  plugins: [],
}
