/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        red: {
          DEFAULT: '#F54963',
          light: '#FDE8EC',
        },
        navy: {
          DEFAULT: '#0A263B',
          light: '#E8EDF1',
        },
        teal: {
          DEFAULT: '#36A7B7',
          light: '#E3F5F7',
        },
        mid: '#7A8C99',
        dashboard: {
          bg: '#F0F2F4',
          border: 'rgba(10,38,59,.09)',
        }
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
