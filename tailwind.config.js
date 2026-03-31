export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand:   { 900: '#1A365D', 700: '#2C5282', 500: '#3182CE' },
        accent:  { 500: '#D97706', 200: '#FDE68A' },
        success: { 500: '#38A169', 100: '#F0FFF4' },
        warning: { 500: '#DD6B20', 100: '#FFFBEB' },
        danger:  { 500: '#E53E3E', 100: '#FFF5F5' },
        kds:     { bg: '#0C0C0C', surface: '#161616', border: '#2A2A2A' },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
