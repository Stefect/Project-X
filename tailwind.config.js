/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./public/**/*.{html,js}",
    "./src/**/*.{html,js}",
    "./tests/**/*.{html,js}"
  ],
  theme: {
    extend: {
      colors: {
        // Темна тема (Tokyo Night)
        'dark-bg': '#1a1b26',
        'dark-surface': '#24283b',
        'dark-highlight': '#414868',
        'dark-text': '#c0caf5',
        'dark-comment': '#565f89',
        
        // Акценти
        'accent-blue': '#3b82f6',
        'accent-purple': '#8b5cf6',
        'accent-cyan': '#7dcfff',
        'accent-green': '#34a853',
        'accent-red': '#f7768e',
        'accent-orange': '#ff9e64',
        'accent-yellow': '#e0af68'
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif']
      }
    },
  },
  plugins: [],
  darkMode: 'class'
}
