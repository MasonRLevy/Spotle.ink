export default {
  theme: {
    extend: {
      colors: {
        navy: '#1f2532',
        coral: '#e4785e',
        cream: '#f5f3e9',
        'spotle-navy': '#1f2532',
        'spotle-cream': '#f5f3e9',
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', 'cursive'],
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
