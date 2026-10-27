'use strict';
const {describe,it}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {io}=require('socket.io-client');
const {createGameServer}=require('../server');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,timeout=7000){const end=Date.now()+timeout;while(Date.now()<end){if(fn())return;await sleep(30);}throw Error('Condição não ocorreu em '+timeout+' ms');}
async function setup(t,{n=5,sheriffs=1,cooldown=10}={}){
 const g=createGameServer();await new Promise(r=>g.httpServer.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+g.httpServer.address().port,clients=[];
 t.after(async()=>{for(const c of clients)c.socket.disconnect();await g.close();});
 async function connect(profile,token=crypto.randomUUID()){
  const socket=io(url,{autoConnect:false,reconnection:false,transports:['websocket']});const c={socket,token,profile,state:null,notices:[],messages:[]};clients.push(c);socket.on('estadoCompleto',s=>{c.state=s;});socket.on('avisoXerife',m=>c.notices.push({...m,at:Date.now()}));socket.on('aviso',m=>c.messages.push(m.message));await new Promise(r=>{socket.once('connect',r);socket.connect();});const joined=await socket.emitWithAck('entrar',{token,...profile});assert.equal(joined.ok,true,joined.message);await until(()=>c.state);return c;
 }
 for(let i=0;i<n;i++)await connect({name:'Pessoa '+i,color:'#8cdbb2',accessory:'nenhum'});
 async function action(c,kind,data={},id=crypto.randomUUID()){
  const s=c.state;const m={kind,...data,requestId:id,bootId:s.bootId,roundId:s.roundId,version:s.version};let r;do{r=await c.socket.emitWithAck('acao',m);if(r.retry)await sleep(1050);}while(r.retry);await sleep(230);return {result:r,message:m};
 }
 const cfg=await action(clients[0],'configurar',{settings:{impostors:1,sheriffs,cooldown,minutes:10}});assert.equal(cfg.result.ok,true);const start=await action(clients[0],'iniciar');assert.equal(start.result.ok,true);await until(()=>clients.every(c=>c.state.phase==='JOGANDO'),7000);
 return {g,clients,connect,action,role:r=>clients.find(c=>c.state.you.role===r),roles:r=>clients.filter(c=>c.state.you.role===r)};
}
async function complete(x,c,task=c.state.you.tasks.find(t=>!t.done)){
 const r=await x.action(c,'abrirTarefa',{taskId:task.id});assert.equal(r.result.ok,true,r.result.message);const ch=r.result.challenge;await sleep(1050);let answer;switch(ch.puzzle.type){case'fios':answer=ch.puzzle.order;break;case'codigo':answer=ch.puzzle.code;break;case'item':answer=ch.puzzle.destination;break;case'energia':answer=ch.puzzle.positions;break;}
 return x.action(c,'completarTarefa',{taskId:task.id,nonce:ch.nonce,answer});
}
describe('Regras e reconexão — Socket.IO real, pelo menos 3 clientes por cenário',{concurrency:true},()=>{
 it('T1: ataque ao xerife não mata, consome recarga e avisa só ele após 5s',async t=>{
  const x=await setup(t,{n:3}),imp=x.role('IMPOSTOR'),sher=x.role('XERIFE'),p=x.g.room.players.get(imp.state.you.id);p.readyAt=0;const before=Date.now();const r=await x.action(imp,'atacar',{targetId:sher.state.you.id});assert.equal(r.result.ok,true);assert.equal(x.g.room.players.get(sher.state.you.id).status,'vivo');assert.ok(p.readyAt>before+9500);await sleep(4200);assert.equal(sher.notices.length,0);await until(()=>sher.notices.length===1,2500);assert.ok(sher.notices[0].at-before>=5000);assert.equal(sher.notices[0].message,`⚠️ ${p.name} tentou te matar!`);assert.ok(x.clients.filter(c=>c!==sher).every(c=>c.notices.length===0));
 });
 it('T2: xerife desconectado não morre nem sai, e o tempo dá vitória à tripulação',async t=>{
  const x=await setup(t,{n:4,sheriffs:2}),[a,b]=x.roles('XERIFE');b.socket.disconnect();await until(()=>!x.g.room.players.get(b.state.you.id).socketId);x.g.room.players.get(b.state.you.id).offlineAt=Date.now()-91000;await sleep(350);assert.equal(x.g.room.players.get(b.state.you.id).status,'vivo');assert.equal(x.g.room.phase,'JOGANDO');x.g.room.endsAt=Date.now()-1;x.g.check();assert.equal(x.g.room.phase,'FIM');assert.equal(x.g.room.winner,'TRIPULAÇÃO');for(const p of x.g.room.players.values())if(p.role==='XERIFE')assert.equal(p.status,'vivo');
 });
 it('T3: queda real de 10s mantém posição, papel, tarefas e recarga',async t=>{
  const x=await setup(t),c=x.role('INOCENTE');await complete(x,c);const old=structuredClone(c.state),round=old.roundId;const exactReady=x.g.room.players.get(c.state.you.id).readyAt;c.socket.disconnect();await sleep(10100);const back=await x.connect(c.profile,c.token);assert.equal(back.state.roundId,round);assert.equal(back.state.you.id,old.you.id);assert.equal(back.state.you.role,old.you.role);assert.equal(back.state.you.readyAt,exactReady);assert.deepEqual(back.state.you.tasks,old.you.tasks);assert.equal(back.state.players.find(p=>p.id===back.state.you.id).seat,old.players.find(p=>p.id===old.you.id).seat);assert.equal(x.g.room.players.size,5);
 });
 it('T4: queda real maior que 90s vira saiu sem interromper a rodada',async t=>{
  const x=await setup(t),c=x.role('INOCENTE');await complete(x,c);const id=c.state.you.id;c.socket.disconnect();await sleep(90500);await until(()=>x.g.room.players.get(id).status==='saiu',2500);assert.equal(x.g.room.phase,'JOGANDO');assert.equal(x.g.room.players.get(id).done.size,1);assert.equal(x.g.room.players.size,5);
 });
 it('T5: mesmo requestId devolve mesmo resultado e executa apenas uma vez',async t=>{
  const x=await setup(t),c=x.role('INOCENTE');const end=x.g.room.endsAt;const r=await complete(x,c);assert.equal(r.result.ok,true);const duplicate=await c.socket.emitWithAck('acao',r.message);assert.deepEqual(duplicate,r.result);assert.equal(x.g.room.endsAt,end-5000);const imp=x.role('IMPOSTOR'),sher=x.role('XERIFE'),p=x.g.room.players.get(imp.state.you.id);p.readyAt=0;const shot=await x.action(imp,'atacar',{targetId:sher.state.you.id});const ready=p.readyAt;await sleep(1000);const copy=await imp.socket.emitWithAck('acao',shot.message);assert.deepEqual(copy,shot.result);assert.equal(p.readyAt,ready);assert.equal(x.g.room.notices.length,1);
 });
 it('T6: tarefa do impostor não muda relógio nem progresso',async t=>{
  const x=await setup(t),end=x.g.room.endsAt;const before=x.role('IMPOSTOR').state.progress;const r=await complete(x,x.role('IMPOSTOR'));assert.equal(r.result.ok,true);assert.equal(x.g.room.endsAt,end);assert.deepEqual(x.role('IMPOSTOR').state.progress,before);
 });
 it('T7: cinco tarefas únicas do inocente descontam exatamente 25s',async t=>{
  const x=await setup(t),c=x.role('INOCENTE'),end=x.g.room.endsAt;assert.equal(new Set(c.state.you.tasks.map(t=>t.id)).size,5);for(let i=0;i<5;i++){const r=await complete(x,c);assert.equal(r.result.ok,true,r.result.message);}assert.equal(x.g.room.endsAt,end-25000);assert.equal(x.g.room.players.get(c.state.you.id).done.size,5);
 });
 it('T8: recarga e spam são rejeitados pelo servidor',async t=>{
  const x=await setup(t),imp=x.role('IMPOSTOR'),sher=x.role('XERIFE'),p=x.g.room.players.get(imp.state.you.id);p.readyAt=0;await x.action(imp,'atacar',{targetId:sher.state.you.id});const ready=p.readyAt;const s=imp.state;const results=await Promise.all(Array.from({length:15},()=>imp.socket.emitWithAck('acao',{kind:'atacar',targetId:sher.state.you.id,requestId:crypto.randomUUID(),bootId:s.bootId,roundId:s.roundId,version:s.version})));assert.ok(results.every(r=>!r.ok));assert.equal(p.readyAt,ready);assert.equal(x.g.room.notices.length,1);assert.ok(results.some(r=>r.retry));
 });
 it('T10: queda no meio da tarefa permite refazer sem duplicar',async t=>{
  const x=await setup(t),c=x.role('INOCENTE'),task=c.state.you.tasks[0],end=x.g.room.endsAt;const opened=await x.action(c,'abrirTarefa',{taskId:task.id});assert.ok(opened.result.challenge);c.socket.disconnect();await sleep(300);const back=await x.connect(c.profile,c.token);assert.equal(back.state.you.tasks[0].done,false);assert.equal(x.g.room.players.get(back.state.you.id).challenge,null);await complete(x,back,task);assert.equal(x.g.room.endsAt,end-5000);assert.equal(x.g.room.players.get(back.state.you.id).done.size,1);
 });
 it('Extras: dono tem 60s de tolerância, sigilo e ação de fase antiga',async t=>{
  const x=await setup(t),host=x.clients[0],id=host.state.you.id;for(const c of x.clients)for(const p of c.state.players)if(p.id!==c.state.you.id&&!(c.state.you.role==='IMPOSTOR'&&p.role==='IMPOSTOR'))assert.equal(p.role,null);host.socket.disconnect();await sleep(200);assert.equal(x.g.room.hostId,id);x.g.room.players.get(id).offlineAt=Date.now()-61000;await until(()=>x.g.room.hostId!==id);assert.ok(x.clients.slice(1).some(c=>c.messages.includes('Você é o novo dono da sala.')));const c=x.clients[1],s=c.state;const r=await c.socket.emitWithAck('acao',{kind:'atacar',requestId:crypto.randomUUID(),bootId:s.bootId,roundId:'rodada-antiga',version:s.version});assert.equal(r.ok,false);
 });
 it('Extras: aviso guardado durante queda e cancelado se a partida acabar',async t=>{
  const x=await setup(t,{n:3}),imp=x.role('IMPOSTOR'),sher=x.role('XERIFE'),p=x.g.room.players.get(imp.state.you.id);sher.socket.disconnect();await until(()=>!x.g.room.players.get(sher.state.you.id).socketId);p.readyAt=0;await x.action(imp,'atacar',{targetId:sher.state.you.id});await sleep(5100);assert.equal(sher.notices.length,0);const back=await x.connect(sher.profile,sher.token);await until(()=>back.notices.length===1);p.readyAt=0;await x.action(imp,'atacar',{targetId:back.state.you.id});x.g.room.endsAt=Date.now()-1;x.g.check();await sleep(5200);assert.equal(back.notices.length,1);assert.equal(x.g.room.notices.length,0);
 });
 it('Extras: vitória por tarefas e vitória por tempo usam as regras novas',async t=>{
  const x=await setup(t,{n:3});for(const c of x.clients.filter(c=>c.state.you.role!=='IMPOSTOR'))for(let i=0;i<5;i++){const r=await complete(x,c);assert.equal(r.result.ok,true,r.result.message);}assert.equal(x.g.room.winner,'TRIPULAÇÃO');const host=x.clients.find(c=>c.state.you.id===x.g.room.hostId);await x.action(host,'lobby');await x.action(host,'iniciar');await until(()=>host.state.phase==='JOGANDO');x.g.room.endsAt=Date.now()-1;x.g.check();assert.equal(x.g.room.winner,'TRIPULAÇÃO');
 });
 it('Extras: vaga expirada conectada volta ao lobby sem perder a sessão',async t=>{
  const x=await setup(t),c=x.role('INOCENTE'),p=x.g.room.players.get(c.state.you.id);c.socket.disconnect();await until(()=>!p.socketId);p.offlineAt=Date.now()-91000;await until(()=>p.status==='saiu');const back=await x.connect(c.profile,c.token);assert.equal(back.state.you.status,'saiu');x.g.room.endsAt=Date.now()-1;x.g.check();await until(()=>back.state.phase==='FIM');const host=x.clients.find(c=>c.socket.connected&&c.state.you.id===x.g.room.hostId);const r=await x.action(host,'lobby');assert.equal(r.result.ok,true);await until(()=>back.state.phase==='LOBBY');assert.equal(back.state.you.id,p.id);assert.equal(back.state.you.status,'vivo');
 });
 it('V3: xerife atira no inocente: os dois morrem por erro do atirador',async t=>{
  const x=await setup(t),s=x.role('XERIFE'),i=x.role('INOCENTE');x.g.room.players.get(s.state.you.id).readyAt=0;const r=await x.action(s,'atacar',{targetId:i.state.you.id});assert.equal(r.result.ok,true);assert.equal(x.g.room.players.get(s.state.you.id).status,'eliminado');assert.equal(x.g.room.players.get(i.state.you.id).status,'eliminado');
 });
 it('V3: xerife acerta impostor, continua vivo e tripulação vence',async t=>{
  const x=await setup(t,{n:3}),s=x.role('XERIFE'),i=x.role('IMPOSTOR');x.g.room.players.get(s.state.you.id).readyAt=0;const r=await x.action(s,'atacar',{targetId:i.state.you.id});assert.equal(r.result.ok,true);assert.equal(x.g.room.players.get(s.state.you.id).status,'vivo');assert.equal(x.g.room.players.get(i.state.you.id).status,'eliminado');assert.equal(x.g.room.winner,'TRIPULAÇÃO');
 });
 it('V3: apenas xerife + impostor encerra imediatamente com vitória do impostor',async t=>{
  const x=await setup(t,{n:3}),imp=x.role('IMPOSTOR'),inn=x.role('INOCENTE');x.g.room.players.get(imp.state.you.id).readyAt=0;await x.action(imp,'atacar',{targetId:inn.state.you.id});assert.equal(x.g.room.phase,'FIM');assert.equal(x.g.room.winner,'IMPOSTORES');assert.match(x.g.room.reason,/apenas o xerife e o impostor/);assert.equal(x.g.room.players.get(x.role('XERIFE').state.you.id).status,'vivo');
 });
 it('V3 confirmação: xerife atira em xerife: só o atirador morre; replay não repete',async t=>{
  const x=await setup(t,{n:4,sheriffs:2}),[a,b]=x.roles('XERIFE');x.g.room.players.get(a.state.you.id).readyAt=0;const r=await x.action(a,'atacar',{targetId:b.state.you.id});assert.equal(r.result.ok,true);assert.equal(x.g.room.players.get(a.state.you.id).status,'eliminado');assert.equal(x.g.room.players.get(b.state.you.id).status,'vivo');const replay=await a.socket.emitWithAck('acao',r.message);assert.deepEqual(replay,r.result);assert.equal(x.g.room.players.get(b.state.you.id).status,'vivo');
 });
 it('V3 decisão: impostor que expira sai, não fica imortal por estar offline',async t=>{
  const x=await setup(t),c=x.role('IMPOSTOR'),p=x.g.room.players.get(c.state.you.id);c.socket.disconnect();await until(()=>!p.socketId);p.offlineAt=Date.now()-91000;await until(()=>p.status==='saiu');assert.equal(x.g.room.winner,'TRIPULAÇÃO');
 });
});
