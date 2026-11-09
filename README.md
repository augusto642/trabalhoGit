# GitSim — Simulador Educacional de Git, GitHub e VS Code

Simulador educacional 100% no navegador para ensinar o fluxo básico de Git e GitHub a alunos iniciantes, sem instalar Git, sem conta no GitHub e sem tocar em um repositório real.

Stack: Next.js 16, React 19, Tailwind CSS 4 (cerca de 4.500 linhas em `src/`).

## O que é

O aluno pratica o ciclo completo de uma tarefa de Git dentro de interfaces que imitam o GitHub e o VS Code:

- **Página inicial (`/`)** — seletor de modo de atividade e roteiro passo a passo, com o progresso do aluno marcado passo a passo. Em nenhum modo o comando exato aparece sem uma ação de revelar: nos modos guiados, cada passo tem micro-explicação + botão “Revelar comando”; no modo “Sem receita”, não há comando pronto em lugar nenhum.
- **GitHub simulado (`/github`)** — repositório da turma, botão `<> Code` para copiar a URL de clone e histórico de commits.
- **VS Code simulado (`/vscode`)** — editor de arquivos com terminal integrado que entende comandos como `git clone`, `cd`, `ls`, `cat`, `git status`, `git diff`, `git branch`, `git add`, `git commit`, `git log`, `git push` e `help` (com encadeamento via `&&`).
- **Painel do professor (`/professor`)** — acompanhamento da turma em tempo real (ver abaixo).

APIs internas: `api/git/push`, `api/logs`, `api/repository`, `api/reset`, `api/students`.

## Para quem

- **Alunos iniciantes do curso técnico** que estão tendo o primeiro contato com Git, GitHub e terminal.
- **O professor**, que acompanha quem clonou, editou, commitou e deu push, vê os comandos executados por cada aluno (incluindo os que deram erro) e exporta o relatório da turma.

## A atividade: lista de presença

Existe uma única atividade, fixa, para toda a turma:

- **Repositório:** `chamada-turma-a` (dono `prof-augusto`, branch padrão `main`)
- **URL de clone (simulada):** `https://gitsim.edu/prof-augusto/chamada-turma-a.git`
- **Arquivo da tarefa:** `chamada.txt` — a lista de presença da turma

### Modos de atividade (escolha na página inicial)

1. **Aula 1 guiada** — 4 passos (copiar o link e clonar; entrar na pasta, assinar a chamada e salvar com Ctrl+S ou no botão Salvar; preparar e commit; push), cada um com uma micro-explicação de conceito antes do passo e o comando exato só sob “Revelar comando”.
2. **Atividade 2 “Sem receita”** — o mesmo fluxo, sem comandos prontos em lugar nenhum: as dicas do terminal dão primeiro uma pista e só revelam o comando se o aluno pedir. Concluir o push nesse modo alimenta a nota sem receita (até 10 pontos). As dicas legadas do motor, que podem conter o comando exato, são suprimidas nesse modo.
3. **Aula 2 “Branch e conflito”** — fluxo guiado: criar branch e trocar para ela, trabalhar nela, trazer novidades com pull e, se houver divergência na mesma linha, resolver o conflito editando os marcadores (`<<<<<<< HEAD` / `=======` / `>>>>>>>`), salvar, preparar, commit e push. O passo final é o “Git de verdade”: registrar nome e e-mail simulados e fazer o push, que pede uma credencial **simulada** — o valor digitado é descartado e nunca é enviado, salvo ou verificado de verdade, e nunca se deve digitar uma senha real ali.

Glossário: o botão “Glossário do Git” (home e VS Code) explica em português claro os termos usados no app, incluindo “staging”, “working tree clean”, “snapshot local” (commit) e “mensagem semântica” (mensagem clara do commit).

### A nota (0–100): concluir não é 100

Concluir os 4 passos vale **70** (clone 10, edição 20, commit 20, push 20). Os outros 30 medem aprendizado:

- **Domínio de conceito — até 10:** cada conceito distinto demonstrado por um comando bem-sucedido vale 5 (teto 10). Os conceitos são `clone-url` e `repo` (clone), `repo` (cd), `staging` e `add-path` (add), `staging` e `commit-message` (commit). **Vale de primeira OU após erro:** errar-e-recuperar é uma evidência de domínio; acertar de primeira é evidência equivalente — o que conta é o acerto demonstrar o conceito, não o erro anterior.
- **Diagnóstico — até 10:** cada comando de diagnóstico distinto usado antes de agir vale 5 (teto 10): `git status`, `git diff` e `git log`.
- **Sem ajuda — até 10:** concluir o push na Atividade 2 “Sem receita” sem revelar nenhuma dica do terminal (0 dicas → 10; 1 dica → 5; 2 ou mais → 0). Este componente mede **autonomia**, dimensão distinta do domínio: 100% = domínio + autonomia.

**Quem só completa os 4 passos tira 70, não 100** — o modal de conclusão mostra a nota real e só celebra “nota máxima” com 100 de fato.

Salvar de verdade: não há autosave. O texto digitado só entra no Git quando o aluno salva (Ctrl+S ou botão Salvar); o editor e a barra de status mostram “Salvo” × “Não salvo” o tempo todo. Texto não salvo não aparece no `git status` nem no `diff` — como no Git de verdade.

Ao concluir o push, o progresso fica marcado como concluído na página inicial. O aluno se identifica por nome e turma antes de começar; cada passo concluído atualiza os indicadores `hasCloned`, `hasEdited`, `hasCommitted` e `hasPushed`.

## Como rodar localmente

Pré-requisito: Node.js 20+ e npm.

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) no navegador. Sem nenhuma variável de ambiente configurada, a aplicação funciona no **modo local/offline** (veja "Persistência" abaixo) — nenhum backend é obrigatório para rodar a aula.

### Scripts disponíveis

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento (porta 3000) |
| `npm run build` | Build de produção |
| `npm run start` | Sobe o build de produção |
| `npm run lint` | Lint (ESLint) |
| `npm run type-check` | Verificação de tipos (`tsc --noEmit`) |
| `npm run test:e2e` | Testes de ponta a ponta (`scripts/test-e2e.mjs`, contra a aplicação em `http://127.0.0.1:3005`) |

## Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha apenas o backend que for usar. **Nunca commite valores reais** — no repositório ficam só os nomes das variáveis.

### Backend 1 (recomendado): Vercel KV / Upstash Redis

| Variável | Uso |
|---|---|
| `KV_REST_API_URL` | URL da API REST do KV (a Vercel preenche automaticamente ao criar o banco na aba Storage) |
| `KV_REST_API_TOKEN` | Token da API REST do KV |
| `UPSTASH_REDIS_REST_URL` | Alternativa, quando a integração direta da Upstash é usada |
| `UPSTASH_REDIS_REST_TOKEN` | Alternativa, quando a integração direta da Upstash é usada |

### Backend 2 (alternativa): Turso / libSQL

| Variável | Uso |
|---|---|
| `TURSO_DATABASE_URL` | URL do banco Turso (ou `file:local.db` para SQLite local em desenvolvimento) |
| `TURSO_AUTH_TOKEN` | Token de autenticação do Turso (produção) |

### Proteção do reset (obrigatória em produção)

| Variável | Uso |
|---|---|
| `TEACHER_PASSWORD` | Senha do professor. Protege **somente o reset da turma** (`POST /api/reset`, destrutivo/administrativo): com a senha configurada, o reset exige o header `x-teacher-password`; sem header ou com valor diferente, retorna 401. **Em produção, sem essa variável configurada, o reset é recusado (fail-closed, 503)** — ou seja, a aplicação não apaga a turma sem a senha definida. Configure-a antes de publicar. |

As escritas do fluxo do aluno (`POST /api/students`, `/api/repository`, `/api/logs` e `/api/git/push`) **não** exigem a senha do professor, por desenho: são a própria aula, e a UI do aluno não envia (nem deve enviar) essa senha. A proteção delas é a validação de schema do corpo da requisição.

### Persistência

Ordem de preferência do backend, decidida automaticamente pelas variáveis presentes:

1. **Vercel KV / Upstash Redis** (se `KV_REST_API_*` ou `UPSTASH_REDIS_REST_*` estiverem definidos);
2. **Turso / libSQL** (se `TURSO_DATABASE_URL` estiver definido);
3. **Modo local/offline** (nenhum backend configurado): os dados ficam na memória do servidor e no `localStorage` do navegador. Serve para rodar a aula em uma máquina ou rede local, mas os dados não são compartilhados entre dispositivos nem sobrevivem a reinícios do servidor da mesma forma que um banco dedicado.

## Como o professor usa

Em `/professor`, o painel mostra:

- **Métricas da turma:** total de alunos, quantos clonaram, editaram, commitaram e deram push, e a nota média.
- **Tabela de alunos:** nome, turma, nota (0–100), indicadores de cada passo, total de comandos e comandos com erro, última atividade — com busca por nome/turma e filtro por turma.
- **Logs por aluno:** botão "Ver Logs" abre o histórico de comandos executados no terminal daquele aluno, com horário, saída e marcação de erros — útil para identificar onde cada aluno travou.
- **Alerta “só copiou”:** cálculo derivado dos logs já carregados (sem nova rota, sem mudar a nota): sinaliza o aluno quando pelo menos 2 dos 3 indícios aparecem — ritmo curtíssimo entre comandos git, cadeia completa com `&&` sem nenhum `git status`/`diff`/`log`, e zero erros. O painel mostra os motivos com números e o aviso de que é indício, não prova — o professor deve conversar com o aluno antes de concluir qualquer coisa.
- **Exportar CSV:** botão "Exportar CSV" baixa `relatorio_gitedu_AAAA-MM-DD.csv` com as colunas `Nome,Turma,Nota,Clonou,Editou,Commitou,DeuPush,TotalComandos,ComandosComErro,UltimaAtividade,ConceitosDominados,DiagnosticoUsado,NotaSemAjuda`.
- **Resetar turma:** botão "Resetar Turma" (com confirmação) restaura todos os dados para o estado inicial, para reutilizar a atividade com outra turma. O reset é a única ação que exige a `TEACHER_PASSWORD` (em produção, sem ela configurada, o reset é recusado com 503).

### Modo offline / local

Sem backend configurado, professor e alunos usam a mesma aplicação no modo local: basta rodar `npm run dev` (ou `npm run build` + `npm run start`) e acessar o painel em `/professor` no mesmo navegador/rede. Os dados ficam restritos a esse ambiente — não há sincronização com outras máquinas.

## Publicar

> **Deploy configurado, não publicado.** Publicar é decisão do dono do projeto, na conta dele. Este repositório não publica nada sozinho e nenhum passo abaixo cria conta ou sobe a aplicação sem a ação dele.

### Passo a passo (Vercel)

1. **Importar o repositório** na Vercel (importar o projeto Git existente; não é preciso configurar build customizado — o padrão do Next.js se aplica).
2. **Criar o banco (opcional, mas recomendado para turmas reais):** na aba **Storage** do projeto, criar um banco **KV** (ou integrar o Upstash Redis pelo Marketplace). A Vercel preenche `KV_REST_API_URL` e `KV_REST_API_TOKEN` automaticamente no deploy. Alternativa: configurar `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN` de um banco Turso.
3. **Configurar a senha do professor:** em **Settings → Environment Variables**, definir `TEACHER_PASSWORD` antes do primeiro deploy em produção — sem ela, o reset da turma é recusado (fail-closed, 503). As escritas do fluxo do aluno não dependem dessa variável.
4. **Deploy:** concluir a importação e aguardar o build. Cada novo push para a branch configurada gera um novo deploy automaticamente.
5. **Conferir:** abrir a URL do deploy, completar os 4 passos como aluno-teste e verificar o registro no painel `/professor` antes de usar com a turma.

Não há URL de deploy oficial documentada aqui: a URL é a gerada pela conta de quem publicar.

## Limitações honestas

- **Atividade única e fixa:** só existe a lista de presença do repositório `chamada-turma-a`; não há criação de novos repositórios ou atividades.
- **Git simulado, não Git real:** os hashes de commit são simulados e não há interação com o GitHub de verdade. Existem branches, pull e conflitos simulados (Aula 2), mas com uma limitação honesta: **as branches compartilham o mesmo conteúdo de trabalho — trocar de branch NÃO restaura o conteúdo de outra branch** (não há snapshot por branch). O conflito nasce do pull com o remoto divergido, não da troca de branch.
- **`git merge` não implementado (trabalho futuro):** o simulador não tem comando de merge; a Aula 2 cobre branch, pull e resolução de conflito, mas a junção de branches via merge segue fora do escopo.
- **Transferência simulada:** o passo “Git de verdade” (identidade + push com credencial) é simulação: nada é enviado, salvo ou verificado de verdade.
- **Nota sem receita com limite de sessão:** a contagem de comandos de dica revelados vale para a sessão atual do VS Code; trocar de modo no meio da atividade não é detectado pelo registro do aluno — o professor deve definir o modo no início.
