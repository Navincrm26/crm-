import {defineConfig} from 'vite';
import {resolve} from 'node:path';
export default defineConfig({root:resolve('client'),server:{host:'127.0.0.1',port:3000,strictPort:true,proxy:{'/api':'http://127.0.0.1:3001'}},build:{outDir:'dist',emptyOutDir:true},esbuild:{jsx:'automatic'},define:{__APP_VERSION__:JSON.stringify('1.0.0')}});
