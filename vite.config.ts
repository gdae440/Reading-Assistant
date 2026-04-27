import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createEdgeTTSDevMiddleware } from './server/edgeTTSDevMiddleware';

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '127.0.0.1',
      },
      plugins: [
        react(),
        {
          name: 'edge-tts-dev-api',
          configureServer(server) {
            server.middlewares.use(createEdgeTTSDevMiddleware());
          }
        }
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
