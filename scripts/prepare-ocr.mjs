import {mkdir,copyFile,readdir} from 'node:fs/promises';
const dest='client/public/ocr';await mkdir(dest,{recursive:true});
await copyFile('node_modules/tesseract.js/dist/worker.min.js',dest+'/worker.min.js');
for(const name of await readdir('node_modules/tesseract.js-core'))if(name.endsWith('.wasm.js'))await copyFile('node_modules/tesseract.js-core/'+name,dest+'/'+name);
console.log('Local OCR worker/core prepared. English trained data downloads on first use.');
