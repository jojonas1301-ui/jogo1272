# Xerife e Ladrão — v3

Jogo multiplayer em tempo real, em português do Brasil, para 3–10 jogadores no navegador.
Tudo desenhado com CSS e SVG locais — sem imagens externas nem frameworks de interface.

## Rodar

```sh
npm install
npm start
```

Abra `http://localhost:3000`. O servidor usa `process.env.PORT || 3000` e escuta em `0.0.0.0`.

Arquivos da entrega: `server.js` (Express + Socket.IO, toda a lógica da partida),
`index.html` (apenas interface) e `package.json`.

## Testes

```sh
npm test           # 18 cenários de regras com 3+ clientes Socket.IO reais
npm run test:browser   # navegador: reconexão, banner de internet lenta, mini-jogos
npm run test:visual    # capturas T17 em celular 390x844 e desktop 1280x800 (test/shots/)
```

Instruções completas, regras e decisões: `LEIA-ME.md` e `DECISOES-E-REVISAO.md`.
