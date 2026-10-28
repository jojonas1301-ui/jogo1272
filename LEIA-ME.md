# Mesa Sombria

Jogo multiplayer em português para 3–12 pessoas. Personagens permanecem à mesa, com tarefas na interface e papéis secretos. HTML sem bibliotecas, fontes ou imagens externas; servidor Node.js + WebSocket.

## O que há na tela

- **Sala desenhada em SVG**: paredes de tábuas, janela com luz fria, prateleiras, piso e um facho de luar atravessando o ambiente.
- **Mesa de madeira** com veios, aro esculpido, arranhões, marca de copo e objetos espalhados: rádio, caixa de ferramentas, alicate, chave, baralho, moedas e caneca.
- **Lanterna** desenhada com chama animada, halo que pulsa e poeira suspensa na luz.
- **Personagens** com três variações de cabelo, corpo em SVG, cadeira própria, sombra no chão e anel de nome (o seu fica destacado em verde).
- **Gestos**: ao fazer tarefa ou atacar, o mesmo movimento de mão + engrenagem aparece no assento — sem revelar o papel.
- **Eliminados** ficam em cinza com uma caveira sobre o assento; jogadores offline aparecem esmaecidos com a etiqueta `offline`.
- **Painel de controle** com anel de tempo que se esvazia, papel secreto com cor por papel, barra de progresso das tarefas e recarga animada do botão de ação.
- **Fim de rodada** com revelação de todos os papéis na mesa e numa lista, mostrando quem sobreviveu.
- **Registro ao vivo** com horário de cada acontecimento, destaque na última linha.
- Tudo responsivo (testado em 390px), com `prefers-reduced-motion` respeitado e sem rolagem horizontal.

## Importante: como o multiplayer funciona

**Baixar o HTML não cria uma conexão entre aparelhos sozinho.** Todos precisam apontar para a mesma instância do servidor e usar o mesmo código de sala. O servidor precisa continuar ligado. Cada código cria uma sala diferente.

O servidor entregue aqui está pronto para rodar, mas não representa uma hospedagem pública permanente. A demonstração da conversa é temporária. Reiniciar o servidor apaga salas e partidas: os dados ficam somente na memória.

## 1. Rodar no próprio computador

Instale Node.js 20 ou superior. Extraia o ZIP, abra um terminal dentro da pasta `mesa-sombria` e execute:

```sh
npm ci --omit=dev
npm start
```

No Windows, você também pode abrir `iniciar-windows.bat`, depois de instalar Node.js.

Abra `http://localhost:3000`. Informe nome, roupa e código (ex.: AMIGOS). O endereço do servidor já estará preenchido. A primeira pessoa a entrar é dona da sala.

Quem já está na sala pode usar **Convite** para copiar um link com sala e servidor preenchidos; **Código** copia apenas o código.

### Amigos na mesma rede Wi-Fi

Com o servidor ligado, descubra o IP do computador que o executa (por exemplo, `192.168.1.20`). Nos outros aparelhos, abra `http://192.168.1.20:3000`. Libere a porta 3000 no firewall somente para a rede privada quando necessário.

`localhost` significa o próprio aparelho: seus amigos não devem usar `localhost` para acessar seu computador.

### Pessoas pela internet

Hospede esta pasta em um serviço que execute **Node.js e aceite conexões WebSocket**, com HTTPS. Configuração usual:

- Instalação: `npm ci --omit=dev`
- Inicialização: `npm start`
- Porta: variável de ambiente `PORT` fornecida pela plataforma (padrão 3000).
- Verificação de saúde: `/health`.
- Apenas **uma instância** do processo, pois as salas ficam na memória.
- Proxy reverso deve encaminhar upgrades WebSocket e permitir conexões duradouras.

Há também um `Dockerfile` para hospedagem em contêiner. Não coloque apenas o HTML em uma hospedagem estática: ela não executará o servidor multiplayer.

Depois de hospedar, compartilhe o endereço HTTPS e um código de sala. As pessoas podem abrir o site ou abrir o `index.html` baixado e preencher o campo **Endereço do servidor** com esse HTTPS.

## 2. Usar apenas o arquivo HTML como cliente

O arquivo é `index.html` (há uma cópia idêntica em `Mesa-Sombria.html`). Abra no navegador e preencha:

1. Seu nome.
2. Cor do casaco (12 opções).
3. Código da sala (3 a 16 letras, números ou hífens).
4. Endereço do servidor online, por exemplo `https://seu-servidor.com`.

O endereço precisa ser real: o exemplo não é um servidor existente. O mesmo servidor e código devem ser usados por todos. Se abrir o jogo em uma página HTTPS, utilize servidor HTTPS também. O arquivo local foi testado via `file://` no Chromium; alguns navegadores móveis podem exigir abrir o site hospedado em vez de um arquivo local.

## Regras implementadas

- Dono: primeiro a entrar. Se desconectar, a função passa para alguém conectado.
- Dono configura na espera: 1–4 assassinos, 1–4 xerifes, recarga do assassino de 3–120 segundos e duração de 60–900 segundos.
- Clique em **Salvar configurações** antes de iniciar. São necessários pelo menos 3 jogadores conectados e pelo menos 1 inocente após distribuir os outros papéis.
- Papéis sorteados no servidor. Durante a partida, cada cliente recebe somente o próprio papel; os papéis de todos aparecem no final.
- **Inocente:** não pode matar. Faz tarefas e tenta sobreviver. Não há botão para se matar.
- **Assassino:** botão discreto **Interagir** no canto do painel permite escolher um alvo. Pode matar inocentes e outros assassinos. Não pode matar xerifes.
- Toda tentativa do assassino consome a recarga. A primeira ação também aguarda essa recarga a partir do início da rodada.
- Tentativa contra xerife falha; após **5 segundos**, o xerife recebe o nome do atacante em aviso particular, se ainda for a mesma rodada em andamento e estiver conectado.
- **Xerife:** botão **Eliminar**. Acertou assassino: o alvo morre. Mirou inocente ou outro xerife: **só o xerife atirador morre, e o alvo sobrevive**. Recarga do xerife: 8 segundos.
- Cada pessoa tem **5 tarefas por rodada**, com três cliques em sequência por tarefa. Fios, sinal de lanterna/rádio e fechos.
- Cada tarefa concluída por inocente ou xerife tira **5 segundos** do tempo total. Tarefas do assassino não alteram o relógio. Uma tarefa não conta duas vezes.
- Tarefas e ataques fazem o mesmo gesto de mexer em objetos, representado pelo movimento da mão e uma engrenagem. A animação, sozinha, não identifica assassinos.
- Mortos assistem, mas não fazem tarefas nem atacam. Não existe movimentação livre ou votação.
- **Sobreviventes vencem** se o tempo acabar ou não houver assassinos vivos.
- **Assassinos vencem** quando não há inocentes vivos, mesmo que ainda haja xerifes. Não há vitória por igualdade de quantidade.
- Terminar as cinco tarefas não vence automaticamente; apenas reduz o relógio.
- O dono pode abrir uma nova rodada após o fim.

## Desconexões

O cliente tenta reconectar automaticamente a cada 2,5 segundos. A identidade fica em `sessionStorage` na aba. Atualize a mesma aba e entre de novo na mesma sala/servidor para recuperar sua identidade, enquanto ela existir.

Há tolerância de 45 segundos. Na espera, a vaga é removida depois desse prazo; durante a partida, o jogador desconectado é eliminado. Não reconectar não congela o jogo. Ao voltar à espera, as vagas offline são removidas. Se todos saírem, a sala é descartada após o prazo. A transferência de dono não volta automaticamente ao dono anterior.

Use janelas/perfis independentes para simular pessoas diferentes; algumas formas de duplicar abas podem copiar a sessão. Não compartilhe tokens de sessão.

## Testes

Execute na raiz do projeto:

```sh
npm ci
npm test
```

Os testes usam conexões WebSocket reais e validam permissões, papéis, tarefas, tiros, recarga, avisos, reconexão e vitórias.

Para o teste de interface (opcional):

```sh
npx playwright install --with-deps chromium
node browser.cjs
```

O teste abre três sessões, incluindo tela de 390px, faz as cinco tarefas, encerra a rodada e verifica o arquivo local. As capturas são gravadas em `desktop.png` e `mobile.png`.

## Estrutura

- `index.html`: interface completa, CSS, SVG e JavaScript no próprio arquivo (`Mesa-Sombria.html` é uma cópia idêntica).
- `server.js`: salas, sorteio e regras do jogo.
- `package.json` / `package-lock.json`: dependências e comandos.
- `game.test.js`: testes automáticos das regras.
- `browser.cjs`: teste de interface com Chromium.
- `Dockerfile`: opção para executar o servidor em contêiner.
- `Mesa-Sombria-completo.zip`: pacote pronto para enviar a outras pessoas (mesmo conteúdo, na pasta `mesa-sombria/`).

## Limites

Projeto para partidas entre amigos, sem contas, chat/voz ou banco de dados. O código de sala não é uma senha. Não há moderação, proteção anti-DDoS ou sistema anti-cheat completo. As ações e papéis são validados no servidor, mas clientes modificados podem automatizar tarefas. Para publicar um serviço aberto de grande escala, adicione autenticação, limites por IP, monitoramento e armazenamento compartilhado antes de aumentar o número de instâncias.
