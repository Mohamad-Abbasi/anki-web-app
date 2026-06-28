import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base نسبی ('./') تا روی GitHub Pages زیر مسیر مخزن هم درست کار کند.
// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
});
