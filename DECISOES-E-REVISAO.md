# Decisões, revisão e testes — Xerife e Ladrão v3

## 1. Confirmação do usuário e trecho incompleto

O texto v3 chegou cortado em `8. Tempo e vitória — Contador regressivo visível`. Antes de prosseguir, foram feitas duas perguntas. O usuário autorizou completar as regras ausentes com decisões simples e escolheu:

**Xerife atira em outro xerife: só o atirador morre. O xerife atingido sobrevive.**

Essa confirmação prevalece sobre a linha contraditória da seção 5 que dizia que ambos morreriam. A regra de atirar em inocente permanece: **inocente e atirador morrem**.

## 2. Decisões adotadas

1. **Vitória para completar a seção 8:** a tripulação vence por todas as tarefas válidas, ausência de impostores vivos ou fim do tempo. Impostores vencem quando sua quantidade de vivos é maior ou igual à de tripulantes vivos. O caso de apenas um xerife e um impostor recebe uma verificação e mensagem específicas: impostor vence imediatamente.
2. **Ordem de verificação:** nenhum impostor vivo → tarefas concluídas → duelo xerife/impostor → paridade → tempo. Antes de aceitar um ataque/tarefa, o servidor verifica se a partida já deveria ter acabado. Assim, uma ação recebida após o prazo não é usada para mudar o vencedor.
3. **Configuração com paridade inicial:** a validação é a fornecida pelo usuário (mínimo de pessoas e ao menos um inocente), sem adicionar outra restrição de balanceamento. Uma distribuição com muitos impostores pode vencer por paridade assim que a fase JOGANDO começar.
4. **Xerife contra xerife:** o alvo sobrevive; só quem atirou morre por erro próprio, conforme a resposta do usuário. O disparo consome a recarga.
5. **Ataque contra xerife:** o impostor pode selecionar o personagem e fazer uma tentativa bloqueada. Isso nunca chama a eliminação do alvo; consome recarga e agenda o aviso de cinco segundos. Xerifes não são invulneráveis ao próprio erro.
6. **Impostor contra impostor:** rejeitado sem consumo de recarga. Autoataques, alvos já eliminados/saiu e ataques de inocentes também são rejeitados.
7. **Recarga inicial:** tanto o xerife quanto o impostor começam esperando uma recarga inteira depois da INTRO. A duração configurada é idêntica para os dois papéis.
8. **Impostor offline:** como a v3 não especificou a expiração dele, foi adotado o mesmo prazo do inocente: após 90 segundos, vira `saiu` e não conta para a vitória. Xerifes continuam `vivo` mesmo depois de 90 segundos offline. Um xerife já eliminado por erro próprio não ressuscita ao desconectar.
9. **Lobby após uma rodada:** o papel antigo é removido. A partir daí todos seguem o prazo de 60 segundos do lobby, inclusive quem foi xerife na rodada anterior. Participantes conectados que tinham virado `saiu` são reativados para a próxima rodada; vagas `saiu` desconectadas são removidas.
10. **Transferência de dono:** após 60 segundos de queda, o mais antigo entre os conectados assume. O dono anterior não reassume automaticamente ao voltar. Ser xerife não impede perder a função de dono.
11. **Tarefas:** catálogo de oito tarefas, com dois exemplos de cada um dos quatro tipos. Cada pessoa recebe cinco IDs distintos: um de cada tipo mais uma quinta aleatória. A ordem também é aleatória. Impostores recebem cinco tarefas idênticas em funcionamento, apenas para disfarçar.
12. **Prazos das tarefas:** 30 segundos por tentativa. O código fica visível por 2,5 segundos. O servidor exige nonce da tentativa, prazo válido, solução correta e pelo menos um segundo decorrido. Erro/expiração permite uma tentativa nova. Arrastar itens também tem alternativa por dois toques para acessibilidade.
13. **Barra global:** X é o total de tarefas válidas concluídas por inocentes/xerifes. Y começa em cinco por tripulante. Quando alguém vira `saiu`, suas tarefas já concluídas continuam em X/Y, mas suas tarefas não feitas deixam de bloquear a barra. Tarefas não feitas de jogadores eliminados permanecem na meta daquela rodada; ainda existem as vitórias por tempo ou eliminação dos impostores.
14. **Fila offline:** para conciliar a fila com a proibição de agir às cegas, guardam-se apenas ações criadas enquanto sincronizado e que ficaram sem confirmação. Não é permitido criar novos ataques ou conclusões offline. As retransmissões usam o mesmo UUID; mensagens de outra inicialização, rodada ou fase são descartadas.
15. **Idempotência:** cache dos últimos 200 resultados **por jogador/token**, incluindo resultados de erro. Uma retransmissão já conhecida recebe o resultado original, inclusive depois de morrer ou mudar de fase. O cache é consultado antes do rate limit para não substituir o resultado de uma ação já concluída por uma resposta diferente.
16. **Rate limit e ordem:** até cinco novos eventos recebidos por segundo por socket; excesso recebe indicação de tentar depois, sem executar a ação. Replays conhecidos apenas devolvem o cache. As mutações são síncronas no event loop do Node, sem `await` entre validar e alterar estado, portanto seguem a ordem de chegada e não intercalam metade de um tiro com outro.
17. **Tempos e manutenção:** deadlines no relógio do servidor, scheduler de manutenção de 100 ms e estado periódico a cada segundo. Não há `setTimeout` de morte/aviso por jogador: os avisos têm horário/roundId e são processados pelo scheduler. Ao terminar, intro, revelação, tentativas e avisos da rodada são cancelados. A manutenção de conexões continua no FIM/lobby, e o único interval do servidor é cancelado em `close()`/encerramento.
18. **Visual e posições:** INTRO de quatro segundos com círculo de luz móvel; acendimento gradual; revelação de cinco segundos após a INTRO. Desenhos locais em CSS/SVG. Lugares são compactados na ordem de entrada antes da rodada e depois não mudam; o desenho adapta o raio ao tamanho da tela, sem alterar a identidade da posição. Movimento reduzido respeita a preferência do navegador.
19. **Token e armazenamento:** uma identidade por origem/navegador via localStorage. Abas compartilham a sessão; uma segunda conexão com o mesmo token substitui a primeira. Para simular pessoas diferentes, use perfis independentes. Sem contas, senha, múltiplas salas, banco de dados ou persistência do processo.
20. **Servidor reiniciado:** como previsto no pedido, perda de sessão por reinício é detectada pelo bootId. O cliente avisa e volta ao lobby. Isso é diferente de queda da internet do jogador, que preserva a partida dentro das regras de vaga.
21. **Atualizar:** o fluxo normal desconecta/reconecta e recebe estado completo sem navegação. `location.reload()` existe somente no botão explícito de último recurso, depois de duas falhas; não faz parte do fluxo normal de Atualizar.
22. **Internet lenta:** ping a cada dois segundos; três RTTs de pelo menos 800 ms ou reconexão tornam o banner visível. Timeout de ping também é uma amostra ruim. São necessários pelo menos cinco segundos de amostras boas para ocultá-lo. O texto exato é:

   > Sua internet está lenta ou ruim. Ou você está na aula? Professores, eduquem mais!

## 3. Bugs, causas e correções

A revisão considerou tanto os trechos herdados da base v2 quanto as alterações v3. Não foi feita a alegação de que todos esses itens causaram falhas na primeira execução da v3: alguns foram identificados por inspeção antes dos testes.

| Bug/incompatibilidade | Causa | Correção |
|---|---|---|
| Vitória por tempo invertida para a v3 | A base v2 dava vitória aos impostores no zero | Alterada a condição para TRIPULAÇÃO; teste de tempo atualizado e executado |
| Xerife poderia virar `saiu` e deixar de contar vivo | Expiração de 90 s genérica para todos os papéis | Exceção explícita para xerife durante a rodada/FIM; teste força prazo maior que 90 s e confirma status vivo |
| Tiros errados não obedeciam à nova regra | A base protegia xerifes de qualquer eliminação e permitia matar inocente sem punir o atirador | Eliminação central admite xerife somente por `ownMistake`; ramo de erro é validado no servidor e altera os afetados atomicamente |
| Tiro contra outro xerife contraditório | Seções 0 e 5 do pedido davam resultados diferentes | Pergunta ao usuário; implementada sua escolha: alvo sobrevive, atirador morre |
| Textos da interface ainda diziam “xerife imortal” | Mensagens herdadas da v2 | Substituídas pelas condições reais de erro de tiro e pelo resumo “Como vencer” |
| Vaga expirada reconectada poderia ficar fora do próximo lobby | Remoção de todos os `saiu`, inclusive conectados; validação de status anterior à ação de retorno | Conectados são reintegrados no lobby; dono que voltou como observador pode preparar a próxima rodada; teste de regressão executado |
| Repetição de uma ação poderia receber rate limit em vez do resultado original | Rate limit era aplicado antes do cache | Resultados já conhecidos são devolvidos antes do limitador, sem nova mutação |
| Lugares podiam ter buracos e não ficar igualmente espaçados | Índices de vagas removidas no lobby eram reaproveitados sem compactar no início | Compactação antes da INTRO e coordenadas em círculo usando o menor lado do cenário |
| Mensagem de início habilitado podia ocultar alterações não salvas | Estado periódico sobrescrevia a explicação local | Mensagem de “salve as alterações” tem prioridade enquanto o formulário está alterado |
| Possível 404 de favicon no console | Navegador pede favicon mesmo sem imagem externa | Endpoint `/favicon.ico` responde 204, sem recurso inexistente |
| Falso negativo em teste de queda na base revisada | O teste alterava o horário da queda antes do servidor receber o disconnect | O teste aguarda a desconexão ser registrada antes de manipular o relógio do cenário |
| Falso negativo no teste de retorno ao lobby da base revisada | O teste esperava estado final em um objeto de cliente já desconectado | Passou a observar o cliente reconectado com o mesmo token |

## 4. Revisão estática

- `node --check server.js`: aprovado.
- Parsing do script inline do cliente: aprovado.
- Conferidos nomes de eventos: `entrar`, `acao`, `sincronizar`, `relogio`, `estadoCompleto`, `aviso`, `avisoXerife`, `gesto`, `cenario`.
- O cliente Socket.IO é servido localmente em `/socket.io/socket.io.js`.
- Conferidas validações de fase, papel, status, alvo, cooldown, prazo e nonce.
- A função central de eliminação bloqueia xerifes sem a marca interna de erro próprio. Essa marca não vem do payload do cliente.
- Estados e mensagens de nomes usam `textContent`/criação de nós. Não há `innerHTML` de dados de usuário nem `eval`.
- Nenhum token de outro jogador é enviado nos snapshots.
- Sorteio e papéis são controlados no servidor; o snapshot filtra os papéis privados.
- Sem timers de aviso pendurados em outra rodada: avisos são vinculados ao roundId e removidos no FIM.

## 5. Testes executados

### Servidor — 18 cenários aprovados, zero falhas

Conexões reais com `socket.io-client`, pelo menos três jogadores por cenário:

1. T1: tentativa do impostor contra xerife, cooldown consumido e aviso só ao xerife após cinco segundos reais.
2. T2 adaptado à v3: xerife offline após 90 s não morre nem sai; fim do tempo não o elimina e dá vitória à tripulação.
3. T3: queda real de dez segundos, com mesma posição, papel, tarefas e recarga ao voltar.
4. T4: queda real maior que noventa segundos de um inocente; status `saiu` e rodada continua.
5. T5: ação repetida com o mesmo requestId executa uma vez e devolve o mesmo resultado.
6. T6: tarefa do impostor não altera relógio ou progresso.
7. T7: cinco tarefas válidas tiram exatamente 25 segundos.
8. T8: spam/cooldown rejeitados no servidor.
9. T10: queda durante tarefa permite refazê-la sem dupla contagem.
10. Tolerância de dono, sigilo dos papéis e ação de rodada antiga.
11. Aviso guardado enquanto o xerife está offline e cancelamento ao terminar a partida.
12. Vitória por tarefas e vitória por tempo nas regras v3.
13. Jogador que virou `saiu` e reconectou participa do lobby seguinte.
14. Xerife contra inocente: ambos eliminados por erro do atirador.
15. Xerife contra impostor: impostor eliminado, xerife vivo, tripulação vence.
16. Duelo final xerife/impostor encerra imediatamente com vitória do impostor.
17. Xerife contra outro xerife: só o atirador morre; replay não repete.
18. Impostor offline expirado sai e não bloqueia vitória da tripulação.

O T4 é uma espera real. Alguns testes extras de prazo manipulam o timestamp do jogador no processo de teste para testar a condição sem repetir esperas longas; isso não é uma API disponível ao cliente.

### Navegador — três sessões Chromium

- T9: latência de acknowledgements reais de ping retardada em 950 ms, três medições ruins mostram o banner exato, conexão boa por pelo menos cinco segundos o esconde.
- T11: Atualizar mantém identidade, rodada, tarefas e a tela aberta, com zero navegações.
- Quatro mini-jogos concluídos pela interface e validados no servidor.
- Nomes repetidos, acessórios e painel apenas do dono.
- Relógio do cliente adiantado em sete horas corrigido pelo ping/pong.
- Botões desabilitados durante queda e sincronização ao voltar.
- Tela de 390×844 e 844×390 sem overflow horizontal.
- Sem erros JavaScript, mensagens de console.error ou warnings nos cenários executados.

Resultados completos estão em `test/rules-result.txt` e `test/browser-result.txt`. Testes aprovados não são garantia de ausência absoluta de bugs ou proteção anti-cheat/anti-DDoS completa.

## 6. Reexecução e melhorias desta entrega (27/10/2026)

Nesta sessão o repositório foi atualizado para a v3 completa (Express + Socket.IO no lugar do servidor antigo `ws`), os arquivos foram conferidos por hash contra a entrega v3 e **todas as suítes foram executadas de novo, do zero**.

### Bugs encontrados nesta reexecução (Bug, causa, correção)

| Bug | Causa | Correção |
|---|---|---|
| Cenário tinha apenas 3 itens (rádio, "garrafa" na verdade era a vela, lanterna), abaixo do mínimo de 8 da seção 9.3 | A entrega anterior não implementou o inventário completo do cenário | Adicionados e desenhados por código: vela com chama tremulando e fumaça, garrafa, copo com reflexo, cartas de baralho, caneca fumegante, relógio de parede com ponteiros ligados ao tempo da partida, pergaminho, livro, duas cadeiras — além de lanterna, rádio, toalha de feltro (11 itens no total) |
| Partículas de poeira viravam riscos amarelos cobrindo a mesa | O canvas da poeira não era limpo entre quadros; cada partícula deixava rastro acumulado | `clearRect` a cada quadro em `dustStep`; no máximo 40 partículas, respeitando `prefers-reduced-motion` |
| Capturas `fullPage` mostravam a barra fixa flutuando no meio da imagem | Captura além da viewport com elemento `position:sticky` (artefato conhecido do Chromium) | Estilo de captura no teste visual torna a barra estática apenas durante os screenshots (`test/visual.cjs`); o jogo real mantém a barra fixa no topo |
| Segunda página do teste visual não mostrava o formulário de entrada | Três páginas no mesmo contexto compartilhavam `localStorage`/token e reentavam sozinhas na sessão já ativa | Um contexto de navegador por jogador no teste (como aparelhos reais) |
| Execução com falha do teste visual nunca terminava | O servidor HTTP daquele cenário não era fechado quando o fluxo lançava erro, mantendo o event loop vivo | `try/finally` por cenário fechando o servidor; `process.exit(1)` na falha |
| `libnspr4.so` ausente: o Chromium do `@sparticuz/chromium` não iniciava neste ambiente (Debian, fora da Amazon Linux) | O pacote só extrai as bibliotecas `al2023` em ambientes AL2023 | `test/launch.cjs` extrai `al2023.tar.br` manualmente e exporta `LD_LIBRARY_PATH`/`FONTCONFIG_PATH` na hora de lançar; se o Chromium oficial do Playwright existir, ele é usado |

Nenhum bug de regra (seção 0) foi encontrado: a suíte de 18 cenários passou na íntegra, sem correções no `server.js`.

### Decisões novas desta entrega

1. **Texto de leitura principal com no mínimo 14 px** (dicas, rótulos de formulário, nomes na lista e na mesa, botões, banner, eventos, contador de tarefas). Rótulos micro decorativos (eyebrow, etiqueta da cena, rodapé, estado "desconectado") ficam entre 11–12 px por causa do espaço — decisão listada aqui conforme a seção 13 do prompt.
2. **Botão MATAR/ATIRAR fixo no canto inferior direito** durante a partida (seção 6), com contador de recarga; alvo ainda selecionado primeiro na mesa.
3. **Botão do xerife usa o mesmo rótulo ATIRAR e a mesma recarga configurada** do impostor; o servidor usa um único campo `readyAt` para os dois.
4. **Capturas T17** gravadas em `test/shots/` (8 arquivos) com verificações automáticas: itens do cenário ≥ 8 e dentro da cena, lugares sem sobreposição, itens não cobrem personagens, sem overflow horizontal, texto principal ≥ 14 px, ponteiros do relógio ligados ao tempo e console limpo.
5. **`@sparticuz/chromium` como devDependency** apenas para os testes de navegador em ambientes sem acesso ao CDN do Playwright; não afeta `npm install --omit=dev` no Render nem o jogo.
6. **Arquivos antigos de testes `game.test.js` e `browser.cjs` na raiz foram removidos**: pertenciam ao servidor `ws` antigo, estavam com caminho quebrado (`../server`) e codificavam regras que contradizem a v3. Os testes vigentes ficam em `test/`. As capturas antigas da raiz `desktop.png`/`mobile.png` foram atualizadas com a mesa atual.
7. **Xerife atira em outro xerife: só o atirador morre** — mantida a confirmação do usuário (prevalece sobre a linha contraditória da seção 5 do prompt).

### Cobertura dos testes obrigatórios (seção 11) nesta entrega

- T1–T7, T10, T11, T12, T13, T15: `npm test` (18 cenários, 3+ clientes `socket.io-client`) — 18 passaram, 0 falharam.
- T5 (xerife nunca morre por timer, desconexão ou impostor) e T9 (expiração vira "saiu"; xerife continua vivo): cenários dedicados na mesma suíte.
- T8 (queda 10 s e reconexão com mesmo token): queda real de 10 s na suíte.
- T14 (banner de latência > 800 ms com texto exato e some ao normalizar): `npm run test:browser` (T9 do relatório).
- T16 (Atualizar restaura sem `location.reload`): `npm run test:browser` (T11 do relatório, com contador de navegações = 0).
- T17 (capturas e verificações visuais): `npm run test:visual` — passou em 390×844 e 1280×800.

Resultados completos: `test/rules-result.txt`, `test/browser-result.txt`, `test/visual-result.txt`.
