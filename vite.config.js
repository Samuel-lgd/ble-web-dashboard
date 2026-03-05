import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/ble-web-dashboard/',
  root: '.',
  build: {
    outDir: 'dist',
  },
  server: {
    host: true, 
    port: 5173  // Optionnel : force le port si besoin
  }
});
