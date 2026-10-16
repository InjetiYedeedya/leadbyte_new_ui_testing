/**
 * Tailwind 4 ships its own PostCSS plugin and handles vendor prefixing itself,
 * so `tailwindcss` and `autoprefixer` are no longer listed here.
 */
module.exports = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
