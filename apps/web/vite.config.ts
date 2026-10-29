import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Endereço da API em desenvolvimento (mesma porta padrão de PORT em apps/api/.env).
const apiTarget = 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // O navegador fala só com o Vite; o Vite encaminha a API e o WebSocket.
    // Em produção não há proxy: a API serve o build na mesma origem.
    proxy: {
      '/api': { target: apiTarget },
      '/socket.io': { target: apiTarget, ws: true },
    },
  },
});
