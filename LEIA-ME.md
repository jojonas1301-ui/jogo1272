# Xerife e Ladrão — v3

Jogo multiplayer em português do Brasil, em tempo real, para 3–10 jogadores. Cenário, personagens e objetos desenhados com CSS e SVG locais; sem imagens externas, CDN ou framework de interface.

## Entrega completa

Estes três arquivos ficam **juntos, na mesma pasta**:

```text
server.js
index.html
package.json
```

O código desses arquivos está completo, sem trechos omitidos. O ZIP acrescenta o lockfile, testes executáveis, resultados e o relatório de decisões/revisão.

## Rodar

Instale Node.js 20 ou superior e execute dentro da pasta:

```sh
npm install
npm start
```

Abra `http://localhost:3000`. O servidor usa `process.env.PORT || 3000` e escuta em `0.0.0.0`.

**Para jogar em um Chromebook, basta abrir o site hospedado no Chrome.** Não é necessário instalar Node.js nos aparelhos dos jogadores. O HTML precisa ser servido pelo servidor: abrir por `file://` não funciona, porque o Socket.IO vem de `/socket.io/socket.io.js`.

## Regras desta versão

Esta entrega segue a v3 e a confirmação do usuário: **quando um xerife atira em outro xerife, só o atirador morre**. O alvo sobrevive.

| Quem age | Alvo | Resultado |
|---|---|---|
| Impostor | Inocente | O alvo morre |
| Impostor | Xerife | Ninguém morre; consome recarga; aviso particular ao xerife após 5 s |
| Impostor | Outro impostor | Ação rejeitada |
| Xerife | Impostor | Só o alvo morre |
| Xerife | Inocente | O alvo e o atirador morrem |
| Xerife | Outro xerife | Só o atirador morre; o alvo sobrevive |
| Inocente | Qualquer pessoa | Não pode atacar |

- Xerifes não morrem por ataque alheio, tempo ou desconexão. Só por erro no próprio disparo.
- Xerifes desconectados continuam vivos e contam para a vitória; nunca viram `saiu` durante a rodada.
- Inocentes e impostores viram `saiu` após 90 segundos desconectados e deixam de contar como vivos.
- **Apenas um xerife e um impostor restantes: vitória imediata do impostor.**
- **Tempo esgotado: vitória da tripulação.**
- Como o texto da seção 8 chegou incompleto e o usuário autorizou completá-lo, também foram adotadas estas condições: tripulação vence ao concluir todas as tarefas válidas ou eliminar todos os impostores; impostores vencem por paridade/superioridade de quantidade de vivos.
- Tarefas de impostores não afetam o relógio nem a barra global.

## Como jogar

1. Abra o endereço do site e informe nome, cor do casaco e acessório.
2. A prévia muda enquanto você escolhe a roupa. O primeiro jogador vira dono da sala.
3. O dono configura impostores, xerifes, recarga e minutos no lobby. Clique em **Salvar configurações** antes de iniciar.
4. Com 3–10 jogadores conectados e pelo menos um inocente na distribuição, o dono pode iniciar.
5. A INTRO dura quatro segundos. Em seguida, cada pessoa vê o próprio papel por cinco segundos. Impostores reconhecem seus aliados.
6. Os lugares ao redor da mesa são fixos durante a rodada. Toque em outro personagem para selecionar o alvo e depois em **MATAR** ou **ATIRAR**.
7. Use as tarefas em tela cheia. Cada tarefa válida da tripulação tira cinco segundos do tempo total, uma vez só.
8. No fim, os papéis são revelados. Só o dono pode abrir o próximo lobby; a configuração é mantida.

O tiro do xerife tem **a mesma recarga configurada para o impostor**, inclusive antes do primeiro disparo. A duração começa depois da INTRO.

## Reconexão

- A identidade é um token UUID no `localStorage`, associado ao jogador no servidor.
- Mesma origem do site e mesmo token: mesma identidade, lugar, papel, tarefas concluídas e horário de recarga.
- No lobby, a vaga dura 60 segundos desconectada. Durante a partida, o prazo para inocentes e impostores é de 90 segundos. Xerifes são a exceção descrita nas regras.
- Uma queda rápida não troca o dono. Depois de 60 segundos desconectado, o jogador conectado mais antigo assume e recebe um aviso.
- A partida nunca pausa por queda de internet.
- **Atualizar** fecha e reabre a conexão sem recarregar a página e sincroniza o estado antes de liberar ações.
- Após duas falhas consecutivas de atualização, surge **Recarregar página**, que conserva o token.
- Ações que já estavam em trânsito, sem confirmação, são persistidas na fila e reenviadas com o mesmo `requestId`. Não são criadas novas ações às cegas enquanto offline: os botões ficam desabilitados.
- Ações de fases/rodadas antigas são descartadas.
- Se cair no meio de uma tarefa, reabra-a ao voltar. Tarefas já concluídas não são contadas novamente.
- Um aviso ao xerife offline fica guardado até ele voltar, desde que a mesma rodada ainda esteja em andamento. Se a partida terminar, o aviso é cancelado.
- O relógio usa horário do servidor e estimativa do desvio via ping/pong a cada dois segundos. A contagem nunca mostra número negativo.

O texto do banner de internet lenta foi mantido exatamente:

> Sua internet está lenta ou ruim. Ou você está na aula? Professores, eduquem mais!

**Abas do mesmo navegador usam a mesma identidade.** Para testar pessoas diferentes em um computador, use perfis/sessões de armazenamento independentes. Cada Chromebook terá seu próprio token. Não limpe o armazenamento do site nem compartilhe tokens durante a partida.

## Publicar no Render que você já estava configurando

1. Substitua os arquivos **server.js**, **index.html** e **package.json** do repositório pelos desta pasta. Não envie somente o ZIP.
2. Os três devem ficar na raiz do repositório. Não use o Dockerfile da versão antiga.
3. Use no serviço:

| Campo | Valor |
|---|---|
| Tipo | Web Service |
| Language | Node |
| Root Directory | vazio |
| Build Command | `npm install --omit=dev` |
| Start Command | `npm start` |
| Instâncias | 1 |
| Plano | opção Free / $0, se disponível na sua conta |

4. Publique a versão mais recente. Se conectou um repositório público sem integração de atualização automática, faça a implantação manual da versão mais recente.
5. Quando o serviço estiver pronto, compartilhe o endereço HTTPS com os amigos. A sala é única: não há código de sala para digitar.

A prévia da conversa é temporária, não uma hospedagem permanente. Os preços, limites e disponibilidade da hospedagem dependem da plataforma. A rede da escola pode bloquear o endereço ou a conexão; nesse caso, peça autorização.

## Testes

```sh
npm install
npm test
```

A suíte do servidor tem 18 cenários com conexões reais por `socket.io-client`, sempre com pelo menos três jogadores por cenário. Executa os cenários em paralelo e leva aproximadamente 97 segundos porque um deles espera **uma queda real maior que 90 segundos**.

Teste da interface, incluindo rede lenta e o botão Atualizar:

```sh
npx playwright install --with-deps chromium   # opcional
npm run test:browser
```

O teste de navegador abre três sessões, testa todos os mini-jogos, celular vertical/horizontal e um relógio local adiantado em sete horas. Se o Chromium oficial do Playwright não estiver instalado (rede bloqueada), o script `test/launch.cjs` usa automaticamente o Chromium embutido no pacote npm `@sparticuz/chromium` (devDependency). Não é necessário executar nenhum desses testes no Chromebook para jogar.

Teste visual (T17) — capturas de lobby, intro, mesa com todos os itens e tarefa, em celular (390×844) e desktop (1280×800), com verificações de sobreposição, legibilidade (≥ 14 px) e console limpo:

```sh
npm run test:visual
```

As capturas ficam em `test/shots/` (`desktop-lobby/intro/mesa/tarefa.png` e `mobile-lobby/intro/mesa/tarefa.png`).

Resultados da execução desta entrega:

- `test/rules-result.txt`: 18 passaram, 0 falharam.
- `test/browser-result.txt`: interface, T9 (banner de internet lenta com texto exato) e T11 (Atualizar sem recarregar) passaram; console sem erros/warnings.
- `test/visual-result.txt`: T17 passou nas duas telas; 11 itens do cenário visíveis, sem sobreposição, sem overflow, texto principal ≥ 14 px.

## Limites importantes

- Sessões e partida ficam na memória de **uma única instância**. Não execute múltiplas instâncias sem implementar armazenamento compartilhado.
- Queda do jogador não reinicia a sala. **Reinício do servidor**, porém, perde o estado em memória. O cliente detecta a mudança, mostra `O servidor reiniciou. Voltando ao lobby` e entra no novo lobby.
- É uma sala pública para amigos, sem contas, senha, chat, banco de dados ou moderação.
- O servidor valida ações, respostas, prazos, recargas e idempotência. Isso não é um sistema anti-cheat completo: soluções de tarefas podem ser automatizadas por clientes modificados, e o servidor não comprova um movimento humano real.
- O rate limit é por socket; um serviço público precisaria também de autenticação, proteção por IP, monitoramento e mitigação de abuso.

Todas as decisões adotadas para completar o trecho ausente e a revisão de bugs estão em **DECISOES-E-REVISAO.md**.
