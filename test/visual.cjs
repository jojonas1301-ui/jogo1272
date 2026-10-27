'use strict';
const fs=require('fs');
const path=require('path');
const assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
const {createGameServer}=require('../server');
const {launchBrowser}=require('./launch.cjs');

const OUT=path.join(__dirname,'shots');
const SLOW=(ms)=>new Promise(r=>setTimeout(r,ms));

const ITEM_SELECTORS=[
 ['vela','.prop-candle'],['garrafa','.prop-bottle'],['copo','.prop-glass'],['cartas','.prop-cards'],
 ['caneca','.prop-mug'],['pergaminho','.prop-scroll'],['livro','.prop-book'],['relogio','.prop-clock'],
 ['cadeira','.prop-chair'],['lanterna','.lantern'],['radio','.prop.radio'],['mesa','.table'],['feltro','.felt']
];
const LEGIBLE_SELECTORS=['#heading','#timer','.task-button','.person-name','.hint','#connection','.person-row','#slowBanner span','#attack','#start'];

async function runFlow(browser,base,label){
 const viewport=label==='mobile'?{width:390,height:844}:{width:1280,height:800};
 const errors=[],warnings=[];
 const contexts=[],pages=[];
 const profiles=[['Ana','chapeu'],['Beto','bone'],['Cris','gravata']];
 for(let i=0;i<3;i++){
  // um contexto por jogador: armazenamento (token) independente, como aparelhos reais
  const ctx=await browser.newContext({viewport});
  contexts.push(ctx);
  const p=await ctx.newPage();
  p.on('pageerror',e=>errors.push(String(e.message)));
  p.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});
  await p.goto(base);
  // captura limpa: barra fixa/aderente não pode flutuar no meio de screenshots fullPage
  await p.addStyleTag({content:'.topbar{position:static!important;backdrop-filter:none!important;background:#101818!important}'});
  await p.locator('#name').fill(profiles[i][0]);
  await p.locator('#accessory').selectOption(profiles[i][1]);
  await p.locator('#enter').click();
  await p.locator('#roomView').waitFor({state:'visible'});
  pages.push(p);
 }
 try{
  const host=pages[0];
  await host.waitForFunction(()=>state.players.length===3&&!document.getElementById('start').disabled,{timeout:15000});

  // 1) LOBBY
  await host.screenshot({path:path.join(OUT,label+'-lobby.png'),fullPage:true});

  // 2) INTRO — a lanterna varre a mesa por ~4 s
  await host.locator('#start').click();
  await host.locator('#introMask').waitFor({state:'visible',timeout:8000});
  await host.evaluate(()=>scrollTo(0,0));
  await SLOW(700);
  await host.screenshot({path:path.join(OUT,label+'-intro.png')});

  // revelação de papel (~5 s) some antes da captura da mesa
  await host.locator('#reveal').waitFor({state:'visible',timeout:12000});
  await host.locator('#reveal').waitFor({state:'hidden',timeout:12000});
  for(const p of pages)await p.waitForFunction(()=>state.phase==='JOGANDO',{timeout:10000});

  // 3) MESA com todos os itens
  await SLOW(500);
  await host.screenshot({path:path.join(OUT,label+'-mesa.png'),fullPage:true});

  // ---- verificações T17 ----
  const report=[];
  // a) sem overflow horizontal em nenhuma das 3 sessões
  for(const [i,pg] of pages.entries()){
   const over=await pg.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
   assert.equal(over,false,'Overflow horizontal na página '+i+' ('+label+')');
  }
  report.push('sem overflow horizontal');

  // b) todos os itens do cenário presentes, visíveis e dentro da cena
  const items=await host.evaluate(sels=>sels.map(([name,sel])=>{
   const els=[...document.querySelectorAll(sel)];
   return {name,count:els.length,boxes:els.map(e=>{const r=e.getBoundingClientRect();return {w:r.width,h:r.height,x:r.x,y:r.y};})};
  }),ITEM_SELECTORS);
  for(const it of items){
   assert.ok(it.count>0,'Item ausente na cena: '+it.name);
   for(const b of it.boxes){assert.ok(b.w>0&&b.h>0,'Item sem tamanho visível: '+it.name);}
  }
  const sceneBox=await host.evaluate(()=>{const r=document.getElementById('scene').getBoundingClientRect();return {x:r.x,y:r.y,r:r.right,b:r.bottom};});
  for(const it of items){
   for(const b of it.boxes){
    assert.ok(b.x>=sceneBox.x-1&&b.y>=sceneBox.y-1&&b.x+b.w<=sceneBox.r+1&&b.y+b.h<=sceneBox.b+1,'Item fora da cena: '+it.name);
   }
  }
  const distinct=items.filter(i=>i.name!=='mesa'&&i.name!=='feltro').length;
  assert.ok(distinct>=8,'Eram esperados pelo menos 8 itens do cenário, encontrados: '+distinct);
  report.push(distinct+' itens do cenário visíveis (mínimo 8)');

  // c) lugares dos personagens sem sobreposição
  const seats=await host.evaluate(()=>[...document.querySelectorAll('#seats .seat')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,r:r.right,b:r.bottom,label:e.getAttribute('aria-label')||''};}));
  const overlapArea=(a,b)=>Math.max(0,Math.min(a.r,b.r)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.b,b.b)-Math.max(a.y,b.y));
  for(let i=0;i<seats.length;i++)for(let j=i+1;j<seats.length;j++){
   assert.ok(overlapArea(seats[i],seats[j])===0,'Lugares sobrepostos: '+seats[i].label+' x '+seats[j].label+' ('+label+')');
  }
  report.push(seats.length+' lugares sem sobreposição');

  // d) itens da mesa não cobrem os personagens
  const tableProps=await host.evaluate(sels=>sels.flatMap(([name,sel])=>[...document.querySelectorAll(sel)].map(e=>{const r=e.getBoundingClientRect();return {name,x:r.x,y:r.y,r:r.right,b:r.bottom};})),
   ITEM_SELECTORS.filter(([n])=>!['cadeira','mesa','feltro'].includes(n)));
  for(const p of tableProps)for(const s of seats){
   assert.ok(overlapArea(p,s)===0,'Item '+p.name+' sobrepõe o lugar '+s.label);
  }
  report.push('itens da mesa não cobrem personagens');

  // e) legibilidade: texto de leitura principal com no mínimo 14 px
  const sizes=await host.evaluate(sels=>sels.flatMap(sel=>[...document.querySelectorAll(sel)].map(e=>({sel,fs:parseFloat(getComputedStyle(e).fontSize),text:(e.textContent||'').trim().slice(0,40)}))),LEGIBLE_SELECTORS);
  assert.ok(sizes.length>0,'Nenhum texto para conferir');
  for(const s of sizes){
   assert.ok(s.fs>=14,'Texto abaixo de 14px: '+s.sel+' tem '+s.fs+'px ("'+s.text+'")');
  }
  report.push('texto principal ≥ 14px ('+sizes.length+' elementos)');

  // f) relógio de parede acompanha o tempo da partida
  const clock=await host.evaluate(()=>({h:document.getElementById('clockHour').style.transform,m:document.getElementById('clockMin').style.transform,t:document.getElementById('timer').textContent}));
  assert.ok(clock.h&&clock.m&&/^\d\d:\d\d$/.test(clock.t),'Relógio de parede/timer sem acompanhar a partida');
  report.push('relógio de paredes com ponteiros ligados ao tempo ('+clock.t+')');

  // 4) TAREFA em tela cheia
  const worker=pages[2];
  const taskId=await worker.evaluate(()=>{const t=state.you.tasks.find(t=>!t.done);return t&&t.id;});
  assert.ok(taskId,'Nenhuma tarefa disponível para captura');
  await worker.locator('[data-task="'+taskId+'"]').click();
  await worker.locator('#taskDialog').waitFor({state:'visible'});
  await SLOW(400);
  await worker.screenshot({path:path.join(OUT,label+'-tarefa.png')});
  const dialogOK=await worker.evaluate(()=>document.getElementById('taskDialog').open);
  assert.ok(dialogOK,'Tarefa em tela cheia não abriu');
  report.push('tarefa em tela cheia capturada');

  // g) console limpo
  assert.equal(errors.length,0,'Erros de console:\n'+errors.join('\n'));
  assert.equal(warnings.length,0,'Warnings de console:\n'+warnings.join('\n'));
  report.push('console sem erros nem warnings');

  return report;
 }finally{
  for(const ctx of contexts)await ctx.close().catch(()=>{});
 }
}

(async()=>{
 fs.mkdirSync(OUT,{recursive:true});
 let browser;
 const lines=[];
 try{
  browser=await launchBrowser(chromium);
  for(const label of ['desktop','mobile']){
   const g=createGameServer();
   await new Promise(r=>g.httpServer.listen(0,'127.0.0.1',r));
   const b='http://127.0.0.1:'+g.httpServer.address().port;
   try{
    const report=await runFlow(browser,b,label);
    lines.push('['+label+'] '+report.join('; '));
   }finally{
    await g.close();
   }
  }
  console.log(lines.join('\n'));
  console.log('T17 PASS: capturas de lobby, intro, mesa e tarefa em celular (390x844) e desktop (1280x800) salvas em test/shots/.');
 }finally{
  if(browser)await browser.close().catch(()=>{});
 }
})().catch(e=>{console.error(e);process.exit(1);});
