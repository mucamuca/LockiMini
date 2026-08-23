import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_URL || 'http://localhost:4000';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      // Proxy para /api e /realtime: no navegador tudo sai da mesma origem,
      // entao os cookies httpOnly de sessao e de carrinho funcionam sem CORS.
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/realtime': { target: apiTarget, ws: true, changeOrigin: true },
      },
      warmup: {
        // Pre-compila as telas mais visitadas: tira a espera do primeiro acesso
        // em desenvolvimento, quando o Vite transforma modulo a modulo.
        clientFiles: ['./src/main.tsx', './src/pages/Home.tsx', './src/pages/Catalog.tsx'],
      },
    },
    preview: { port: 4173 },
    build: {
      outDir: 'dist',
      // Sourcemap de producao pesava 1,4 MB por build e nao serve ao visitante.
      sourcemap: false,
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          // Bibliotecas mudam raramente: em pedacos proprios, o cache do
          // navegador sobrevive a cada deploy do codigo da loja.
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            query: ['@tanstack/react-query'],
            realtime: ['socket.io-client'],
          },
        },
      },
    },
  };
});
