'use strict';
const express = require('express');
const http = require('node:http');
const crypto = require('node:crypto');
const path = require('node:path');
const { Server } = require('socket.io');
const COLORS = ['#8cdbb2', '#a99bff', '#ffb581', '#83bfff', '#ffd576', '#ed9fc5'];
const ACCESSORIES = ['nenhum', 'chapeu', 'bone', 'gravata'];
const CATALOG = [
 {id:'fios-radio',type:'fios',title:'Reparar o rádio'}, {id:'fios-luz',type:'fios',title:'Juntar fios da lanterna'},
 {id:'codigo-cofre',type:'codigo',title:'Abrir o cofre'}, {id:'codigo-radio',type:'codigo',title:'Sintonizar o rádio'},
 {id:'item-lixo',type:'item',title:'Descartar papel',destination:'lixeira'}, {id:'item-caixa',type:'item',title:'Guardar a ferramenta',destination:'caixa'},
 {id:'energia-luz',type:'energia',title:'Ligar a iluminação'}, {id:'energia-gerador',type:'energia',title:'Restaurar o gerador'}
];
function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
function drawTasks(){const selected=['fios','codigo','item','energia'].map(type=>shuffle(CATALOG.filter(t=>t.type===type))[0]);selected.push(shuffle(CATALOG.filter(t=>!selected.some(s=>s.id===t.id)))[0]);return shuffle(selected).map(t=>({...t}));}
const validUUID = x => typeof x==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x);
const integer=(v,a,b)=>Number.isInteger(v)&&v>=a&&v<=b;
function createGameServer({tickMs=100}={}){
 const app=express();app.disable('x-powered-by');
 app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'index.html')));
 app.get('/index.html',(req,res)=>res.sendFile(path.join(__dirname,'index.html')));
 app.get('/health',(req,res)=>res.json({ok:true}));
 app.get('/favicon.ico',(req,res)=>res.status(204).end());
 const httpServer=http.createServer(app), io=new Server(httpServer,{maxHttpBufferSize:16384,pingInterval:5000,pingTimeout:10000});
 const room={bootId:crypto.randomUUID(),roundId:crypto.randomUUID(),version:0,phase:'LOBBY',players:new Map(),hostId:null,serial:0,settings:{impostors:1,sheriffs:1,cooldown:20,minutes:6},endsAt:0,introEndsAt:0,revealUntil:0,winner:null,reason:null,notices:[],events:[]};
 const sessions=new Map();let closed=false,lastBroadcast=0;
 const now=()=>Date.now();
 const active=()=>[...room.players.values()].filter(p=>p.status!=='saiu');
 const connected=p=>p.socketId&&io.sockets.sockets.has(p.socketId);
 const living=p=>p.status==='vivo';
 function log(text){room.events.push({id:crypto.randomUUID(),text});room.events=room.events.slice(-15);}
 function progress(){const crew=[...room.players.values()].filter(p=>p.role&&p.role!=='IMPOSTOR');return {done:crew.reduce((n,p)=>n+p.done.size,0),total:crew.reduce((n,p)=>n+(p.status==='saiu'?p.done.size:5),0)};}
 function validation(){const n=active().length,s=room.settings;if(n<3)return 'São necessários pelo menos 3 jogadores.';if(n>10)return 'Máximo de 10 jogadores.';if(s.impostors+s.sheriffs>n-1)return 'Impostores + xerifes devem deixar pelo menos 1 inocente.';if(active().some(p=>!connected(p)))return 'Aguarde a reconexão ou o fim do prazo dos jogadores desconectados.';return '';}
 function snapshot(p){const time=now();return {bootId:room.bootId,roundId:room.roundId,version:room.version,serverNow:time,phase:room.phase,hostId:room.hostId,settings:room.settings,startError:validation(),introEndsAt:room.introEndsAt,revealUntil:room.revealUntil,endsAt:room.endsAt,remainingMs:Math.max(0,room.endsAt-time),winner:room.winner,reason:room.reason,progress:progress(),events:room.events,players:[...room.players.values()].map(x=>({id:x.id,name:x.name,color:x.color,accessory:x.accessory,seat:x.seat,status:x.status,connected:!!connected(x),role:room.phase==='FIM'||(room.phase!=='LOBBY'&&p.role==='IMPOSTOR'&&x.role==='IMPOSTOR')?x.role:null})),you:{id:p.id,name:p.name,status:p.status,role:room.phase==='LOBBY'?null:p.role,readyAt:p.readyAt,tasks:p.tasks.map(t=>({...t,done:p.done.has(t.id)}))}};}
 const emitState=p=>{if(connected(p))io.to(p.socketId).emit('estadoCompleto',snapshot(p));};
 const broadcast=()=>{for(const p of room.players.values())emitState(p);lastBroadcast=now();};
 const tell=(p,message)=>{if(connected(p))io.to(p.socketId).emit('aviso',{message});};
 function changeHost(){if(room.hostId&&room.players.get(room.hostId)&&connected(room.players.get(room.hostId)))return;const old=room.players.get(room.hostId);if(old&&old.offlineAt&&now()-old.offlineAt<60000)return;const candidates=active().filter(connected);if(!candidates.length&&room.phase==='FIM')candidates.push(...[...room.players.values()].filter(connected));const next=candidates.sort((a,b)=>a.order-b.order)[0];room.hostId=next?.id||null;if(next){log(`${next.name} agora é o dono da sala.`);tell(next,'Você é o novo dono da sala.');}}
 function finish(winner,reason){if(!['INTRO','JOGANDO'].includes(room.phase))return;room.phase='FIM';room.version++;room.winner=winner;room.reason=reason;room.notices=[];room.introEndsAt=0;room.revealUntil=0;for(const p of room.players.values())p.challenge=null;log(reason);broadcast();}
 function check(){if(room.phase!=='JOGANDO')return;const live=active().filter(living),imps=live.filter(p=>p.role==='IMPOSTOR').length,crew=live.length-imps,pg=progress();if(imps===0)return finish('TRIPULAÇÃO','Todos os impostores foram eliminados ou saíram.');if(pg.total>0&&pg.done===pg.total)return finish('TRIPULAÇÃO','Todas as tarefas válidas foram concluídas.');if(live.length===2&&imps===1&&live.some(p=>p.role==='XERIFE'))return finish('IMPOSTORES','Restaram apenas o xerife e o impostor. Vitória imediata do impostor.');if(imps>=crew)return finish('IMPOSTORES','Os impostores alcançaram a quantidade de tripulantes vivos.');if(now()>=room.endsAt)return finish('TRIPULAÇÃO','O tempo acabou. Os inocentes e xerifes resistiram até a última luz.');}
 // Um xerife só pode ser eliminado pelo SEU próprio erro de disparo.
 function eliminate(p,{ownMistake=false}={}){if(p.role==='XERIFE'&&!ownMistake)return false;if(p.status!=='vivo')return false;p.status='eliminado';p.challenge=null;return true;}
 function uniqueName(raw){const base=raw.normalize('NFKC').trim().replace(/\s+/g,' ').slice(0,12);if(!base)return null;const names=new Set([...room.players.values()].map(p=>p.name.toLocaleLowerCase('pt-BR')));let name=base,n=2;while(names.has(name.toLocaleLowerCase('pt-BR'))){const suffix=String(n++);name=base.slice(0,12-suffix.length)+suffix;}return name;}
 function makeChallenge(p,id){const task=p.tasks.find(t=>t.id===id);if(!task||p.done.has(id))return null;const c={id,nonce:crypto.randomUUID(),openedAt:now(),expiresAt:now()+30000,type:task.type};let puzzle={type:task.type};if(task.type==='fios'){c.answer=shuffle([0,1,2,3]);puzzle.order=c.answer;}if(task.type==='codigo'){c.answer=String(crypto.randomInt(10000)).padStart(4,'0');puzzle.code=c.answer;puzzle.hideAfterMs=2500;}if(task.type==='item'){c.answer=task.destination;puzzle.destination=task.destination;}if(task.type==='energia'){c.answer=Array.from({length:3},()=>crypto.randomInt(3));puzzle.positions=c.answer;}p.challenge=c;return {taskId:id,nonce:c.nonce,expiresAt:c.expiresAt,serverNow:now(),puzzle};}
 function answerMatches(c,answer){if(c.type==='fios'||c.type==='energia')return Array.isArray(answer)&&answer.length===c.answer.length&&answer.every((v,i)=>v===c.answer[i]);return typeof answer==='string'&&answer===c.answer;}
 function processAction(p,m){const fail=message=>({ok:false,message});if(!m||!validUUID(m.requestId)||typeof m.kind!=='string')return fail('Ação inválida.');
  // Cache por sessão: uma retransmissão devolve inclusive falhas, sem novo efeito.
  if(p.results.has(m.requestId))return p.results.get(m.requestId);
  let result;const s=room.settings;
  if(m.bootId!==room.bootId||m.roundId!==room.roundId||m.version!==room.version)result=fail('Ação antiga descartada: a fase já mudou.');
  else if(!connected(p)||(p.status==='saiu'&&!(m.kind==='lobby'&&room.phase==='FIM'&&p.id===room.hostId)))result=fail('Sua vaga está inativa. Aguarde a próxima rodada.');
  else if(m.kind==='configurar'){
   if(room.phase!=='LOBBY'||room.hostId!==p.id)result=fail('Só o dono configura no lobby.');else{const c=m.settings||{};if(!integer(c.impostors,1,9)||!integer(c.sheriffs,0,2)||!integer(c.cooldown,10,60)||c.cooldown%5!==0||!integer(c.minutes,3,10))result=fail('Configuração inválida: impostores 1–9, xerifes 0–2, recarga 10–60 em passos de 5 e duração 3–10 min.');else{room.settings={impostors:c.impostors,sheriffs:c.sheriffs,cooldown:c.cooldown,minutes:c.minutes};result={ok:true,message:'Configurações salvas.'};}}
  }else if(m.kind==='iniciar'){
   const error=validation();if(room.phase!=='LOBBY'||p.id!==room.hostId)result=fail('Só o dono inicia no lobby.');else if(error)result=fail(error);else{
    room.roundId=crypto.randomUUID();room.version++;room.phase='INTRO';room.winner=null;room.reason=null;room.notices=[];room.events=[];room.introEndsAt=now()+4000;room.revealUntil=room.introEndsAt+5000;room.endsAt=room.introEndsAt+s.minutes*60000;
    active().sort((a,b)=>a.order-b.order).forEach((x,i)=>{x.seat=i;});
    shuffle(active()).forEach((x,i)=>{x.role=i<s.impostors?'IMPOSTOR':i<s.impostors+s.sheriffs?'XERIFE':'INOCENTE';x.status='vivo';x.done=new Set();x.tasks=drawTasks();x.challenge=null;x.readyAt=room.introEndsAt+s.cooldown*1000;x.warnings=[];});log('A mesa está iluminada. Os papéis são secretos.');result={ok:true,message:'Partida iniciada.'};
   }
  }else if(m.kind==='lobby'){
   if(room.phase!=='FIM'||room.hostId!==p.id)result=fail('Só o dono volta ao lobby após o fim.');else{room.phase='LOBBY';room.roundId=crypto.randomUUID();room.version++;room.endsAt=0;room.notices=[];room.events=[];for(const x of room.players.values()){if(x.status==='saiu'&&!connected(x)){room.players.delete(x.id);sessions.delete(x.token);continue;}x.role=null;x.status='vivo';x.done=new Set();x.tasks=[];x.readyAt=0;x.challenge=null;x.warnings=[];}result={ok:true,message:'De volta ao lobby.'};}
  }else if(room.phase!=='JOGANDO')result=fail('Ação ignorada fora da partida.');
  else if(p.status!=='vivo')result=fail('Jogadores eliminados ou que saíram não podem agir.');
  else{
   check();if(room.phase!=='JOGANDO')result=fail('A partida acabou.');
   else if(m.kind==='abrirTarefa'){
    const challenge=makeChallenge(p,m.taskId);result=challenge?{ok:true,challenge}:fail('Tarefa inválida ou já concluída.');
   }else if(m.kind==='completarTarefa'){
    const c=p.challenge;
    if(!c||c.id!==m.taskId||c.nonce!==m.nonce)result=fail('Abra a tarefa novamente.');
    else if(p.done.has(c.id))result=fail('Essa tarefa já foi concluída.');
    else if(now()>c.expiresAt){p.challenge=null;result=fail('Tempo da tarefa esgotado. Tente novamente.');}
    else if(now()-c.openedAt<1000)result=fail('Complete as etapas antes de enviar.');
    else if(!answerMatches(c,m.answer)){p.challenge=null;result=fail('Resposta incorreta. Tente de novo.');}
    else{p.done.add(c.id);p.challenge=null;if(p.role!=='IMPOSTOR')room.endsAt=Math.max(now(),room.endsAt-5000);io.emit('gesto',{id:p.id,kind:'objeto'});result={ok:true,message:p.role==='IMPOSTOR'?'Disfarce feito. Não contou no progresso nem no relógio.':'Tarefa concluída. Menos 5 segundos!'};check();}
   }else if(m.kind==='atacar'){
    const target=room.players.get(m.targetId);
    if(!['XERIFE','IMPOSTOR'].includes(p.role))result=fail('Inocentes não podem atacar.');
    else if(!target||target.id===p.id||target.status!=='vivo')result=fail('Escolha outro jogador vivo.');
    else if(now()<p.readyAt)result=fail('Aguarde a recarga.');
    else if(p.role==='IMPOSTOR'&&target.role==='IMPOSTOR')result=fail('Você não pode atacar outro impostor.');
    else{p.readyAt=now()+s.cooldown*1000;io.emit('gesto',{id:p.id,kind:'objeto'});
     if(p.role==='IMPOSTOR'&&target.role==='XERIFE'){room.notices.push({id:crypto.randomUUID(),roundId:room.roundId,targetId:target.id,due:now()+5000,message:`⚠️ ${p.name} tentou te matar!`});result={ok:true,message:'Tentativa bloqueada. O impostor não pode matar xerifes. Recarga consumida.'};}
     else if(p.role==='XERIFE'&&target.role!=='IMPOSTOR'){
      // Confirmação do usuário: alvo xerife sobrevive; só o atirador erra e morre.
      const hitInnocent=target.role==='INOCENTE';if(hitInnocent)eliminate(target);eliminate(p,{ownMistake:true});io.emit('cenario',{ids:hitInnocent?[p.id,target.id]:[p.id]});log(hitInnocent?`${p.name} errou o disparo: ele e ${target.name} foram eliminados.`:`${p.name} atirou em outro xerife e foi eliminado pelo próprio erro. ${target.name} sobreviveu.`);result={ok:true,message:hitInnocent?'Você atingiu um inocente. Vocês dois foram eliminados.':'Você mirou outro xerife. Só você foi eliminado; o alvo sobreviveu.'};check();
     }else{eliminate(target);io.emit('cenario',{ids:[target.id]});log(`${target.name} foi eliminado.`);result={ok:true,message:'Alvo eliminado.'};check();}
    }
   }else result=fail('Evento desconhecido.');
  }
  p.results.set(m.requestId,result);while(p.results.size>200)p.results.delete(p.results.keys().next().value);return result;
 }
 io.on('connection',socket=>{
  let player=null;let stamps=[];
  function allowed(){const t=now();stamps=stamps.filter(x=>t-x<1000);if(stamps.length>=5)return false;stamps.push(t);return true;}
  socket.on('entrar',(m,ack)=>{if(typeof ack!=='function')return;if(!allowed())return ack({ok:false,message:'Aguarde um instante.'});if(!m||!validUUID(m.token))return ack({ok:false,message:'Token inválido.'});
   if(player)return ack({ok:true});let p=sessions.get(m.token);const resumed=!!p;
   if(!p){if(room.phase!=='LOBBY')return ack({ok:false,message:'Aguarde esta partida terminar para entrar.'});if(active().length>=10)return ack({ok:false,message:'A sala está cheia (10 jogadores).'});if(typeof m.name!=='string'||m.name.trim().replace(/\s+/g,' ').length<1||m.name.trim().replace(/\s+/g,' ').length>12)return ack({ok:false,message:'Use um nome de 1 a 12 caracteres.'});const name=uniqueName(m.name);if(!COLORS.includes(m.color)||!ACCESSORIES.includes(m.accessory))return ack({ok:false,message:'Escolha uma roupa válida.'});const occupied=new Set([...room.players.values()].map(x=>x.seat));let seat=0;while(occupied.has(seat))seat++;
    p={id:crypto.randomUUID(),token:m.token,name,color:m.color,accessory:m.accessory,seat,order:room.serial++,socketId:null,offlineAt:0,role:null,status:'vivo',done:new Set(),tasks:[],readyAt:0,challenge:null,results:new Map(),warnings:[]};sessions.set(m.token,p);room.players.set(p.id,p);log(`${p.name} entrou.`);
   }
   const old=io.sockets.sockets.get(p.socketId);p.socketId=socket.id;p.offlineAt=0;player=p;if(old&&old.id!==socket.id)old.disconnect(true);if(!room.hostId){room.hostId=p.id;tell(p,'Você é o dono da sala.');}else changeHost();
   ack({ok:true,resumed,restarted:!!m.previousBootId&&m.previousBootId!==room.bootId,bootId:room.bootId});emitState(p);deliverWarnings(p);broadcast();
  });
  socket.on('acao',(m,ack)=>{if(typeof ack!=='function')return;if(!player||player.socketId!==socket.id)return ack({ok:false,message:'Entre na sala primeiro.'});if(m&&validUUID(m.requestId)&&player.results.has(m.requestId))return ack(player.results.get(m.requestId));if(!allowed())return ack({ok:false,retry:true,message:'Muitas ações. Aguarde um instante.'});try{const result=processAction(player,m);ack(result);broadcast();}catch(e){console.error('Falha interna de ação:',e);ack({ok:false,message:'Ação inválida.'});}});
  socket.on('sincronizar',ack=>{if(!allowed())return;if(player&&player.socketId===socket.id){emitState(player);deliverWarnings(player);if(typeof ack==='function')ack({ok:true});}});
  socket.on('relogio',(m,ack)=>{if(!allowed())return;if(typeof ack==='function')ack({serverNow:now()});});
  socket.on('disconnect',()=>{if(!player||player.socketId!==socket.id)return;player.socketId=null;player.offlineAt=now();player.challenge=null;broadcast();});
 });
 function deliverWarnings(p){if(!connected(p))return;const messages=p.warnings;p.warnings=[];for(const n of messages)if(n.roundId===room.roundId&&room.phase==='JOGANDO')io.to(p.socketId).emit('avisoXerife',{id:n.id,message:n.message});}
 function tick(){if(closed)return;const time=now();let dirty=false;
  if(room.phase==='INTRO'&&time>=room.introEndsAt){room.phase='JOGANDO';room.version++;dirty=true;check();}
  for(const p of [...room.players.values()]){
   if(!connected(p)&&p.offlineAt){
    if(room.hostId===p.id&&time-p.offlineAt>=60000){changeHost();dirty=true;}
    const limit=room.phase==='LOBBY'?60000:90000;
    if(time-p.offlineAt>=limit&&p.status!=='saiu'&&!(room.phase!=='LOBBY'&&p.role==='XERIFE')){
     if(room.phase==='LOBBY'){room.players.delete(p.id);sessions.delete(p.token);log(`${p.name} saiu do lobby.`);}else{p.status='saiu';p.challenge=null;log(`${p.name} saiu por desconexão. A vaga não conta mais para a vitória.`);}
     dirty=true;check();
    }
   }
   deliverWarnings(p);
  }
  if(room.phase==='JOGANDO'){
   const pending=[];for(const n of room.notices){if(n.roundId!==room.roundId)continue;if(n.due>time){pending.push(n);continue;}const p=room.players.get(n.targetId);if(p){p.warnings.push(n);deliverWarnings(p);}}room.notices=pending;check();
  }
  if(!room.players.size){room.hostId=null;if(room.phase!=='LOBBY'){room.phase='LOBBY';room.roundId=crypto.randomUUID();room.version++;}room.notices=[];}
  if(dirty||time-lastBroadcast>=1000)broadcast();
 }
 const interval=setInterval(tick,tickMs);
 return {app,io,httpServer,room,check,close:async()=>{closed=true;clearInterval(interval);room.notices=[];for(const p of room.players.values()){p.challenge=null;p.warnings=[];}await new Promise(resolve=>io.close(resolve));}};
}
if(require.main===module){const game=createGameServer();game.httpServer.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('Xerife e Ladrão — servidor online na porta '+(process.env.PORT||3000)));const stop=()=>game.close().then(()=>process.exit(0));process.once('SIGTERM',stop);process.once('SIGINT',stop);}
module.exports={createGameServer};
