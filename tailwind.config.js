/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#168B55',
          dark: '#116B43',
          sky: '#A9DDF5',
          mist: '#F1F9FD',
          sun: '#F59B38',
          cream: '#FFF2DF',
        },
        // #71847D (spec) is slightly under 4.5:1 on white for small text, so body-size
        // secondary text uses this marginally darker tone (5.1:1).
        ink: { DEFAULT: '#18352D', soft: '#5E726B' },
      },
      boxShadow: {
        card: '0 1px 2px rgba(24,53,45,.05), 0 8px 24px -8px rgba(24,53,45,.12)',
      },
      borderRadius: { xl2: '1.25rem' },
    },
  },
  plugins: [],
};
