import type { Config } from 'tailwindcss';

/**
 * CodeSync design tokens. Neutral, low-chroma surfaces with a single
 * restrained accent (sync green). Platform tints are only used for tiny marks.
 */
export default {
  content: ['./popup.html', './dashboard.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#09090B',
        surface: { DEFAULT: '#0F0F12', raised: '#141417', hover: '#18181C', active: '#1D1D22' },
        line: { DEFAULT: '#1F1F24', strong: '#2A2A31', subtle: '#18181C' },
        fg: { DEFAULT: '#ECECEE', muted: '#A0A0AB', subtle: '#6E6E79', faint: '#4A4A53' },
        accent: { DEFAULT: '#3DD68C', muted: '#2BA86C', soft: 'rgba(61,214,140,0.10)' },
        warn: { DEFAULT: '#F2B54B', soft: 'rgba(242,181,75,0.10)' },
        danger: { DEFAULT: '#F26B6B', soft: 'rgba(242,107,107,0.10)' },
        leetcode: '#FFA116',
        gfg: '#4CB86A',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['10.5px', { lineHeight: '14px', letterSpacing: '0.01em' }],
        xs: ['11.5px', { lineHeight: '16px' }],
        sm: ['12.5px', { lineHeight: '18px' }],
        base: ['13.5px', { lineHeight: '20px' }],
        lg: ['15px', { lineHeight: '22px' }],
        xl: ['18px', { lineHeight: '26px', letterSpacing: '-0.01em' }],
        '2xl': ['22px', { lineHeight: '28px', letterSpacing: '-0.015em' }],
        '3xl': ['28px', { lineHeight: '34px', letterSpacing: '-0.02em' }],
      },
      boxShadow: {
        card: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 1px 2px 0 rgba(0,0,0,0.4)',
        raised:
          '0 1px 0 0 rgba(255,255,255,0.05) inset, 0 8px 24px -8px rgba(0,0,0,0.6), 0 2px 6px -2px rgba(0,0,0,0.5)',
        button: '0 1px 0 0 rgba(255,255,255,0.35) inset, 0 1px 2px 0 rgba(0,0,0,0.5)',
        focus: '0 0 0 1px #09090B, 0 0 0 3px rgba(236,236,238,0.28)',
      },
      borderRadius: { md: '7px', lg: '10px', xl: '12px' },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
          to: { opacity: '1', transform: 'none' },
        },
        breathe: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.45' } },
      },
      animation: {
        'fade-up': 'fade-up 220ms cubic-bezier(0.2,0.8,0.2,1) both',
        'toast-in': 'toast-in 200ms cubic-bezier(0.2,0.8,0.2,1) both',
        breathe: 'breathe 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
