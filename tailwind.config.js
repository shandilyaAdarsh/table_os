export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // TableOS Design System
        primary:   '#002045',
        'primary-container': '#1A365D',
        'secondary-container': '#FE932C',
        surface:   '#F8F9FA',
        'surface-container': '#EDEEEF',
        // Legacy
        brand:   { 900: '#1A365D', 700: '#2C5282', 500: '#3182CE' },
        accent:  { 500: '#D97706', 200: '#FDE68A' },
        success: { 500: '#38A169', 100: '#F0FFF4' },
        warning: { 500: '#DD6B20', 100: '#FFFBEB' },
        danger:  { 500: '#E53E3E', 100: '#FFF5F5' },
        kds:     { bg: '#0C0C0C', surface: '#161616', border: '#2A2A2A' },
      },
      fontFamily: {
        sans:     ['Manrope', 'Inter', 'sans-serif'],
        headline: ['Epilogue', 'sans-serif'],
        mono:     ['IBM Plex Mono', 'monospace'],
      },
      borderRadius: {
        'card': '2rem',
        'sheet': '2.5rem',
      },
    },
  },
  plugins: [],
}
