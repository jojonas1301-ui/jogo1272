'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');
const COLORS = ['#75d6b0','#ffa779','#a89bff','#f7cf68','#7cbcff','#f190ba','#ef6b6b','#64d2d6','#9be070','#d49b6a','#c985f7','#b8c7d4'];
const integer = (n,min,max) => Number.isInteger(n) && n>=min && n<=max;
function createGameServer({tickMs=250, notificationMs=5000, disconnectMs=45000}={}) {
 const rooms = new Map();
 const server = http.createServer((req,res)=>{
  const pathname = new URL(req.url,'http://localhost').pathname;
  if(pathname === '/health'){res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"ok":true}');}
  if(pathname !== '/' && pathname !== '/index.html'){res.writeHead(404);return res.end('Não encontrado');}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
  fs.createReadStream(path.join(__dirname,'index.html')).pipe(res);
 });
 const wss = new WebSocketServer({server,maxPayload:8192});
 const send=(ws,type,data={})=>{if(ws?.readyState===WebSocket.OPEN) ws.send(JSON.stringify({type,...data}));};
 function snapshot(r,p){return {code:r.code,hostId:r.hostId,phase:r.phase,round:r.round||0,settings:r.settings,winner:r.winner,reason:r.reason,remaining:r.phase==='playing'?Math.max(0,Math.ceil((r.endsAt-Date.now())/1000)):0,players:[...r.players.values()].map(x=>({id:x.id,name:x.name,color:x.color,alive:x.alive,connected:!!x.ws,role:r.phase==='ended'?x.role:null})),you:{id:p.id,role:r.phase==='lobby'?null:p.role,alive:p.alive,done:p.done||[],killReadyAt:p.killReadyAt||0,shotReadyAt:p.shotReadyAt||0,tasks:p.tasks||[]},events:r.events.slice(-12)};}
 const broadcast=r=>{for(const p of r.players.values())send(p.ws,'state',snapshot(r,p));};
 function event(r,text){r.events.push({id:crypto.randomUUID(),text,time:Date.now()});if(r.events.length>30)r.events.shift();}
 function finish(r,winner,reason){if(r.phase!=='playing')return;r.phase='ended';r.winner=winner;r.reason=reason;event(r,reason);broadcast(r);}
 function check(r){if(r.phase!=='playing')return;const live=[...r.players.values()].filter(p=>p.alive);if(!live.some(p=>p.role==='assassin'))finish(r,'survivors','Todos os assassinos foram eliminados.');else if(!live.some(p=>p.role==='innocent'))finish(r,'assassins','Não há mais inocentes vivos.');else if(Date.now()>=r.endsAt)finish(r,'survivors','O tempo acabou. Os sobreviventes resistiram!');}
 function gesture(r,p){for(const x of r.players.values())send(x.ws,'gesture',{id:p.id});}
 function tasks(){return ['wires','signal','locks','wires','signal'].map((kind,i)=>({id:i,kind,title:['Juntar os fios','Calibrar a lanterna','Abrir os fechos','Restaurar o circuito','Sintonizar o rádio'][i]}));}
 function assignHost(r){if(!r.players.get(r.hostId)?.ws){const next=[...r.players.values()].find(p=>p.ws);if(next){r.hostId=next.id;event(r,`${next.name} agora é o dono da sala.`);}}}
 wss.on('connection',ws=>{
  let room=null, player=null;let count=0,windowAt=Date.now();
  ws.on('message',raw=>{try{
   if(Date.now()-windowAt>1000){windowAt=Date.now();count=0;}if(++count>35)return;
   const m=JSON.parse(raw);const fail=text=>send(ws,'error',{message:text});
   if(m.type==='join'){
    if(player)return fail('Você já entrou.');
    const code=String(m.code||'').toUpperCase().trim();const name=String(m.name||'').trim().slice(0,18);
    if(!/^[A-Z0-9-]{3,16}$/.test(code)||!name)return fail('Informe nome e código de sala válidos.');
    let r=rooms.get(code);if(!r){r={code,players:new Map(),hostId:null,phase:'lobby',settings:{assassins:1,sheriffs:1,cooldown:20,duration:180},events:[]};rooms.set(code,r);}
    let p=[...r.players.values()].find(x=>x.token===m.token && typeof m.token==='string');
    if(p?.ws)return fail('Este jogador já está conectado em outra janela.');
    if(!p){if(r.phase!=='lobby')return fail('A partida já começou. Aguarde a próxima rodada.');if(r.players.size>=12)return fail('Sala cheia (12 jogadores).');p={id:crypto.randomUUID(),token:crypto.randomUUID(),name,color:COLORS.includes(m.color)?m.color:COLORS[0],alive:true,ws:null};r.players.set(p.id,p);event(r,`${p.name} entrou na sala.`);}
    clearTimeout(p.disconnectTimer);p.ws=ws;room=r;player=p;if(!r.hostId)r.hostId=p.id;assignHost(r);
    send(ws,'joined',{token:p.token,id:p.id});broadcast(r);return;
   }
   if(!room||!player)return fail('Entre em uma sala primeiro.');
   const r=room,p=player;
   if(m.type==='settings'){
    if(r.hostId!==p.id||r.phase!=='lobby')return fail('Somente o dono pode configurar na espera.');
    const s=m.settings||{};if(!integer(s.assassins,1,4)||!integer(s.sheriffs,1,4)||!integer(s.cooldown,3,120)||!integer(s.duration,60,900))return fail('Configuração inválida.');
    r.settings={assassins:s.assassins,sheriffs:s.sheriffs,cooldown:s.cooldown,duration:s.duration};broadcast(r);return;
   }
   if(m.type==='start'){
    if(r.hostId!==p.id||r.phase!=='lobby')return fail('Só o dono inicia na sala de espera.');
    const list=[...r.players.values()];if(list.some(x=>!x.ws))return fail('Aguarde a reconexão ou saída dos jogadores offline.');
    if(list.length<3||list.length<r.settings.assassins+r.settings.sheriffs+1)return fail('É preciso ter pelo menos 3 pessoas e sobrar 1 inocente.');
    for(let i=list.length-1;i>0;i--){const j=crypto.randomInt(i+1);[list[i],list[j]]=[list[j],list[i]];}
    list.forEach((x,i)=>{x.role=i<r.settings.assassins?'assassin':i<r.settings.assassins+r.settings.sheriffs?'sheriff':'innocent';x.alive=true;x.done=[];x.tasks=tasks();x.activeTask=null;x.killReadyAt=Date.now()+r.settings.cooldown*1000;x.shotReadyAt=0;});
    r.phase='playing';r.round=(r.round||0)+1;r.winner=null;r.reason=null;r.endsAt=Date.now()+r.settings.duration*1000;r.events=[];event(r,'A lanterna acendeu. Não confie em qualquer gesto.');broadcast(r);return;
   }
   if(m.type==='lobby'){
    if(r.hostId!==p.id||r.phase!=='ended')return fail('Somente o dono pode abrir a próxima rodada.');
    r.phase='lobby';for(const x of r.players.values()){if(!x.ws){clearTimeout(x.disconnectTimer);r.players.delete(x.id);continue;}x.role=null;x.alive=true;x.tasks=[];x.done=[];x.activeTask=null;}event(r,'Uma nova rodada está sendo preparada.');broadcast(r);return;
   }
   if(r.phase!=='playing'||!p.alive)return fail('Essa ação só está disponível para jogadores vivos na partida.');
   check(r);if(r.phase!=='playing')return;
   if(m.type==='taskStart'){
    if(!integer(m.id,0,4)||p.done.includes(m.id))return fail('Tarefa indisponível.');
    p.activeTask={id:m.id,steps:0,sequence:Array.from({length:3},()=>crypto.randomInt(4))};
    send(ws,'challenge',{id:m.id,sequence:p.activeTask.sequence,kind:p.tasks[m.id].kind});return;
   }
   if(m.type==='taskStep'){
    const t=p.activeTask;if(!t||t.id!==m.id||m.value!==t.sequence[t.steps]){p.activeTask=null;return fail('Sequência incorreta. Abra a tarefa e tente novamente.');}
    t.steps++;if(t.steps===3){p.done.push(t.id);p.activeTask=null;if(p.role!=='assassin')r.endsAt-=5000;gesture(r,p);send(ws,'toast',{message:p.role==='assassin'?'Disfarce concluído. O relógio não mudou.':'Tarefa concluída: menos 5 segundos!'});check(r);broadcast(r);}return;
   }
   if(m.type==='attack'){
    if(!['assassin','sheriff'].includes(p.role))return fail('Você não pode eliminar jogadores.');
    const target=r.players.get(m.target);if(!target||!target.alive||target.id===p.id)return fail('Escolha outro jogador vivo.');
    const now=Date.now();if(now<(p.role==='assassin'?p.killReadyAt:p.shotReadyAt))return fail('Aguarde a recarga.');
    if(p.role==='assassin'){
     p.killReadyAt=now+r.settings.cooldown*1000;
     if(target.role==='sheriff'){
      send(ws,'toast',{message:'Sua tentativa falhou. Xerifes são imunes ao assassino.'});
      const round=r.round;
      setTimeout(()=>{if(r.phase==='playing'&&r.round===round){send(target.ws,'warning',{message:`${p.name} tentou matar você!`});}},notificationMs).unref();
     }else{target.alive=false;target.activeTask=null;event(r,`${target.name} foi encontrado sem vida.`);}
    }else{
     p.shotReadyAt=now+8000;
     if(target.role==='assassin'){target.alive=false;target.activeTask=null;event(r,`${p.name} eliminou ${target.name}, um assassino.`);}
     else{p.alive=false;p.activeTask=null;event(r,`${p.name} errou o disparo e foi eliminado. ${target.name} sobreviveu.`);}
    }
    check(r);broadcast(r);gesture(r,p);return;
   }
  }catch{send(ws,'error',{message:'Mensagem inválida.'});}});
  ws.on('close',()=>{if(!room||!player||player.ws!==ws)return;const r=room,p=player;p.ws=null;assignHost(r);broadcast(r);p.disconnectTimer=setTimeout(()=>{
   if(p.ws)return;
   if(r.phase==='lobby'){r.players.delete(p.id);event(r,`${p.name} saiu da sala.`);}else if(r.phase==='playing'&&p.alive){p.alive=false;event(r,`${p.name} foi eliminado por desconexão.`);check(r);}
   assignHost(r);broadcast(r);if(![...r.players.values()].some(x=>x.ws)){rooms.delete(r.code);for(const x of r.players.values())clearTimeout(x.disconnectTimer);}
  },disconnectMs);p.disconnectTimer.unref();});
  ws.on('error',()=>{});
 });
 const interval=setInterval(()=>{for(const r of rooms.values()){if(r.phase==='playing'){check(r);broadcast(r);}}},tickMs);interval.unref();
 return {server,wss,rooms,close:()=>{clearInterval(interval);for(const r of rooms.values())for(const p of r.players.values())clearTimeout(p.disconnectTimer);for(const ws of wss.clients)ws.terminate();return new Promise(resolve=>wss.close(()=>server.close(resolve)));}};
}
if(require.main===module){const {server}=createGameServer();server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('Mesa Sombria no ar, porta '+(process.env.PORT||3000)));}
module.exports={createGameServer};
