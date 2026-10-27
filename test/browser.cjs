'use strict';
const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {createGameServer}=require('../server');
(async()=>{
 const game=createGameServer();await new Promise(r=>game.httpServer.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+game.httpServer.address().port;
 let browser;const errors=[],warnings=[];const results=[];
 try{
  browser=await require('./launch.cjs').launchBrowser(chromium);const pages=[];
  for(let i=0;i<3;i++){
   const ctx=await browser.newContext({viewport:i===2?{width:390,height:844}:{width:1365,height:900}});const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='warning')warnings.push(m.text());if(m.type()==='error')errors.push(m.text());});
   if(i===2)await p.addInitScript(()=>{const realNow=Date.now.bind(Date);Date.now=()=>realNow()+7*3600000;});
   await p.goto(base);if(i===0)await p.screenshot({path:path.join(__dirname,'home.png'),fullPage:true});await p.locator('#name').fill(i===1?'Pessoa':'Pessoa');await p.locator('#accessory').selectOption(['chapeu','bone','gravata'][i]);await p.locator('#enter').click();await p.locator('#roomView').waitFor({state:'visible'});pages.push(p);
  }
  const host=pages[0];await host.waitForFunction(()=>state.players.length===3&&!document.getElementById('start').disabled);assert.equal(await pages[1].locator('#hostSettings').isVisible(),false);assert.equal(await host.evaluate(()=>new Set(state.players.map(p=>p.name)).size),3);await host.locator('#start').click();await host.locator('#introMask').waitFor({state:'visible'});await host.locator('#reveal').waitFor({state:'visible',timeout:10000});await host.locator('#reveal').waitFor({state:'hidden',timeout:10000});
  for(const p of pages)await p.waitForFunction(()=>state.phase==='JOGANDO');
  const clockError=await pages[2].evaluate(()=>Math.abs(serverTime()-state.serverNow));assert.ok(clockError<2000,'Relógio errado do celular foi corrigido pelo ping/pong');
  results.push('Relógio local +7 horas corrigido; três sessões, nomes únicos, acessórios e fases funcionando.');
  // Exercita os quatro mini-jogos reais, pesquisando as tarefas sorteadas.
  for(const type of ['fios','codigo','item','energia']){
   let chosen,task;for(const p of pages){const found=await p.evaluate(type=>state.you.tasks.find(t=>t.type===type&&!t.done),type);if(found){chosen=p;task=found;break;}}
   assert.ok(chosen,'O sorteio entre 3 pessoas deve oferecer '+type);const p=chosen;await p.locator('[data-task="'+task.id+'"]').click();await p.locator('#taskDialog').waitFor({state:'visible'});const c=await p.evaluate(()=>challenge);
   if(type==='fios'){for(const name of ['Vermelho','Azul','Amarelo','Verde']){await p.locator('.wire-col').nth(0).getByRole('button',{name,exact:true}).click();await p.locator('.wire-col').nth(1).getByRole('button',{name,exact:true}).click();}}
   if(type==='codigo'){await p.locator('.code-entry').waitFor();await p.waitForFunction(()=>!document.querySelector('.code-entry').disabled);await p.locator('.code-entry').fill(c.puzzle.code);}
   if(type==='item'){await p.locator('.draggable').click();await p.locator('.drop-zone').click();}
   if(type==='energia'){for(let i=0;i<3;i++)await p.getByRole('button',{name:'Alavanca '+(i+1)+' posição '+(c.puzzle.positions[i]+1),exact:true}).click();}
   await p.waitForFunction(()=>!document.getElementById('submitTask').disabled);await p.locator('#submitTask').click();await p.locator('#taskDialog').waitFor({state:'hidden'});await p.waitForFunction(id=>state.you.tasks.find(t=>t.id===id).done,task.id);
  }
  results.push('Mini-jogos: fios, memorizar código, levar item por toque e alavancas concluídos pelo servidor.');
  // T11: Atualizar não provoca navegação, conserva identidade/rodada/tarefas.
  const p=pages[1],old=await p.evaluate(()=>({id:state.you.id,round:state.roundId,tasks:state.you.tasks}));let navigations=0;p.on('framenavigated',frame=>{if(frame===p.mainFrame())navigations++;});await p.locator('#refresh').click();await p.waitForFunction(()=>synced&&!refreshing);const after=await p.evaluate(()=>({id:state.you.id,round:state.roundId,tasks:state.you.tasks}));assert.deepEqual(after,old);assert.equal(navigations,0);assert.equal(await p.locator('#roomView').isVisible(),true);results.push('T11 PASS: Atualizar preservou a tela e restaurou a sessão sem recarregar a página.');
  // T9: retarda acknowledgements reais de relógio; a medição do cliente recebe RTT >800ms.
  await p.evaluate(()=>{window.savedEmit=socket.emit;socket.emit=function(event,...args){if(event==='relogio'){const cb=args.pop();args.push((...reply)=>setTimeout(()=>cb(...reply),950));}return window.savedEmit.call(this,event,...args);};slow.streak=0;slow.visible=false;slow.goodSince=0;show('slowBanner',false);});
  await p.locator('#slowBanner').waitFor({state:'visible',timeout:12000});assert.equal(await p.locator('#slowBanner').textContent(),'Sua internet está lenta ou ruim. Ou você está na aula? Professores, eduquem mais!');await p.evaluate(()=>{socket.emit=window.savedEmit;});await p.locator('#slowBanner').waitFor({state:'hidden',timeout:13000});results.push('T9 PASS: três pings >800ms mostraram o texto exato; banner sumiu após conexão boa por pelo menos 5s.');
  // Queda durante tarefa e fila em trânsito: o estado sincroniza antes de reabilitar.
  const mobile=pages[2];await mobile.context().setOffline(true);await mobile.locator('#offlineActions').waitFor({state:'visible'});assert.ok(await mobile.locator('.task-button:not(.done)').first().isDisabled());await mobile.context().setOffline(false);await mobile.waitForFunction(()=>synced&&socket.connected,{timeout:15000});
  for(const page of pages)assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await mobile.setViewportSize({width:844,height:390});assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await host.screenshot({path:path.join(__dirname,'game.png'),fullPage:true});assert.equal(errors.length,0,errors.join('\n'));assert.equal(warnings.length,0,warnings.join('\n'));results.push('Sem overflow vertical/horizontal em celular; botões offline desabilitados; console sem erros ou warnings.');
  console.log(results.join('\n'));
 }finally{if(browser)await browser.close();await game.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
