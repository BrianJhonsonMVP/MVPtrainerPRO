module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        mvp: {
          black: 'var(--bg-primary)',
          dark: 'var(--surface)',
          orange: 'var(--mvp-orange)',
          gold: 'var(--mvp-gold)',
          action: 'var(--action)',
          'action-hover': 'var(--action-hover)',
          primary: 'var(--primary)',
          magenta: 'var(--accent-magenta)',
          surface: 'var(--surface)',
          elevated: 'var(--surface-elevated)',
        },
        zinc: {
          850: '#1f1f23',
        },
      },
      backgroundImage: {
        'mvp-gradient': 'linear-gradient(135deg, var(--surface) 0%, var(--bg-primary) 100%)',
        'mvp-accent-gradient': 'linear-gradient(135deg, var(--primary-light) 0%, var(--primary-dark) 55%, var(--accent-magenta) 100%)',
      },
      boxShadow: {
        surface: 'var(--shadow-surface)',
        primary: 'var(--shadow-primary)',
      },
      transitionTimingFunction: {
        premium: 'var(--ease-premium)',
      },
    },
  },
  plugins: [],
};
