export default {
  theme: {
    extend: {
      colors: {
        navy: '#1f2532',
        coral: '#e4785e',
        cream: '#f5f3e9',
        'spotle-coral': '#e4785e',
        'spotle-navy': '#1f2532',
        'spotle-cream': '#f5f3e9',
      },
      fontFamily: {
        sans: ['BoldsPixels', 'cursive'],
        pixel: ['BoldsPixels', 'cursive'],
      },
      fontSize: {
        xs: ['1rem', { lineHeight: '1.5rem' }],
        sm: ['1.125rem', { lineHeight: '1.75rem' }],
        base: ['1.25rem', { lineHeight: '1.875rem' }],
      },
      keyframes: {
        flash: {
          from: { backgroundColor: '#ffffff', opacity: '1' },
          to: { backgroundColor: 'transparent', opacity: '0' },
        },
      },
      animation: {
        flash: 'flash 500ms ease-out both',
      },
    },
  },
};
