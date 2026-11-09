// Walkthrough: um aluno consegue atingir 100%?
//
// COMO RODAR: `npm run test:score-100` (scripts/test-score-100.mjs
// compila src/lib/*.ts com o tsc do projeto para um diretório
// temporário fora do repo e roda este arquivo com GITENGINE_COMPILED
// e ACTIVITY_COMPILED apontando para o JS compilado — mesmo padrão
// de scripts/test-unit.mjs). Rodar direto sem essas variáveis falha
// com mensagem explicativa.
//
// O QUE O TESTE FAZ: reproduz, comando a comando, a sessão de um
// aluno no modo "Sem receita" (activityMode "unaided", nenhuma dica
// revelada), aplicando a MESMA lógica de acumulação de nota da
// VSCodeView (handleCommandSubmit): sucesso -> conceitos dominados
// (de primeira OU após erro — sem gate de erro pendente); diagnóstico
// (status/diff/log); stepCompleted -> hasCloned/hasCommitted/hasPushed;
// push no modo sem receita -> unaidedScore = computeUnaidedScore(0
// reveladas). A edição é simulada exatamente como em
// gitEngine.test.mjs (o motor não tem comando de edição: o editor troca
// o conteúdo e marca modifiedFiles). O repositório é o REAL da turma
// 201 (initialRepositoryForTurma), não um fixture sintético.
//
// ROTEIRO DO 100% — CAMINHO (a), ACERTO DE PRIMEIRA, SEM ERROS
// (aluno "Teste Cem Primeira", turma 201):
//   1. git clone <url oficial 201> -> clone (10) + domina "clone-url" e "repo"
//   2. cd chamada-turma-201 -> domina "repo" (já dominado)
//   3. editar chamada.txt: linha nova com o nome completo -> edição (20)
//   4. git status + 5. git diff -> diagnósticos "status" e "diff" (10)
//   6. git add chamada.txt -> domina "staging" e "add-path"
//   7. git commit -m "Presente: ..." -> commit (20) + domina "commit-message"
//      -> 5 conceitos distintos = teto (10)
//   8. git log -> 3º diagnóstico (teto já atingido com 2)
//   9. git push origin main -> push (20) + sem receita, 0 dicas
//      reveladas -> unaidedScore 10
// Total: 70 (conclusão) + 10 (domínio) + 10 (diagnóstico) +
//   10 (sem receita) = 100 — sem errar nenhum comando.
//
// ROTEIRO DO 100% — CAMINHO (b), ERRAR-E-RECUPERAR
// (aluno "Teste Cem Porcento", turma 201):
//   1. git status (antes do clone) -> erro "not a git repository"
//      (diagnóstico "status"; nenhum conceito dominado ainda)
//   2. git clone <url oficial 201> -> clone (10) + domina "repo"
//   3. cd chamada-turma-201
//   4. editar chamada.txt: linha nova com o nome completo -> edição (20)
//   5. git status + 6. git diff -> diagnósticos "status" e "diff" (10)
//   7. git commit -m "Presente" (sem add) -> erro "no changes added
//      to commit"
//   8. git add chamada.txt -> domina "staging" e "add-path"
//   9. git commit (sem -m) -> erro "requires a value"
//  10. git commit -m "Presente: Teste Cem Porcento" -> commit (20) +
//      domina "commit-message" -> 5 conceitos distintos = teto (10)
//  11. git log -> 3º diagnóstico (teto já atingido com 2)
//  12. git push origin main -> push (20) + sem receita, 0 dicas
//      reveladas -> unaidedScore 10
// Total: 70 (conclusão) + 10 (domínio) + 10 (diagnóstico) +
//   10 (sem receita) = 100.
//
// O 3º teste trava o gate R1: push SEM a própria linha na
// chamada.txt registra o envio (pushedCommit existe), mas NÃO dá
// crédito de push nem de edição — é o resíduo conhecido do fluxo
// só-Aula-2 sem a própria linha.

import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const compiled = process.env.GITENGINE_COMPILED;
if (!compiled) {
  throw new Error(
    "GITENGINE_COMPILED não definido. Rode via `npm run test:score-100` " +
      "(scripts/test-score-100.mjs compila o engine e define essa variável).",
  );
}
const activityCompiled = process.env.ACTIVITY_COMPILED;
if (!activityCompiled) {
  throw new Error(
    "ACTIVITY_COMPILED não definido. Rode via `npm run test:score-100`.",
  );
}

const {
  createInitialGitState,
  executeTerminalCommand,
  hasNewLineWithFullName,
  computeScore,
  computeScoreBreakdown,
  conceptsResolvedByCommand,
  diagnosticCommandOf,
} = await import(pathToFileURL(compiled).href);

const { computeUnaidedScore } = await import(pathToFileURL(activityCompiled).href);

const initialDataPath = join(dirname(fileURLToPath(pathToFileURL(compiled).href)), "initialData.js");
const { initialRepositoryForTurma } = await import(pathToFileURL(initialDataPath).href);

const REPO_FOLDER = "chamada-turma-201";
const CLONE_URL = "https://gitsim.edu/prof-augusto/chamada-turma-201.git";

function makeStudent(name) {
  return {
    id: `student-100-${Date.now()}`,
    name,
    turma: "201",
    hasCloned: false,
    hasEdited: false,
    hasCommitted: false,
    hasPushed: false,
    score: 0,
    totalCommands: 0,
    errorCommands: 0,
    masteredConcepts: [],
    diagnosticCommands: [],
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
  };
}

/**
 * Sessão de aluno no terminal, espelhando VSCodeView.handleCommandSubmit:
 * - mastered: conceitos dominados por comandos bem-sucedidos (de primeira
 *   OU após erro — sem gate de erro pendente);
 * - masteredConcepts / diagnosticCommands: acumulados no aluno;
 * - revealedTipIndexes: dicas reveladas na sessão (0 aqui: modo sem
 *   receita, aluno digitou tudo de cabeça, sem clicar em "Revelar
 *   comando");
 * - activityMode "unaided": o push soma a nota sem receita.
 */
function makeSession(student) {
  const session = {
    student,
    state: createInitialGitState(student, initialRepositoryForTurma("201")),
    mastered: new Set(),
    diagnostics: new Set(),
    revealed: new Set(),
    activityMode: "unaided",
  };

  session.run = (cmd) => {
    const result = executeTerminalCommand(cmd, session.state);
    session.state = result.newState;
    // Domínio de conceito: todo conceito de um comando bem-sucedido
    // entra no conjunto (dedup), sem exigir erro prévio do conceito.
    if (!result.isError) {
      for (const c of conceptsResolvedByCommand(cmd, result.isError)) {
        session.mastered.add(c);
      }
    }
    const diag = diagnosticCommandOf(cmd);
    if (diag) session.diagnostics.add(diag);
    if (result.stepCompleted === "clone") session.student.hasCloned = true;
    if (result.stepCompleted === "commit") session.student.hasCommitted = true;
    if (result.stepCompleted === "push") {
      session.student.hasPushed = true;
      if (session.activityMode === "unaided") {
        session.student.unaidedScore = computeUnaidedScore(session.revealed.size);
      }
    }
    session.student.masteredConcepts = [...session.mastered];
    session.student.diagnosticCommands = [...session.diagnostics];
    return result;
  };

  // Simula o editor: troca o conteúdo e marca o arquivo como modificado
  // (mesmo padrão de gitEngine.test.mjs).
  session.editChamada = (newLine) => {
    const fullPath = `${REPO_FOLDER}/chamada.txt`;
    const original = session.state.files[fullPath];
    session.state = {
      ...session.state,
      files: { ...session.state.files, [fullPath]: `${original}${newLine}\n` },
      modifiedFiles: new Set([...session.state.modifiedFiles, "chamada.txt"]),
    };
    if (hasNewLineWithFullName(original, session.state.files[fullPath], session.student.name)) {
      session.student.hasEdited = true;
    }
    return session.state.files[fullPath];
  };

  return session;
}

test("aluno atinge 100% acertando de primeira, sem nenhum erro, no modo sem receita", () => {
  const s = makeSession(makeStudent("Teste Cem Primeira"));

  // 1. Clone com a URL oficial da turma 201 — domina "clone-url" e "repo".
  let r = s.run(`git clone ${CLONE_URL}`);
  assert.equal(r.isError, false, `clone deve funcionar: ${r.output}`);
  assert.equal(r.stepCompleted, "clone");
  assert.equal(s.student.hasCloned, true);
  assert.ok(s.mastered.has("clone-url"), "clone bem-sucedido domina 'clone-url'");
  assert.ok(s.mastered.has("repo"), "clone bem-sucedido domina 'repo'");

  // 2. Entrar na pasta.
  r = s.run(`cd ${REPO_FOLDER}`);
  assert.equal(r.isError, false, `cd deve funcionar: ${r.output}`);

  // 3. Editar chamada.txt com a linha do próprio nome completo.
  s.editChamada("Teste Cem Primeira - Turma 201");
  assert.equal(s.student.hasEdited, true, "linha nova com o nome completo = edição");

  // 4-5. Diagnóstico antes de agir: status e diff.
  r = s.run("git status");
  assert.equal(r.isError, false);
  r = s.run("git diff");
  assert.equal(r.isError, false, `diff deve funcionar: ${r.output}`);
  assert.deepEqual([...s.diagnostics].sort(), ["diff", "status"]);

  // 6. git add de primeira: domina "staging" e "add-path".
  r = s.run("git add chamada.txt");
  assert.equal(r.isError, false, `add deve funcionar: ${r.output}`);
  assert.ok(s.mastered.has("staging"), "add de primeira domina 'staging'");
  assert.ok(s.mastered.has("add-path"), "add de primeira domina 'add-path'");

  // 7. Commit com mensagem de primeira: domina "commit-message".
  r = s.run('git commit -m "Presente: Teste Cem Primeira"');
  assert.equal(r.isError, false, `commit deve funcionar: ${r.output}`);
  assert.equal(r.stepCompleted, "commit");
  assert.equal(s.student.hasCommitted, true);
  assert.ok(s.mastered.has("commit-message"), "commit de primeira domina 'commit-message'");

  // 8. git log: 3º diagnóstico (teto de pontos já atingido com 2).
  r = s.run("git log");
  assert.equal(r.isError, false);
  assert.deepEqual([...s.diagnostics].sort(), ["diff", "log", "status"]);

  // 9. Push com a própria linha na chamada.txt: conclusão + sem receita.
  r = s.run("git push origin main");
  assert.equal(r.isError, false, `push deve funcionar: ${r.output}`);
  assert.equal(r.stepCompleted, "push", "push com a própria linha dá crédito");
  assert.ok(r.pushedCommit, "push deve devolver o commit enviado");
  assert.equal(s.student.hasPushed, true);
  assert.equal(s.student.unaidedScore, 10, "0 dicas reveladas no modo sem receita = 10");

  // Nenhum erro em todo o caminho — o 100% veio do acerto de primeira.
  assert.equal(s.student.errorCommands, 0);
  assert.deepEqual(
    [...s.mastered].sort(),
    ["add-path", "clone-url", "commit-message", "repo", "staging"],
    "5 conceitos distintos dominados sem errar",
  );

  // Nota final: 70 + 10 + 10 + 10 = 100.
  const breakdown = computeScoreBreakdown(s.student);
  assert.deepEqual(breakdown, {
    completion: 70,
    mastered: 10,
    diagnostic: 10,
    unaided: 10,
    total: 100,
  });
  assert.equal(computeScore(s.student), 100);
});

test("aluno atinge 100% no modo sem receita, sem revelar nenhuma dica", () => {
  const s = makeSession(makeStudent("Teste Cem Porcento"));

  // 1. git status antes do clone: erro "not a git repository".
  let r = s.run("git status");
  assert.equal(r.isError, true, "status antes do clone deve falhar");
  assert.match(r.output, /not a git repository/);
  assert.ok(s.diagnostics.has("status"));

  // 2. Clone com a URL oficial da turma 201.
  r = s.run(`git clone ${CLONE_URL}`);
  assert.equal(r.isError, false, `clone deve funcionar: ${r.output}`);
  assert.equal(r.stepCompleted, "clone");
  assert.equal(s.student.hasCloned, true);
  assert.ok(s.mastered.has("repo"), "clone bem-sucedido domina 'repo'");

  // 3. Entrar na pasta.
  r = s.run(`cd ${REPO_FOLDER}`);
  assert.equal(r.isError, false, `cd deve funcionar: ${r.output}`);

  // 4. Editar chamada.txt com a linha do próprio nome completo.
  s.editChamada("Teste Cem Porcento - Turma 201");
  assert.equal(s.student.hasEdited, true, "linha nova com o nome completo = edição");

  // 5-6. Diagnóstico antes de agir: status e diff.
  r = s.run("git status");
  assert.equal(r.isError, false);
  r = s.run("git diff");
  assert.equal(r.isError, false, `diff deve funcionar: ${r.output}`);
  assert.deepEqual([...s.diagnostics].sort(), ["diff", "status"]);

  // 7. Commit sem add: erro "no changes added to commit".
  r = s.run('git commit -m "Presente"');
  assert.equal(r.isError, true, "commit sem add deve falhar");
  assert.match(r.output, /no changes added to commit/);

  // 8. git add recupera "staging" (errar-e-recuperar também é domínio).
  r = s.run("git add chamada.txt");
  assert.equal(r.isError, false, `add deve funcionar: ${r.output}`);
  assert.ok(s.mastered.has("staging"), "add domina 'staging'");

  // 9. Commit sem -m: erro "requires a value".
  r = s.run("git commit");
  assert.equal(r.isError, true, "commit sem -m deve falhar");
  assert.match(r.output, /requires a value/);

  // 10. Commit com mensagem: registra e domina "commit-message".
  r = s.run('git commit -m "Presente: Teste Cem Porcento"');
  assert.equal(r.isError, false, `commit deve funcionar: ${r.output}`);
  assert.equal(r.stepCompleted, "commit");
  assert.equal(s.student.hasCommitted, true);
  assert.ok(s.mastered.has("commit-message"));

  // 11. git log: 3º diagnóstico (teto de pontos já atingido com 2).
  r = s.run("git log");
  assert.equal(r.isError, false);
  assert.deepEqual([...s.diagnostics].sort(), ["diff", "log", "status"]);

  // 12. Push com a própria linha na chamada.txt: conclusão + sem receita.
  r = s.run("git push origin main");
  assert.equal(r.isError, false, `push deve funcionar: ${r.output}`);
  assert.equal(r.stepCompleted, "push", "push com a própria linha dá crédito");
  assert.ok(r.pushedCommit, "push deve devolver o commit enviado");
  assert.equal(s.student.hasPushed, true);
  assert.equal(s.student.unaidedScore, 10, "0 dicas reveladas no modo sem receita = 10");

  // Nota final: 70 + 10 + 10 + 10 = 100.
  const breakdown = computeScoreBreakdown(s.student);
  assert.deepEqual(breakdown, {
    completion: 70,
    mastered: 10,
    diagnostic: 10,
    unaided: 10,
    total: 100,
  });
  assert.equal(computeScore(s.student), 100);
});

test("gate R1: push sem a própria linha registra o envio, mas não dá crédito", () => {
  const s = makeSession(makeStudent("Aluno Sem Linha"));

  let r = s.run(`git clone ${CLONE_URL}`);
  assert.equal(r.stepCompleted, "clone");
  r = s.run(`cd ${REPO_FOLDER}`);
  assert.equal(r.isError, false);

  // Edita com uma linha que NÃO é o nome do aluno.
  s.editChamada("Outra Pessoa Qualquer - Turma 201");
  assert.equal(s.student.hasEdited, false, "linha sem o nome do aluno não conta como edição");

  r = s.run("git add chamada.txt");
  assert.equal(r.isError, false);
  r = s.run('git commit -m "Presente de outra pessoa"');
  assert.equal(r.stepCompleted, "commit");

  // O envio acontece (pushedCommit existe), mas sem crédito de push.
  r = s.run("git push origin main");
  assert.equal(r.isError, false, "o envio em si é válido como git");
  assert.ok(r.pushedCommit, "o envio foi registrado");
  assert.equal(r.stepCompleted, undefined, "sem a própria linha, sem crédito de push");
  assert.equal(s.student.hasPushed, false);

  const breakdown = computeScoreBreakdown(s.student);
  assert.equal(breakdown.completion, 30, "só clone (10) + commit (20); sem edição e sem push");
  // O domínio NÃO depende do gate R1: o aluno demonstrou os conceitos
  // (clone, add, commit) mesmo sem assinar a lista — só o crédito de
  // conclusão (edição/push) é retido. 30 + 10 (domínio) = 40.
  assert.equal(breakdown.mastered, 10);
  assert.equal(breakdown.total, 40);
});
