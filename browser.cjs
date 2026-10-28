const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createGameServer}=require(fs.existsSync(path.join(__dirname,'server.js'))?'./server':'../server');
(async()=>{
 const game=createGameServer();await new Promise(r=>game.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+game.server.address().port;
 let browser;const errors=[];
 try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});const pages=[];
 for(let i=0;i<3;i++){
  const ctx=await browser.newContext({viewport:i===2?{width:390,height:844}:{width:1440,height:1000}});const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base);await p.locator('#name').fill('Navegador '+i);await p.locator('#joinButton').click();await p.locator('#roomView').waitFor({state:'visible'});pages.push(p);
 }
 const host=pages[0];await host.locator('#start').waitFor();await host.waitForFunction(()=>!document.getElementById('start').disabled);
 await host.locator('#cooldown').fill('3');await host.locator('#saveSettings').click();await host.locator('#start').click();
 for(const p of pages){await p.locator('#rulesDialog').waitFor({state:'visible'});await p.locator('#rulesDialog .primary').click();assert.equal(await p.locator('.task').count(),5);}
 const roles=await Promise.all(pages.map(p=>p.locator('#role').textContent()));const inn=pages[roles.findIndex(r=>r.startsWith('Inocente'))],sher=pages[roles.findIndex(r=>r.startsWith('Xerife'))],imp=pages[roles.findIndex(r=>r.startsWith('Assassino'))];
 for(let i=0;i<5;i++){
  await inn.locator('.task').nth(i).click();await inn.locator('#taskDialog').waitFor({state:'visible'});const sequence=(await inn.locator('#sequence').textContent()).split(' → ');for(const label of sequence)await inn.locator('#taskButtons').getByRole('button',{name:label,exact:true}).click();await inn.locator('#taskDialog').waitFor({state:'hidden'});await inn.waitForFunction(n=>document.querySelector('#taskCount').textContent===n+' / 5',i+1);
 }
 await host.screenshot({path:require('path').join(__dirname,'desktop.png'),fullPage:true});await pages[2].screenshot({path:require('path').join(__dirname,'mobile.png'),fullPage:true});
 for(const p of pages){const overflow=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false,'Sem rolagem horizontal');}
 const impName=await imp.locator('.seat.me .name').textContent();await sher.locator('#attack').click();await sher.locator('#targets').getByRole('button',{name:impName.replace(' ♛',''),exact:true}).click();
 for(const p of pages)await p.locator('#endPanel').waitFor({state:'visible'});
 assert.equal(errors.length,0,errors.join('\n'));console.log('PASS: três navegadores, mobile 390px, configurações, início, papéis, cinco tarefas, tiro, fim e zero erros JavaScript.');
 // The downloaded HTML also connects through file://, with no external assets.
 const localHtml=fs.existsSync(path.join(__dirname,'index.html'))?path.join(__dirname,'index.html'):path.resolve(__dirname,'../public/index.html');
 const ctx=await browser.newContext();const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto('file://'+localHtml);await p.locator('#name').fill('Arquivo local');await p.locator('#code').fill('LOCAL');await p.locator('#serverUrl').fill(base);await p.locator('#joinButton').click();await p.locator('#roomView').waitFor({state:'visible'});assert.equal(errors.length,0);console.log('PASS: HTML baixado aberto via file:// conecta ao servidor.');
 } finally {if(browser)await browser.close();await game.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
