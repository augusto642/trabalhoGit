// Testes unitários do gitEngine (node:test nativo, sem framework).
//
// COMO RODAR: `npm run test:unit` (scripts/test-unit.mjs compila
// src/lib/gitEngine.ts + src/lib/types.ts com o tsc do projeto para um
// diretório temporário fora do repo e roda este arquivo com
// GITENGINE_COMPILED apontando para o JS compilado). Rodar este arquivo
// direto sem essa variável falha com mensagem explicativa — o engine é
// TypeScript com import de "./types" e o Node 24 nem sempre resolve o
// type-stripping + alias do projeto sem a compilação.
//
// NOTAS DE COMPORTAMENTO OBSERVADO (não inventado):
// - A engine NÃO tem comando de edição: o editor (VSCodeView) atualiza
//   `files` e marca `modifiedFiles` fora da engine. Os testes simulam a
//   edição exatamente assim (copiar estado, trocar o conteúdo, adicionar
//   o nome limpo a `modifiedFiles`).
// - "Push sem commit" é AMBÍGUO no desenho: após o clone, sem commit
//   local novo, `git push` NÃO é erro — devolve "Everything up-to-date"
//   (isError false, sem pushedCommit). O teste cobre o comportamento real
//   e a rejeição de verdade (fatal fora do repositório) está no teste
//   "push fora do repositório". Se o produto quiser que push sem commit
//   seja erro, isso é mudança de semântica da engine, não deste teste.
// - `executeTerminalCommand` não muta o estado de entrada: cada comando
//   trabalha sobre cópias dos Sets/objetos (o `remoteRepo` é compartilhado
//   por referência, mas a engine nunca o altera — o push só devolve o
//   `pushedCommit` e quem persiste é o chamador).

import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const compiled = process.env.GITENGINE_COMPILED;
if (!compiled) {
  throw new Error(
    "GITENGINE_COMPILED não definido. Rode via `npm run test:unit` " +
      "(scripts/test-unit.mjs compila o engine e define essa variável).",
  );
}

const {
  createInitialGitState,
  executeTerminalCommand,
  hasNewLineWithFullName,
  computeScore,
  computeScoreBreakdown,
  mergeLinesByUnion,
  mergeChamadaWithVariantConflicts,
  conceptForFailedCommand,
  conceptsResolvedByCommand,
  diagnosticCommandOf,
} = await import(pathToFileURL(compiled).href);

// storage compilado junto (mesmo diretório temporário) — testa o merge
// do push de verdade, não uma cópia da função.
const storagePath = join(dirname(fileURLToPath(pathToFileURL(compiled).href)), "storage.js");
const { pushCommitToRepo, getStoredRepository, saveRepository, removeStudentContributions, applyPushDeletions, lineBelongsToStudent } = await import(
  pathToFileURL(storagePath).href
);

// initialData compilado junto — testa o README do repo simulado.
const initialDataPath = join(dirname(fileURLToPath(pathToFileURL(compiled).href)), "initialData.js");
const { INITIAL_REPOSITORIES } = await import(pathToFileURL(initialDataPath).href);
const INITIAL_REPOSITORY = INITIAL_REPOSITORIES["201"];

const REPO_FOLDER = "chamada-turma-a";
const CLONE_URL = "https://github.com/escola/chamada-turma-a.git";
const INITIAL_CHAMADA =
  "# Chamada Turma A\n- [Docente] Prof. Augusto - Orientador\n";

function makeStudent() {
  return {
    id: "student-unit-1",
    name: "Ana Teste",
    turma: "Turma-A",
    hasCloned: false,
    hasEdited: false,
    hasCommitted: false,
    hasPushed: false,
    score: 0,
    totalCommands: 0,
    errorCommands: 0,
    createdAt: "2026-10-24T00:00:00.000Z",
    lastActive: "2026-10-24T00:00:00.000Z",
  };
}

function makeRemote() {
  return {
    id: "repo-unit-1",
    name: REPO_FOLDER,
    owner: "escola",
    description: "Repositório da turma",
    defaultBranch: "main",
    cloneUrl: CLONE_URL,
    files: { "chamada.txt": INITIAL_CHAMADA },
    commits: [
      {
        id: "commit-inicial",
        hash: "abc1234",
        author: "Prof. Augusto",
        authorTurma: "Docente",
        message: "chamada inicial",
        timestamp: "2026-10-24T00:00:00.000Z",
        filesChanged: ["chamada.txt"],
      },
    ],
    updatedAt: "2026-10-24T00:00:00.000Z",
  };
}

function freshState() {
  return createInitialGitState(makeStudent(), makeRemote());
}

/** clone + cd, o prefixo comum do fluxo do aluno. */
function clonedInsideRepo() {
  let state = freshState();
  state = executeTerminalCommand(`git clone ${CLONE_URL}`, state).newState;
  state = executeTerminalCommand(`cd ${REPO_FOLDER}`, state).newState;
  return state;
}

/** Simula o editor: troca o conteúdo e marca o arquivo como modificado. */
function simulateEdit(state, file = "chamada.txt") {
  const fullPath = `${REPO_FOLDER}/${file}`;
  return {
    ...state,
    files: {
      ...state.files,
      [fullPath]: `${state.files[fullPath]}- [Aluno] Ana Teste - Turma-A (Presente)\n`,
    },
    modifiedFiles: new Set([...state.modifiedFiles, file]),
  };
}

function run(state, command) {
  return executeTerminalCommand(command, state);
}

test("estado inicial: não clonado, diretório ~, sem arquivos nem commits locais", () => {
  const state = freshState();
  assert.equal(state.isRepoCloned, false);
  assert.equal(state.currentDir, "~");
  assert.equal(state.repoFolder, REPO_FOLDER);
  assert.equal(state.head, "main");
  assert.deepEqual(state.files, {});
  assert.equal(state.stagedFiles.size, 0);
  assert.equal(state.untrackedFiles.size, 0);
  assert.equal(state.modifiedFiles.size, 0);
  assert.deepEqual(state.localCommits, []);
});

test("clone inicializa o estado: arquivos do remoto, commits do remoto, passo clone", () => {
  const result = run(freshState(), `git clone ${CLONE_URL}`);
  assert.equal(result.isError, false);
  assert.match(result.output, /Cloning into 'chamada-turma-a'/);
  assert.equal(result.stepCompleted, "clone");
  assert.equal(result.newState.isRepoCloned, true);
  assert.equal(result.newState.files[`${REPO_FOLDER}/chamada.txt`], INITIAL_CHAMADA);
  assert.equal(result.newState.localCommits.length, 1);
  assert.equal(result.newState.localCommits[0].hash, "abc1234");
});

test("clone com URL errada devolve erro com dica em português e não clona", () => {
  const result = run(freshState(), "git clone https://github.com/escola/outro-repo.git");
  assert.equal(result.isError, true);
  assert.match(result.output, /does not exist/);
  assert.match(result.tip ?? "", /Dica/);
  assert.equal(result.newState.isRepoCloned, false);
});

test("cd para o repositório antes do clone devolve erro com dica em português", () => {
  const result = run(freshState(), `cd ${REPO_FOLDER}`);
  assert.equal(result.isError, true);
  assert.match(result.tip ?? "", /clone/);
  assert.equal(result.newState.currentDir, "~");
});

test("fluxo add/commit/push avança os passos e o push devolve o commit", () => {
  let state = clonedInsideRepo();
  state = simulateEdit(state);

  const added = run(state, "git add chamada.txt");
  assert.equal(added.isError, false);
  assert.equal(added.newState.stagedFiles.has("chamada.txt"), true);
  assert.equal(added.newState.modifiedFiles.size, 0);

  const committed = run(added.newState, 'git commit -m "Presente: Ana Teste"');
  assert.equal(committed.isError, false);
  assert.equal(committed.stepCompleted, "commit");
  assert.equal(committed.newState.localCommits.length, 2);
  assert.equal(committed.newState.localCommits[0].message, "Presente: Ana Teste");
  assert.equal(committed.newState.stagedFiles.size, 0);

  const pushed = run(committed.newState, "git push origin main");
  assert.equal(pushed.isError, false);
  assert.equal(pushed.stepCompleted, "push");
  assert.equal(pushed.pushedCommit?.message, "Presente: Ana Teste");
  assert.match(pushed.output, /main -> main/);
});

test("R1: push de outro arquivo (README) não conta para a conclusão, mas o envio acontece", () => {
  let state = clonedInsideRepo();
  state = simulateEdit(state, "README.md");
  state = run(state, "git add README.md").newState;
  state = run(state, 'git commit -m "Docs: README"').newState;
  const pushed = run(state, "git push origin main");
  assert.equal(pushed.isError, false);
  assert.equal(pushed.pushedCommit?.message, "Docs: README");
  assert.equal(pushed.stepCompleted, undefined);
  assert.match(pushed.output, /não conta como conclusão/);
  assert.match(pushed.output, /main -> main/);
});

test("R1: push com chamada.txt sem o nome do aluno não conta para a conclusão", () => {
  let state = clonedInsideRepo();
  const fullPath = `${REPO_FOLDER}/chamada.txt`;
  state = {
    ...state,
    files: {
      ...state.files,
      [fullPath]: "# Chamada Turma A - EDITADA\n- [Docente] Prof. Augusto - Orientador\n",
    },
    modifiedFiles: new Set([...state.modifiedFiles, "chamada.txt"]),
  };
  state = run(state, "git add chamada.txt").newState;
  state = run(state, 'git commit -m "Edita título"').newState;
  const pushed = run(state, "git push origin main");
  assert.equal(pushed.isError, false);
  assert.equal(pushed.pushedCommit?.message, "Edita título");
  assert.equal(pushed.stepCompleted, undefined);
  assert.match(pushed.output, /não conta como conclusão/);
});

test("R1: credencial consumida sem nome na lista marca a transferência, não a conclusão", () => {
  let state = clonedInsideRepo();
  state = simulateEdit(state, "README.md");
  state = run(state, "git add README.md").newState;
  state = run(state, 'git commit -m "Docs: README"').newState;
  state = { ...state, transferMode: true };
  const prompted = run(state, "git push origin main");
  assert.equal(prompted.newState.awaitingSimulatedCredential, true);
  const pushed = run(prompted.newState, "valor-simulado-qualquer");
  assert.equal(pushed.consumedSimulatedCredential, true);
  assert.equal(pushed.newState.transferCredentialConsumed, true);
  assert.equal(pushed.pushedCommit?.message, "Docs: README");
  assert.equal(pushed.stepCompleted, undefined);
  assert.match(pushed.output, /não conta como conclusão/);
});

test("R1: lesson2 — aluno que já assinou (nome no clone) conclui o push da resolução", () => {
  // Sequência de sala: Aula 1 antes da Aula 2. O clone da Aula 2 já
  // traz o nome na lista; o gate olha só commit + conteúdo do arquivo,
  // então a resolução (chamada.txt no commit + nome na lista) conclui.
  let state = clonedInsideRepo();
  const fullPath = `${REPO_FOLDER}/chamada.txt`;
  state = {
    ...state,
    files: {
      ...state.files,
      [fullPath]: `${state.files[fullPath]}- [Aluno] Ana Teste - Turma-A (Presente)\n`,
    },
    modifiedFiles: new Set([...state.modifiedFiles, "chamada.txt"]),
  };
  state = run(state, "git add chamada.txt").newState;
  state = run(state, 'git commit -m "Resolve conflito"').newState;
  const pushed = run(state, "git push origin main");
  assert.equal(pushed.isError, false);
  assert.equal(pushed.stepCompleted, "push");
  assert.equal(pushed.pushedCommit?.message, "Resolve conflito");
});

test("push sem commit novo: comportamento observado é no-op up-to-date, não erro", () => {
  const state = clonedInsideRepo();
  const result = run(state, "git push origin main");
  assert.equal(result.output, "Everything up-to-date");
  assert.equal(result.isError, false);
  assert.equal(result.pushedCommit, undefined);
  assert.equal(result.stepCompleted, undefined);
});

test("push fora do repositório é rejeitado com fatal e dica em português", () => {
  let state = freshState();
  state = run(state, `git clone ${CLONE_URL}`).newState;
  // Sem cd: ainda em ~, fora do repositório.
  const result = run(state, "git push origin main");
  assert.equal(result.isError, true);
  assert.match(result.output, /not a git repository/);
  assert.match(result.tip ?? "", /Dica/);
  assert.equal(result.pushedCommit, undefined);
});

test("commit sem nada staged devolve erro com dica e não quebra o fluxo seguinte", () => {
  let state = clonedInsideRepo();
  state = simulateEdit(state);

  const failed = run(state, 'git commit -m "Presente: Ana Teste"');
  assert.equal(failed.isError, true);
  assert.match(failed.tip ?? "", /git add/);
  assert.equal(failed.newState.localCommits.length, 1); // só o commit inicial

  // Recuperação: add + commit funcionam no mesmo estado.
  const added = run(failed.newState, "git add chamada.txt");
  const committed = run(added.newState, 'git commit -m "Presente: Ana Teste"');
  assert.equal(committed.isError, false);
  assert.equal(committed.stepCompleted, "commit");
});

test("comando git inválido devolve erro com dica em português e não quebra o estado", () => {
  const state = clonedInsideRepo();
  const result = run(state, "git frobnicate");
  assert.equal(result.isError, true);
  assert.match(result.tip ?? "", /Dica/);
  assert.match(result.output, /não é um comando git suportado/);

  const after = run(result.newState, "git status");
  assert.equal(after.isError, false);
  assert.match(after.output, /On branch main/);
});

test("comando shell desconhecido devolve erro com dica apontando para o help", () => {
  const result = run(freshState(), "xyzcomando");
  assert.equal(result.isError, true);
  assert.match(result.output, /comando não encontrado/);
  assert.match(result.tip ?? "", /help/);
});

test("comandos encadeados com && executam em sequência até o commit", () => {
  let state = clonedInsideRepo();
  state = simulateEdit(state);
  const result = run(state, 'git add chamada.txt && git commit -m "Presente: Ana Teste"');
  assert.equal(result.isError, false);
  assert.equal(result.stepCompleted, "commit");
  assert.equal(result.newState.localCommits.length, 2);
});

test("cadeia com && para no primeiro erro e não executa o restante", () => {
  let state = clonedInsideRepo();
  state = simulateEdit(state);
  // Commit falha (nada staged); o push da cadeia não pode executar.
  const result = run(state, 'git commit -m "Presente: Ana Teste" && git push origin main');
  assert.equal(result.isError, true);
  assert.equal(result.stepCompleted, undefined);
  assert.equal(result.pushedCommit, undefined);
  assert.match(result.tip ?? "", /falhou/);
});

test("estado não vaza entre repositórios: clonar/editar em A não afeta B", () => {
  const remote = makeRemote();
  let stateA = createInitialGitState(makeStudent(), remote);
  stateA = run(stateA, `git clone ${CLONE_URL}`).newState;
  stateA = simulateEdit({ ...stateA, currentDir: `~/${REPO_FOLDER}` });
  stateA = run(stateA, "git add chamada.txt").newState;

  const stateB = createInitialGitState(makeStudent(), remote);
  assert.equal(stateB.isRepoCloned, false);
  assert.deepEqual(stateB.files, {});
  assert.equal(stateB.stagedFiles.size, 0);
  assert.equal(stateB.modifiedFiles.size, 0);
  assert.deepEqual(stateB.localCommits, []);
  // A manteve o próprio estado.
  assert.equal(stateA.isRepoCloned, true);
  assert.equal(stateA.stagedFiles.has("chamada.txt"), true);
});

test("executar um comando não muta o estado de entrada", () => {
  const before = freshState();
  const result = run(before, `git clone ${CLONE_URL}`);
  assert.equal(result.newState.isRepoCloned, true);
  assert.equal(before.isRepoCloned, false);
  assert.deepEqual(before.files, {});
});

test("segundo clone devolve erro already exists com dica em português", () => {
  let state = freshState();
  state = run(state, `git clone ${CLONE_URL}`).newState;
  const result = run(state, `git clone ${CLONE_URL}`);
  assert.equal(result.isError, true);
  assert.match(result.output, /already exists/);
  assert.match(result.tip ?? "", /já foi clonado/);
});

// ---------------------------------------------------------------------------
// Frente MOTOR + NOTA (2026-10-24)
// ---------------------------------------------------------------------------

test("diff real: mostra linhas + e - do texto digitado, não linha fixa", () => {
  let state = clonedInsideRepo();
  state = {
    ...state,
    files: {
      ...state.files,
      [`${REPO_FOLDER}/chamada.txt`]:
        "# Chamada Turma A\n- [Docente] Prof. Augusto - Orientador\n- [Aluno] Ana Teste - Turma-A (Presente)\n",
    },
    modifiedFiles: new Set(["chamada.txt"]),
  };
  const result = run(state, "git diff");
  assert.equal(result.isError, false);
  assert.match(result.output, /\+- \[Aluno\] Ana Teste/);
  assert.doesNotMatch(result.output, /\+ - \[Aluno\]/);
  assert.match(result.output, /diff --git a\/chamada\.txt/);
});

test("diff real: linha removida aparece com - e arquivo staged não aparece no diff simples", () => {
  let state = clonedInsideRepo();
  state = {
    ...state,
    files: {
      ...state.files,
      [`${REPO_FOLDER}/chamada.txt`]: "# Chamada Turma A\n",
    },
    modifiedFiles: new Set(["chamada.txt"]),
  };
  const removed = run(state, "git diff");
  assert.match(removed.output, /-\s*- \[Docente\] Prof\. Augusto/);

  const staged = run(removed.newState, "git add chamada.txt");
  const afterStaged = run(staged.newState, "git diff");
  assert.equal(afterStaged.output, "");
  const cached = run(staged.newState, "git diff --cached");
  assert.match(cached.output, /-\s*- \[Docente\] Prof\. Augusto/);
});

test("clone: URL com o nome do repo em outro host falha (bug antigo)", () => {
  const result = run(freshState(), "git clone https://github.com/outro/chamada-turma-a.git");
  assert.equal(result.isError, true);
  assert.match(result.output, /does not exist/);
  assert.equal(result.newState.isRepoCloned, false);
});

test("clone: URL exata funciona e a dica em 2 níveis traz pista + comando", () => {
  const ok = run(freshState(), `git clone ${CLONE_URL}`);
  assert.equal(ok.isError, false);
  assert.equal(ok.stepCompleted, "clone");

  const wrong = run(freshState(), "git clone https://github.com/escola/outro-repo.git");
  assert.equal(wrong.tipDetail?.pista, "Copie a URL oficial no botão verde '<> Code' da aba GitHub e clone o repositório da turma.");
  assert.equal(wrong.tipDetail?.comando, `git clone ${CLONE_URL}`);
  assert.doesNotMatch(wrong.tipDetail?.pista ?? "", /git clone/);
});

test("merge por linhas no push: segundo push não apaga o nome do primeiro", () => {
  // Guarda a central para restaurá-la ao fim (o storage em memória é
  // compartilhado entre os testes deste arquivo).
  const centralBefore = getStoredRepository("201");
  const baseChamada = centralBefore.files["chamada.txt"] ?? INITIAL_CHAMADA;

  const commitA = {
    id: "commit-merge-a", hash: "aaaaaaa", author: "Ana Teste", authorTurma: "201",
    message: "Presente: Ana Teste", timestamp: "2026-10-24T00:00:00.000Z", filesChanged: ["chamada.txt"],
  };
  const afterA = pushCommitToRepo(commitA, {
    "chamada.txt": `${baseChamada}- [Aluno] Ana Teste - 201 (Presente)\n`,
  }, "201");
  assert.match(afterA.files["chamada.txt"], /Ana Teste/);

  // Colega B: arquivo SEM a linha da Ana, mas com a linha dele.
  const commitB = {
    id: "commit-merge-b", hash: "bbbbbbb", author: "Bruno Teste", authorTurma: "201",
    message: "Presente: Bruno Teste", timestamp: "2026-10-24T00:00:01.000Z", filesChanged: ["chamada.txt"],
  };
  const afterB = pushCommitToRepo(commitB, {
    "chamada.txt": `${baseChamada}- [Aluno] Bruno Teste - 201 (Presente)\n`,
  }, "201");
  assert.match(afterB.files["chamada.txt"], /Ana Teste/);
  assert.match(afterB.files["chamada.txt"], /Bruno Teste/);
  // Sem duplicar a linha do docente.
  assert.equal((afterB.files["chamada.txt"].match(/Prof\. Augusto/g) ?? []).length, 1);
  // Demais arquivos seguem overwrite: README do push não é mergeado.
  const afterC = pushCommitToRepo(
    { ...commitB, id: "commit-merge-c", hash: "ccccccc" },
    { "README.md": "# Novo README\n" },
    "201",
  );
  assert.equal(afterC.files["README.md"], "# Novo README\n");
  // Devolve a central ao estado anterior para não vazar entre testes.
  saveRepository(centralBefore);
});

test("push: mesmo commit duas vezes não duplica o histórico (dedup por id, D2)", () => {
  // Guarda a central para restaurá-la ao fim (storage em memória
  // compartilhado entre os testes deste arquivo).
  const centralBefore = getStoredRepository("201");
  const baseChamada = centralBefore.files["chamada.txt"] ?? INITIAL_CHAMADA;
  const commit = {
    id: "commit-dedup", hash: "ddddddd", author: "Ana Teste", authorTurma: "201",
    message: "Presente: Ana Teste", timestamp: "2026-10-24T00:00:00.000Z", filesChanged: ["chamada.txt"],
  };
  const files = { "chamada.txt": `${baseChamada}- [Aluno] Ana Teste - 201 (Presente)\n` };
  const afterFirst = pushCommitToRepo(commit, files, "201");
  assert.equal(afterFirst.commits.filter((c) => c.id === "commit-dedup").length, 1);
  // O handler do VSCodeView escreve duas vezes (local + /api/git/push):
  // o re-push do mesmo id NÃO pode duplicar, em nenhuma ordem.
  const afterSecond = pushCommitToRepo(commit, files, "201");
  assert.equal(afterSecond.commits.filter((c) => c.id === "commit-dedup").length, 1);
  assert.equal(afterSecond.commits[0].id, "commit-dedup");
  saveRepository(centralBefore);
});

test("mergeLinesByUnion: união preserva ordem e não duplica linhas iguais", () => {
  assert.equal(
    mergeLinesByUnion("a\nb\n", "b\nc\n"),
    "a\nb\nc\n",
  );
});

test("detecção de edição: linha nova com nome completo conta; substring não", () => {
  const original = INITIAL_CHAMADA;
  // "Augusto" já está no original (docente) — não é linha nova válida.
  assert.equal(hasNewLineWithFullName(original, `${original}- [Aluno] Augusto - Turma-A\n`, "Augusto Silva"), false);
  // Primeiro nome como substring de outra palavra não conta.
  assert.equal(hasNewLineWithFullName(original, `${original}- Mariana Silva\n`, "Ana Teste"), false);
  // Linha nova com o nome completo conta (case-insensitive).
  assert.equal(
    hasNewLineWithFullName(original, `${original}- [aluno] ana teste - turma-a (presente)\n`, "Ana Teste"),
    true,
  );
  // Nome completo em linha que já existia no original não conta.
  assert.equal(hasNewLineWithFullName(`${original}- [Aluno] Ana Teste\n`, `${original}- [Aluno] Ana Teste\n`, "Ana Teste"), false);
});

test("nota: conclusão soma com domínio de conceito, diagnóstico e sem-ajuda (0–100)", () => {
  // Só conclusão: 10 + 20 + 20 + 20 = 70, não 100.
  assert.equal(
    computeScore({ hasCloned: true, hasEdited: true, hasCommitted: true, hasPushed: true }),
    70,
  );
  const full = computeScoreBreakdown({
    hasCloned: true, hasEdited: true, hasCommitted: true, hasPushed: true,
    masteredConcepts: ["staging", "clone-url", "staging"],
    diagnosticCommands: ["status", "diff", "log", "status"],
    unaidedScore: 10,
  });
  assert.equal(full.mastered, 10); // teto, apesar de 3 menções (2 distintos)
  assert.equal(full.diagnostic, 10); // teto, apesar de 3 distintos
  assert.equal(full.unaided, 10);
  assert.equal(full.total, 100);
  // Nada feito = 0; teto de 100 mesmo com unaidedScore acima do máximo.
  assert.equal(computeScore({ hasCloned: false, hasEdited: false, hasCommitted: false, hasPushed: false }), 0);
  assert.equal(
    computeScore({ hasCloned: true, hasEdited: true, hasCommitted: true, hasPushed: true, unaidedScore: 99 }),
    80,
  );
});

test("rastreio de nota: conceito de erro e comando que o resolve", () => {
  assert.equal(conceptForFailedCommand('no changes added to commit (use "git add")'), "staging");
  assert.equal(conceptForFailedCommand("fatal: not a git repository"), "repo");
  assert.equal(conceptForFailedCommand("fatal: repository 'x' does not exist"), "clone-url");
  assert.equal(conceptForFailedCommand("fatal: pathspec 'y' did not match any files"), "add-path");
  assert.deepEqual(conceptsResolvedByCommand("git add chamada.txt", false), ["staging", "add-path"]);
  assert.deepEqual(conceptsResolvedByCommand("git add chamada.txt", true), []);
  assert.equal(diagnosticCommandOf("git status"), "status");
  assert.equal(diagnosticCommandOf("git diff"), "diff");
  assert.equal(diagnosticCommandOf("git log"), "log");
  assert.equal(diagnosticCommandOf("git push origin main"), undefined);
});

test("branch: listar, criar, trocar (checkout e switch) e erro em branch inexistente", () => {
  let state = clonedInsideRepo();
  const listed = run(state, "git branch");
  assert.match(listed.output, /\* .*main/);

  const created = run(state, "git branch aula-2");
  assert.match(created.output, /Created branch 'aula-2'/);
  state = created.newState;

  const switched = run(state, "git checkout aula-2");
  assert.equal(switched.newState.head, "aula-2");
  assert.match(switched.output, /Switched to branch 'aula-2'/);

  const back = run(switched.newState, "git switch main");
  assert.equal(back.newState.head, "main");

  const createdSwitched = run(back.newState, "git checkout -b experimento");
  assert.equal(createdSwitched.newState.head, "experimento");
  assert.deepEqual(createdSwitched.newState.branches, ["main", "aula-2", "experimento"]);

  const missing = run(back.newState, "git checkout nao-existe");
  assert.equal(missing.isError, true);
  assert.match(missing.tip ?? "", /não existe/);

  const dup = run(back.newState, "git branch main");
  assert.equal(dup.isError, true);
  assert.match(dup.output, /already exists/);
});

test("pull: fast-forward traz conteúdo novo do remoto sem tocar no local igual", () => {
  let state = clonedInsideRepo();
  // Remoto avançou (colega pushou) — simula o remoteRepo atualizado.
  const advancedRemote = {
    ...state.remoteRepo,
    files: {
      ...state.remoteRepo.files,
      "chamada.txt": `${INITIAL_CHAMADA}- [Aluno] Colega - Turma-A (Presente)\n`,
    },
    commits: [
      {
        id: "commit-colega", hash: "d00d1e2", author: "Colega", authorTurma: "Turma-A",
        message: "Presente: Colega", timestamp: "2026-10-24T00:00:00.000Z", filesChanged: ["chamada.txt"],
      },
      ...state.remoteRepo.commits,
    ],
  };
  state = { ...state, remoteRepo: advancedRemote };
  const pulled = run(state, "git pull");
  assert.equal(pulled.isError, false);
  assert.match(pulled.newState.files[`${REPO_FOLDER}/chamada.txt`], /Colega/);
  assert.equal(pulled.newState.localCommits[0].id, "commit-colega");
});

test("pull: divergência na mesma linha gera conflito com marcadores; add resolve", () => {
  let state = clonedInsideRepo();
  // Local edita a linha 2 (índice 1) de forma diferente do remoto.
  const localContent = "# Chamada Turma A - EDITADA LOCAL\n- [Docente] Prof. Augusto - Orientador\n";
  const remoteContent = "# Chamada Turma A - EDITADA REMOTA\n- [Docente] Prof. Augusto - Orientador\n";
  state = {
    ...state,
    files: { ...state.files, [`${REPO_FOLDER}/chamada.txt`]: localContent },
    modifiedFiles: new Set(["chamada.txt"]),
    remoteRepo: { ...state.remoteRepo, files: { "chamada.txt": remoteContent } },
  };
  const pulled = run(state, "git pull");
  assert.equal(pulled.isError, true);
  assert.match(pulled.output, /CONFLICT/);
  const conflicted = pulled.newState.files[`${REPO_FOLDER}/chamada.txt`];
  assert.match(conflicted, /<<<<<<< HEAD/);
  assert.match(conflicted, /=======/);
  assert.match(conflicted, />>>>>>> origin\/main/);
  assert.match(conflicted, /EDITADA LOCAL/);
  assert.match(conflicted, /EDITADA REMOTA/);
  assert.equal(pulled.newState.conflictedFiles.has("chamada.txt"), true);
  assert.equal(pulled.tipDetail?.comando, "git add chamada.txt");

  // Commit bloqueado enquanto houver conflito.
  const blocked = run(pulled.newState, 'git commit -m "resolve"');
  assert.equal(blocked.isError, true);
  assert.match(blocked.output, /resolve your current index/);

  // Aluno resolve editando (simula o editor salvo) + add: conflito sai.
  const resolved = {
    ...pulled.newState,
    files: {
      ...pulled.newState.files,
      [`${REPO_FOLDER}/chamada.txt`]: "# Chamada Turma A - RESOLVIDA\n- [Docente] Prof. Augusto - Orientador\n",
    },
  };
  const added = run(resolved, "git add chamada.txt");
  assert.equal(added.isError, false);
  assert.equal(added.newState.conflictedFiles.size, 0);
  const committed = run(added.newState, 'git commit -m "Resolve conflito"');
  assert.equal(committed.isError, false);
  assert.equal(committed.stepCompleted, "commit");
});

test("pull: acréscimos em linhas diferentes mesclam sem conflito", () => {
  let state = clonedInsideRepo();
  const localContent = `${INITIAL_CHAMADA}- [Aluno] Ana Teste - Turma-A (Presente)\n`;
  const remoteContent = `${INITIAL_CHAMADA}- [Aluno] Colega - Turma-A (Presente)\n`;
  state = {
    ...state,
    files: { ...state.files, [`${REPO_FOLDER}/chamada.txt`]: localContent },
    modifiedFiles: new Set(["chamada.txt"]),
    remoteRepo: { ...state.remoteRepo, files: { "chamada.txt": remoteContent } },
  };
  const pulled = run(state, "git pull");
  assert.equal(pulled.isError, false);
  assert.doesNotMatch(pulled.newState.files[`${REPO_FOLDER}/chamada.txt`], /<<<<<<</);
  assert.match(pulled.newState.files[`${REPO_FOLDER}/chamada.txt`], /Ana Teste/);
  assert.match(pulled.newState.files[`${REPO_FOLDER}/chamada.txt`], /Colega/);
});

// D1 — cenário exato do laudo: o push da chamada.txt usa união, então a
// variante editada do cabeçalho é ANEXADA no remoto e a linha original
// permanece no índice; o pull precisa enxergar a variante como
// divergência na mesma linha, não como acréscimo.
const SEED_LONGO =
  "========================================\n       LISTA DE PRESENÇA - TURMA A\n========================================\n- [Docente] Prof. Augusto - Orientador\n";

test("pull: variante da chamada.txt no remoto + edição local da mesma linha gera conflito (Aula 2, D1)", () => {
  let state = clonedInsideRepo();
  const local = SEED_LONGO.replace(
    "LISTA DE PRESENÇA - TURMA A\n",
    "LISTA DE PRESENÇA - TURMA A (editada por B)\n",
  );
  const remote = `${SEED_LONGO}       LISTA DE PRESENÇA - TURMA A (editada por A)\n`;
  state = {
    ...state,
    baseFiles: { ...state.baseFiles, [`${REPO_FOLDER}/chamada.txt`]: SEED_LONGO },
    files: { ...state.files, [`${REPO_FOLDER}/chamada.txt`]: local },
    modifiedFiles: new Set(["chamada.txt"]),
    remoteRepo: { ...state.remoteRepo, files: { "chamada.txt": remote } },
  };
  const pulled = run(state, "git pull");
  assert.equal(pulled.isError, true);
  assert.match(pulled.output, /CONFLICT/);
  const conflicted = pulled.newState.files[`${REPO_FOLDER}/chamada.txt`];
  assert.match(conflicted, /<<<<<<< HEAD/);
  assert.match(conflicted, /editada por B/);
  assert.match(conflicted, /editada por A/);
  assert.equal(pulled.newState.conflictedFiles.has("chamada.txt"), true);
});

test("pull: acréscimo de colega + edição local do cabeçalho NÃO gera conflito (sem falso-positivo, D1)", () => {
  let state = clonedInsideRepo();
  const local = SEED_LONGO.replace(
    "LISTA DE PRESENÇA - TURMA A\n",
    "LISTA DE PRESENÇA - TURMA A (editada por B)\n",
  );
  const remote = `${SEED_LONGO}- [Aluno] Colega - Turma-A (Presente)\n`;
  state = {
    ...state,
    baseFiles: { ...state.baseFiles, [`${REPO_FOLDER}/chamada.txt`]: SEED_LONGO },
    files: { ...state.files, [`${REPO_FOLDER}/chamada.txt`]: local },
    modifiedFiles: new Set(["chamada.txt"]),
    remoteRepo: { ...state.remoteRepo, files: { "chamada.txt": remote } },
  };
  const pulled = run(state, "git pull");
  assert.equal(pulled.isError, false);
  const merged = pulled.newState.files[`${REPO_FOLDER}/chamada.txt`];
  assert.doesNotMatch(merged, /<<<<<<</);
  assert.match(merged, /editada por B/);
  assert.match(merged, /Colega/);
});

test("pull: variante idêntica à edição local NÃO gera conflito (mesma edição, D1)", () => {
  let state = clonedInsideRepo();
  const local = SEED_LONGO.replace(
    "LISTA DE PRESENÇA - TURMA A\n",
    "LISTA DE PRESENÇA - TURMA A (editada)\n",
  );
  const remote = `${SEED_LONGO}       LISTA DE PRESENÇA - TURMA A (editada)\n`;
  state = {
    ...state,
    baseFiles: { ...state.baseFiles, [`${REPO_FOLDER}/chamada.txt`]: SEED_LONGO },
    files: { ...state.files, [`${REPO_FOLDER}/chamada.txt`]: local },
    modifiedFiles: new Set(["chamada.txt"]),
    remoteRepo: { ...state.remoteRepo, files: { "chamada.txt": remote } },
  };
  const pulled = run(state, "git pull");
  assert.equal(pulled.isError, false);
  const merged = pulled.newState.files[`${REPO_FOLDER}/chamada.txt`];
  assert.doesNotMatch(merged, /<<<<<<</);
  assert.equal((merged.match(/editada\)/g) ?? []).length, 1);
});

test("mergeChamadaWithVariantConflicts direto: variante gera marcadores; acréscimo não", () => {
  const local = SEED_LONGO.replace(
    "LISTA DE PRESENÇA - TURMA A\n",
    "LISTA DE PRESENÇA - TURMA A (editada por B)\n",
  );
  const withVariant = mergeChamadaWithVariantConflicts(
    SEED_LONGO,
    local,
    `${SEED_LONGO}       LISTA DE PRESENÇA - TURMA A (editada por A)\n`,
    "main",
  );
  assert.equal(withVariant.hasConflict, true);
  assert.match(withVariant.merged, /<<<<<<< HEAD/);
  assert.match(withVariant.merged, /editada por B/);
  assert.match(withVariant.merged, /editada por A/);
  const withoutVariant = mergeChamadaWithVariantConflicts(
    SEED_LONGO,
    local,
    `${SEED_LONGO}- [Aluno] Colega - Turma-A (Presente)\n`,
    "main",
  );
  assert.equal(withoutVariant.hasConflict, false);
  assert.doesNotMatch(withoutVariant.merged, /<<<<<<</);
});

test("config: registra nome/e-mail simulados, consulta e lista; chave inválida falha", () => {
  let state = clonedInsideRepo();
  const setName = run(state, 'git config user.name "Ana Teste"');
  assert.equal(setName.isError, false);
  assert.equal(setName.newState.gitIdentity.name, "Ana Teste");
  assert.match(setName.tip ?? "", /só neste simulador/);

  const setEmail = run(setName.newState, 'git config user.email "ana@exemplo.com"');
  const listed = run(setEmail.newState, "git config --list");
  assert.match(listed.output, /user\.name=Ana Teste/);
  assert.match(listed.output, /user\.email=ana@exemplo\.com/);

  const queried = run(setEmail.newState, "git config user.name");
  assert.equal(queried.output, "Ana Teste");

  const bad = run(state, "git config core.editor vim");
  assert.equal(bad.isError, true);
  assert.match(bad.tip ?? "", /user\.name/);
});

test("credencial simulada: push em modo transferência pede valor, descarta e conclui", () => {
  let state = clonedInsideRepo();
  state = simulateEdit(state);
  state = run(state, "git add chamada.txt").newState;
  state = run(state, 'git commit -m "Presente: Ana Teste"').newState;
  state = { ...state, transferMode: true };

  const prompted = run(state, "git push origin main");
  assert.equal(prompted.isError, false);
  assert.equal(prompted.newState.awaitingSimulatedCredential, true);
  assert.equal(prompted.pushedCommit, undefined);
  assert.match(prompted.output, /SIMULAÇÃO/);
  assert.match(prompted.output, /NÃO digite sua senha real/);

  // A "credencial" digitada nunca aparece na saída nem vira commit estranho.
  const pushed = run(prompted.newState, "senha-super-secreta-simulada");
  assert.equal(pushed.isError, false);
  assert.equal(pushed.stepCompleted, "push");
  assert.equal(pushed.consumedSimulatedCredential, true);
  assert.doesNotMatch(pushed.output, /senha-super-secreta-simulada/);
  assert.match(pushed.output, /descartada/);
  assert.equal(pushed.newState.awaitingSimulatedCredential, false);
});

// ---------------------------------------------------------------------------
// Frente CORREÇÕES do Pedagógico (P1, P2, P4, P5, P6 — 2026-10-24)
// ---------------------------------------------------------------------------

test("P6: help lista os comandos sem entregar a cadeia completa com &&", () => {
  const result = run(freshState(), "help");
  assert.equal(result.isError, false);
  assert.doesNotMatch(result.output, /&&/);
  assert.doesNotMatch(result.output, /git add \. && git commit/);
  // Vocabulário mantido: nomes + descrição de uma linha.
  assert.match(result.output, /git clone <url>/);
  assert.match(result.output, /git add <arquivo>/);
  assert.match(result.output, /git commit -m "msg"/);
  assert.match(result.output, /git push origin main/);
});

test("P1: dicas legadas migradas para tipDetail, com tip legado intacto", () => {
  // Pista nunca contém o comando exato; comando só sob "Revelar comando".
  const assertMigrated = (result, expectedCommand) => {
    assert.ok(result.tipDetail, "tipDetail ausente");
    assert.doesNotMatch(result.tipDetail.pista, /git [a-z]/);
    assert.equal(result.tipDetail.comando, expectedCommand);
    assert.ok(result.tip, "tip legado removido — deve ser mantido");
  };

  // cd antes do clone.
  const cdBefore = run(freshState(), `cd ${REPO_FOLDER}`);
  assertMigrated(cdBefore, `git clone ${CLONE_URL}`);
  assert.match(cdBefore.tip, /git clone/);

  // Clone sem URL.
  const cloneNoUrl = run(freshState(), "git clone");
  assertMigrated(cloneNoUrl, `git clone ${CLONE_URL}`);

  const inside = clonedInsideRepo();

  // add sem argumento.
  const addNoArg = run(inside, "git add");
  assertMigrated(addNoArg, "git add chamada.txt");

  // add de arquivo inexistente.
  const addMissing = run(inside, "git add nao-existe.txt");
  assertMigrated(addMissing, "git add chamada.txt");

  // commit sem -m e commit com mensagem vazia.
  const commitNoFlag = run(inside, "git commit");
  assertMigrated(commitNoFlag, 'git commit -m "Presente: Ana Teste"');
  const commitEmpty = run(inside, 'git commit -m ""');
  assertMigrated(commitEmpty, 'git commit -m "Presente: Ana Teste"');

  // commit sem staging ("esqueceu de preparar").
  const edited = simulateEdit(inside);
  const commitNoStaging = run(edited, 'git commit -m "Presente: Ana Teste"');
  assertMigrated(commitNoStaging, "git add chamada.txt");

  // commit sem nada salvo: pista sem comando (o próximo passo é editar
  // e salvar no editor, não um comando de terminal).
  const commitNothing = run(inside, 'git commit -m "Presente: Ana Teste"');
  assert.equal(commitNothing.isError, true);
  assert.ok(commitNothing.tipDetail?.pista);
  assert.doesNotMatch(commitNothing.tipDetail.pista, /git [a-z]/);
  assert.equal(commitNothing.tipDetail.comando, undefined);

  // Próximo passo pós-add (arquivo único e ".").
  const addedFile = run(edited, "git add chamada.txt");
  assertMigrated(addedFile, 'git commit -m "Presente: Ana Teste"');
  const addedAll = run(edited, "git add .");
  assertMigrated(addedAll, 'git commit -m "Presente: Ana Teste"');

  // Pós-commit já tinha tipDetail (push) — segue intacto.
  const committed = run(addedFile.newState, 'git commit -m "Presente: Ana Teste"');
  assert.equal(committed.tipDetail?.comando, "git push origin main");
});

test("P2: README do repo simulado não tem receita nem comando git", () => {
  const readme = INITIAL_REPOSITORY.files["README.md"];
  assert.match(readme, /# 📚 Chamada de Presença - Turma 201/);
  assert.match(readme, /Bem-vindo\(a\) ao repositório oficial da disciplina!/);
  assert.match(readme, /Cada aluno registra sua presença com uma linha nova em chamada\.txt/);
  assert.match(readme, /Abra a aba VS Code e siga o Guia da atividade/);
  assert.doesNotMatch(readme, /git [a-z]/);
  assert.doesNotMatch(readme, /git clone|git add|git commit|git push/);
});

test("P4: transferência só conclui com credencial consumida (flag do motor)", () => {
  // Armadilha do passo 5: sem commit novo, o push responde "up to date"
  // e NEM PEDE a credencial (o próprio texto do passo 5 avisa disso) —
  // logo a flag fica falsa e a transferência NÃO se conclui, mesmo com
  // o modo transferência ativado. A lógica antiga (transferMode &&
  // hasPushed) marcaria concluído aqui se hasPushed já fosse verdadeiro
  // de um push anterior; a flag nova não.
  let idle = clonedInsideRepo();
  idle = { ...idle, transferMode: true };
  const idlePush = run(idle, "git push origin main");
  assert.equal(idlePush.output, "Everything up-to-date");
  assert.equal(idlePush.newState.awaitingSimulatedCredential, false);
  assert.equal(idlePush.newState.transferCredentialConsumed, false);
  assert.equal(idlePush.stepCompleted, undefined);

  // Para concluir, é preciso um commit novo + push com credencial.
  let idle2 = idlePush.newState;
  idle2 = simulateEdit(idle2);
  idle2 = run(idle2, "git add chamada.txt").newState;
  idle2 = run(idle2, 'git commit -m "Presente: Ana Teste"').newState;
  const promptedIdle = run(idle2, "git push origin main");
  assert.equal(promptedIdle.newState.awaitingSimulatedCredential, true);
  assert.equal(promptedIdle.newState.transferCredentialConsumed, false);
  const consumedIdle = run(promptedIdle.newState, "valor-simulado-qualquer");
  assert.equal(consumedIdle.consumedSimulatedCredential, true);
  assert.equal(consumedIdle.newState.transferCredentialConsumed, true);
  assert.equal(consumedIdle.stepCompleted, "push");
  assert.doesNotMatch(consumedIdle.output, /valor-simulado-qualquer/);

  // Caso normal: com commit novo, a credencial consumida conclui o push.
  let state = clonedInsideRepo();
  state = simulateEdit(state);
  state = run(state, "git add chamada.txt").newState;
  state = run(state, 'git commit -m "Presente: Ana Teste"').newState;
  state = { ...state, transferMode: true };
  const prompted = run(state, "git push origin main");
  assert.equal(prompted.newState.transferCredentialConsumed, false);
  const pushed = run(prompted.newState, "outro-valor-simulado");
  assert.equal(pushed.newState.transferCredentialConsumed, true);
  assert.equal(pushed.stepCompleted, "push");
  assert.doesNotMatch(pushed.output, /outro-valor-simulado/);

  // Sem credencial, a flag nunca liga sozinha (push normal fora do modo
  // transferência não a seta).
  let plain = clonedInsideRepo();
  plain = simulateEdit(plain);
  plain = run(plain, "git add chamada.txt").newState;
  plain = run(plain, 'git commit -m "Presente: Ana Teste"').newState;
  const plainPush = run(plain, "git push origin main");
  assert.equal(plainPush.newState.transferCredentialConsumed, false);
});

test("P5: pull executado e conflito resolvido viram flags do motor", () => {
  assert.equal(freshState().hasPulled, false);
  assert.equal(freshState().hasResolvedConflict, false);

  // Pull sem novidade ("Already up to date") também conta como executado.
  const idle = clonedInsideRepo();
  const idlePulled = run(idle, "git pull");
  assert.equal(idlePulled.isError, false);
  assert.equal(idlePulled.newState.hasPulled, true);

  // Pull com novidade marca a flag e traz o conteúdo.
  let state = clonedInsideRepo();
  state = {
    ...state,
    remoteRepo: {
      ...state.remoteRepo,
      files: {
        ...state.remoteRepo.files,
        "chamada.txt": `${INITIAL_CHAMADA}- [Aluno] Colega - Turma-A (Presente)\n`,
      },
      commits: [
        {
          id: "commit-colega", hash: "d00d1e2", author: "Colega", authorTurma: "Turma-A",
          message: "Presente: Colega", timestamp: "2026-10-24T00:00:00.000Z", filesChanged: ["chamada.txt"],
        },
        ...state.remoteRepo.commits,
      ],
    },
  };
  const pulled = run(state, "git pull");
  assert.equal(pulled.newState.hasPulled, true);

  // Conflito: pull com conflito não marca pull nem resolução; add resolve.
  let conflict = clonedInsideRepo();
  conflict = {
    ...conflict,
    files: { ...conflict.files, [`${REPO_FOLDER}/chamada.txt`]: "# Chamada Turma A - EDITADA LOCAL\n- [Docente] Prof. Augusto - Orientador\n" },
    modifiedFiles: new Set(["chamada.txt"]),
    remoteRepo: { ...conflict.remoteRepo, files: { "chamada.txt": "# Chamada Turma A - EDITADA REMOTA\n- [Docente] Prof. Augusto - Orientador\n" } },
  };
  const conflicted = run(conflict, "git pull");
  assert.equal(conflicted.isError, true);
  assert.equal(conflicted.newState.hasPulled, false);
  assert.equal(conflicted.newState.hasResolvedConflict, false);
  const resolved = run(conflicted.newState, "git add chamada.txt");
  assert.equal(resolved.newState.conflictedFiles.size, 0);
  assert.equal(resolved.newState.hasResolvedConflict, true);
});

test("pull e branch fora do repositório são rejeitados com fatal", () => {
  let state = freshState();
  state = run(state, `git clone ${CLONE_URL}`).newState;
  const pulled = run(state, "git pull");
  assert.equal(pulled.isError, true);
  assert.match(pulled.output, /not a git repository/);
  const branched = run(state, "git branch nova");
  assert.equal(branched.isError, true);
  assert.match(branched.output, /not a git repository/);
});

test("exclusão: rm tira da pasta de trabalho e status mostra deleted (não staged)", () => {
  const state = clonedInsideRepo();
  const removed = run(state, "rm chamada.txt");
  assert.equal(removed.isError, false);
  assert.equal(removed.newState.files[`${REPO_FOLDER}/chamada.txt`], undefined);
  assert.equal(removed.newState.deletedFiles.has("chamada.txt"), true);
  assert.equal(removed.newState.stagedFiles.has("chamada.txt"), false);
  const status = run(removed.newState, "git status");
  assert.match(status.output, /deleted:\s+chamada\.txt/);
  assert.match(status.output, /Changes not staged for commit/);
});

test("exclusão: git rm prepara a exclusão; commit registra deletion e limpa o pendente", () => {
  const state = clonedInsideRepo();
  const removed = run(state, "git rm chamada.txt");
  assert.equal(removed.isError, false);
  assert.match(removed.output, /rm 'chamada\.txt'/);
  assert.equal(removed.newState.deletedFiles.has("chamada.txt"), true);
  assert.equal(removed.newState.stagedFiles.has("chamada.txt"), true);
  const status = run(removed.newState, "git status");
  assert.match(status.output, /Changes to be committed/);
  assert.match(status.output, /deleted:\s+chamada\.txt/);
  const committed = run(removed.newState, 'git commit -m "Remove chamada"');
  assert.equal(committed.isError, false);
  assert.match(committed.output, /1 deletion/);
  assert.deepEqual(committed.newState.localCommits[0].filesDeleted, ["chamada.txt"]);
  assert.equal(committed.newState.deletedFiles.size, 0);
  const clean = run(committed.newState, "git status");
  assert.match(clean.output, /nothing to commit/);
});

test("exclusão: git add prepara exclusão pendente; git add . prepara todas", () => {
  const viaAdd = run(clonedInsideRepo(), "rm chamada.txt").newState;
  const staged = run(viaAdd, "git add chamada.txt");
  assert.equal(staged.isError, false);
  assert.equal(staged.newState.stagedFiles.has("chamada.txt"), true);
  const viaDot = run(clonedInsideRepo(), "rm chamada.txt").newState;
  const stagedDot = run(viaDot, "git add .");
  assert.equal(stagedDot.newState.stagedFiles.has("chamada.txt"), true);
});

test("exclusão: git diff de excluído mostra as linhas removidas; restore recupera", () => {
  const removed = run(clonedInsideRepo(), "rm chamada.txt").newState;
  const diff = run(removed, "git diff");
  assert.match(diff.output, /-# Chamada Turma A/);
  const restored = run(removed, "git restore chamada.txt");
  assert.equal(restored.isError, false);
  assert.equal(restored.newState.files[`${REPO_FOLDER}/chamada.txt`], INITIAL_CHAMADA);
  assert.equal(restored.newState.deletedFiles.size, 0);
  const notDeleted = run(clonedInsideRepo(), "git restore chamada.txt");
  assert.equal(notDeleted.isError, true);
  assert.match(notDeleted.output, /não está excluído/);
});

test("exclusão: git restore --staged devolve exclusão staged para não staged", () => {
  const staged = run(clonedInsideRepo(), "git rm chamada.txt").newState;
  const unstaged = run(staged, "git restore --staged chamada.txt");
  assert.equal(unstaged.isError, false);
  assert.equal(unstaged.newState.stagedFiles.has("chamada.txt"), false);
  assert.equal(unstaged.newState.deletedFiles.has("chamada.txt"), true);
});

test("exclusão: rm e git rm de arquivo inexistente falham sem tocar no estado", () => {
  const state = clonedInsideRepo();
  const rmMissing = run(state, "rm inexistente.txt");
  assert.equal(rmMissing.isError, true);
  assert.match(rmMissing.output, /No such file or directory/);
  const gitRmMissing = run(state, "git rm inexistente.txt");
  assert.equal(gitRmMissing.isError, true);
  assert.match(gitRmMissing.output, /did not match any files/);
  assert.equal(gitRmMissing.newState.deletedFiles.size, 0);
});

test("exclusão: push propaga exclusão (exceto chamada.txt) e restart remove só o aluno", () => {
  const repo = {
    id: "repo-1",
    name: REPO_FOLDER,
    owner: "escola",
    turma: "201",
    description: "r",
    defaultBranch: "main",
    cloneUrl: CLONE_URL,
    files: { "chamada.txt": `${INITIAL_CHAMADA}- [Aluno] Ana Teste - Turma-A (Presente)\n- [Aluno] Colega - Turma-A (Presente)\n`, "README.md": "readme" },
    commits: [
      { id: "c-ana", hash: "aaaaaaa", author: "Ana Teste", authorTurma: "201", message: "Presente", timestamp: "2026-10-24T00:00:00.000Z", filesChanged: ["chamada.txt"] },
      { id: "c-colega", hash: "bbbbbbb", author: "Colega", authorTurma: "201", message: "Presente", timestamp: "2026-10-24T00:00:00.000Z", filesChanged: ["chamada.txt"] },
    ],
    updatedAt: "2026-10-24T00:00:00.000Z",
  };
  const pushed = applyPushDeletions({ ...repo.files }, ["README.md", "chamada.txt"]);
  assert.equal(pushed["README.md"], undefined);
  assert.notEqual(pushed["chamada.txt"], undefined);
  const pruned = removeStudentContributions(repo, "Ana Teste");
  assert.equal(pruned.commits.length, 1);
  assert.equal(pruned.commits[0].id, "c-colega");
  assert.match(pruned.files["chamada.txt"], /Colega/);
  assert.doesNotMatch(pruned.files["chamada.txt"], /Ana Teste/);
});

test("restart: homônimo preservado; formatos reais do aluno removidos (D3)", () => {
  const repo = {
    id: "repo-1",
    name: REPO_FOLDER,
    owner: "escola",
    turma: "201",
    description: "r",
    defaultBranch: "main",
    cloneUrl: CLONE_URL,
    files: {
      "chamada.txt": [
        "========================================",
        "- [Aluno] Ana Teste Silva - 201 (Presente)",
        "- [Aluno] Ana Teste - 201 (Presente)",
        "Ana Teste",
        "Ana Teste - 201",
        "- [Aluno] Colega - 201 (Presente)",
        "",
      ].join("\n"),
      "README.md": "readme",
    },
    commits: [
      { id: "c-silva", hash: "aaaaaaa", author: "Ana Teste Silva", authorTurma: "201", message: "Presente", timestamp: "2026-10-24T00:00:00.000Z", filesChanged: ["chamada.txt"] },
      { id: "c-ana", hash: "bbbbbbb", author: "Ana Teste", authorTurma: "201", message: "Presente", timestamp: "2026-10-24T00:00:00.000Z", filesChanged: ["chamada.txt"] },
      { id: "c-colega", hash: "ccccccc", author: "Colega", authorTurma: "201", message: "Presente", timestamp: "2026-10-24T00:00:00.000Z", filesChanged: ["chamada.txt"] },
    ],
    updatedAt: "2026-10-24T00:00:00.000Z",
  };
  const pruned = removeStudentContributions(repo, "Ana Teste");
  const lines = pruned.files["chamada.txt"].split("\n");
  // Homônimo sobrevive (linha e commit); colega sobrevive.
  assert.ok(lines.includes("- [Aluno] Ana Teste Silva - 201 (Presente)"));
  assert.ok(lines.includes("- [Aluno] Colega - 201 (Presente)"));
  assert.ok(pruned.commits.some((c) => c.id === "c-silva"));
  assert.ok(pruned.commits.some((c) => c.id === "c-colega"));
  // Todas as formas reais da aluna somem (decorada, nua, com turma).
  assert.ok(!lines.includes("- [Aluno] Ana Teste - 201 (Presente)"));
  assert.ok(!lines.includes("Ana Teste"));
  assert.ok(!lines.includes("Ana Teste - 201"));
  assert.ok(!pruned.commits.some((c) => c.id === "c-ana"));
  // Helper direto, nas fronteiras:
  assert.equal(lineBelongsToStudent("- [Aluno] Ana Teste - 201 (Presente)", "Ana Teste"), true);
  assert.equal(lineBelongsToStudent("- [Aluno] Ana Teste Silva - 201 (Presente)", "Ana Teste"), false);
  assert.equal(lineBelongsToStudent("Ana Teste 201", "Ana Teste"), true);
  assert.equal(lineBelongsToStudent("Ana Teste (Presente)", "Ana Teste"), true);
  assert.equal(lineBelongsToStudent("Xana Teste", "Ana Teste"), false);
  assert.equal(lineBelongsToStudent("- [Docente] Prof. Augusto - Orientador", "Ana Teste"), false);
});
