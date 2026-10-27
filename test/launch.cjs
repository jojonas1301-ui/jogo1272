'use strict';
const fs=require('fs');
const path=require('path');
const zlib=require('zlib');

/**
 * Launches Chromium for the browser tests.
 * Prefers the official Playwright browser when installed; otherwise falls back
 * to the Chromium binary bundled inside the @sparticuz/chromium npm package
 * (works in environments where Playwright's CDN is unreachable).
 */
async function launchBrowser(chromium,options={}){
 const env={...process.env};
 let executablePath;
 let official=false;
 try{
  const p=chromium.executablePath();
  official=!!p&&fs.existsSync(p);
 }catch{official=false;}
 if(!official){
  const mod=await import('@sparticuz/chromium');
  executablePath=await mod.default.executablePath();
  const lib=path.join('/tmp','al2023','lib');
  if(!fs.existsSync(path.join(lib,'libnss3.so'))){
   const tarFs=require('tar-fs');
   const src=path.join(__dirname,'..','node_modules','@sparticuz','chromium','bin','al2023.tar.br');
   await new Promise((resolve,reject)=>{
    fs.createReadStream(src).pipe(zlib.createBrotliDecompress()).pipe(tarFs.extract('/tmp/al2023')).on('finish',resolve).on('error',reject);
   });
  }
  if(fs.existsSync(lib))env.LD_LIBRARY_PATH=lib+(env.LD_LIBRARY_PATH?':'+env.LD_LIBRARY_PATH:'');
  if(fs.existsSync('/tmp/fonts'))env.FONTCONFIG_PATH=env.FONTCONFIG_PATH||'/tmp/fonts';
 }
 return chromium.launch({headless:true,args:['--no-sandbox'],executablePath,env,...options});
}

module.exports={launchBrowser};
