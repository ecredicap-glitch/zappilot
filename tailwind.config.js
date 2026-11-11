/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: { colors: { pilot: { navy: '#080d1a', lime: '#B6F500', electric: '#4D8DFF' } }, borderRadius: { '4xl': '2rem' } } },
  plugins: [],
};
