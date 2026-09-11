/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'rc-teal': '#4F3FD6',
        'rc-teal-dark': '#3B2FB0',
        'rc-teal-light': 'rgba(109,91,245,0.5)',
        'rc-plum': {
          200: '#D9D4EE',
          300: '#C3BCE3',
          400: '#8F86B8',
          600: '#4A3F72',
          700: '#3A3059',
          800: '#2C2547',
          900: '#241E3D',
          950: '#151129',
        },
        'rc-indigo': {
          50: '#F3F1FB',
          100: '#E6E3F5',
          200: '#D9D4EE',
          300: '#A79BF2',
          400: '#6D5BF5',
          500: '#4F3FD6',
          600: '#3B2FB0',
          800: '#2C2461',
        },
      },
      backgroundImage: {
        'rc-gradient': 'linear-gradient(135deg, #F3F1FB 0%, #EEF0F4 100%)',
        'rc-dashboard': 'linear-gradient(135deg, rgba(109,91,245,0.5) 0%, rgba(217,236,199,0.9) 100%)',
        'rc-section': 'linear-gradient(90deg, #E6E3F5 0%, #6EE7B7 100%)',
      },
      boxShadow: {
        rc: '0 4px 16px rgba(36,30,61,0.08)',
      },
    },
  },
  plugins: [],
};
