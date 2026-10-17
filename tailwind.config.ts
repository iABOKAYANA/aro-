import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    // src/lib holds JSX too (compare.tsx has Tailwind classNames and is
    // imported by home-page, providers, project-card/detail, compare-view);
    // without this glob JIT purges its classes from the production CSS.
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        estate: {
          green: '#1a3a2a',
          'green-dark': '#0D2818',
          'green-light': '#2d5a3d',
          'green-hover': '#3a7050',
          gold: '#D4A843',
          'gold-light': '#E8C56D',
          'gold-dark': '#B8923A',
          copper: '#c9956a',
          'copper-dark': '#b8845a',
          navy: '#0F1A2C',
          'navy-light': '#1A2B44',
          black: '#000000',
          'bg-dark': '#080E1A',
          'bg-input': '#0a1220',
          'bg-card': '#0f1a2e',
          'bg-dropdown': '#1a2535',
          sand: '#F5F0E8',
          'sand-dark': '#E8DFD0',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        // Body: Inter keeps Latin identical; Plex Sans Arabic catches Arabic
        // glyphs via unicode-range. Display: Amiri for H1/hero only (opt-in).
        sans: ['var(--font-inter)', 'var(--font-sans-ar)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Amiri', 'Georgia', 'serif'],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        // Egyptian-luxury motion: slow ambient float + CTA gold shimmer.
        // (Marquee already exists as .animate-marquee in globals.css.)
        'float-slow': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'gold-shimmer': {
          '0%, 100%': { opacity: '0.35' },
          '50%': { opacity: '1' },
        },
        // Cinematic Ken Burns: ultra-slow scale drift (transform-only, GPU-cheap).
        // Paired with the .kenburns overflow-hidden wrapper in globals.css.
        // Usage: <div class="kenburns"><img class="animate-kenburns" … /></div>
        kenburns: {
          from: { transform: 'scale(1)' },
          to: { transform: 'scale(1.12)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'float-slow': 'float-slow 7s ease-in-out infinite',
        'gold-shimmer': 'gold-shimmer 2.8s ease-in-out infinite',
        kenburns: 'kenburns 24s ease-in-out infinite alternate',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
export default config
