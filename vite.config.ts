import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig({ plugins:[react()], build:{target:'chrome116',rollupOptions:{input:{preview:resolve('index.html'),sidepanel:resolve('sidepanel.html'),options:resolve('options.html')}}} });
