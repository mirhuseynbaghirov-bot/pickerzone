import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

// Tailwind is configured right here, so no separate tailwind/postcss config files are needed.
export default defineConfig({
  plugins: [react()],
  css: {
    postcss: {
      plugins: [
        tailwindcss({
          content: ['./index.html', './*.{ts,tsx}'],
          theme: {
            extend: {
              colors: {
                navy: { DEFAULT: '#0B1E4A', soft: '#0F2557' },
                accent: { DEFAULT: '#FF6B00', hover: '#F97316' },
                surface: '#FBF8F3',
              },
              fontFamily: {
                display: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
                sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
              },
            },
          },
        }),
        autoprefixer(),
      ],
    },
  },
});
