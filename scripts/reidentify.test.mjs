// Teste de regressão do F1: re-identificar o mesmo aluno não pode
// apagar o progresso (tarefa 192).
//
// COMO RODAR: `npm run test:unit` (scripts/test-unit.mjs compila a lib
// com o tsc do projeto para um diretório temporário e roda este arquivo
// com STUDENTIDENTITY_COMPILED apontando para o JS compilado).
//
// O QUE ESTÁ TRAVADO AQUI (o vetor do F1): o modal de identificação
// montava um Student novo do zero — quem já estava identificado e
// clicava no próprio nome na Navbar perdia silenciosamente
// masteredConcepts, diagnosticCommands, unaidedScore e os flags da
// Aula 2 (até 10 pts num recompute futuro, porque o POST /api/students
// recalcula a nota do registro enviado).
// - (a) re-identificar o MESMO aluno (mesmo nome + mesma turma)
//   preserva TUDO: id, createdAt, passos, contadores, nota, domínio,
//   diagnósticos e flags da Aula 2; só nome/turma digitados e
//   lastActive mudam;
// - (b) aluno DIFERENTE (outro nome ou outra turma) ganha registro
//   novo e zerado, com id novo — nunca herda o id nem o progresso do
//   aluno anterior;
// - sem aluno corrente, o registro também é novo e zerado.

import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const compiled = process.env.STUDENTIDENTITY_COMPILED;
if (!compiled) {
  throw new Error("STUDENTIDENTITY_COMPILED não definido. Rode via `npm run test:unit`.");
}

const { buildIdentifiedStudent, isSameStudentIdentity } = await import(
  pathToFileURL(compiled).href
);

// Aluno com progresso completo (Aula 1 + Aula 2): o registro que o
// F1 apagava ao re-identificar.
const progressedStudent = () => ({
  id: "student-1000",
  name: "Maria da Silva",
  turma: "201",
  hasCloned: true,
  hasEdited: true,
  hasCommitted: true,
  hasPushed: true,
  score: 85,
  totalCommands: 40,
  errorCommands: 5,
  createdAt: "2026-11-08T10:00:00.000Z",
  lastActive: "2026-11-08T10:30:00.000Z",
  masteredConcepts: ["staging", "commit-message"],
  diagnosticCommands: ["status", "log"],
  unaidedScore: 8,
  hasPulled: true,
  hasResolvedConflict: true,
  transferCompleted: true,
});

test("(a) re-identificar o mesmo aluno preserva todo o progresso", () => {
  const current = progressedStudent();
  const result = buildIdentifiedStudent(current, "Maria da Silva", "201");

  assert.equal(result.id, current.id);
  assert.equal(result.createdAt, current.createdAt);
  assert.equal(result.name, "Maria da Silva");
  assert.equal(result.turma, "201");
  assert.equal(result.hasCloned, true);
  assert.equal(result.hasEdited, true);
  assert.equal(result.hasCommitted, true);
  assert.equal(result.hasPushed, true);
  assert.equal(result.score, 85);
  assert.equal(result.totalCommands, 40);
  assert.equal(result.errorCommands, 5);
  assert.deepEqual(result.masteredConcepts, ["staging", "commit-message"]);
  assert.deepEqual(result.diagnosticCommands, ["status", "log"]);
  assert.equal(result.unaidedScore, 8);
  assert.equal(result.hasPulled, true);
  assert.equal(result.hasResolvedConflict, true);
  assert.equal(result.transferCompleted, true);
  // lastActive é atualizado (não é o valor antigo).
  assert.ok(result.lastActive >= result.createdAt);
  assert.notEqual(result.lastActive, current.lastActive);
});

test("(a) mesmo aluno com caixa/espaços diferentes continua sendo o mesmo", () => {
  const current = progressedStudent();
  assert.equal(isSameStudentIdentity(current, "  MARIA  da  Silva ", "201"), true);
  const result = buildIdentifiedStudent(current, "  MARIA  da  Silva ", "201");
  assert.equal(result.id, current.id);
  assert.deepEqual(result.masteredConcepts, ["staging", "commit-message"]);
  assert.equal(result.score, 85);
  assert.equal(result.unaidedScore, 8);
});

test("(a) campo legado recoveredErrorConcepts sobrevive à re-identificação", () => {
  const current = {
    ...progressedStudent(),
    recoveredErrorConcepts: ["repo"],
  };
  const result = buildIdentifiedStudent(current, "Maria da Silva", "201");
  assert.deepEqual(result.recoveredErrorConcepts, ["repo"]);
  assert.deepEqual(result.masteredConcepts, ["staging", "commit-message"]);
});

test("(b) aluno diferente (outro nome) ganha registro novo e zerado", () => {
  const current = progressedStudent();
  const result = buildIdentifiedStudent(current, "João Pereira", "201");

  assert.notEqual(result.id, current.id);
  assert.ok(result.id.startsWith("student-"));
  assert.equal(result.name, "João Pereira");
  assert.equal(result.turma, "201");
  assert.equal(result.hasCloned, false);
  assert.equal(result.hasEdited, false);
  assert.equal(result.hasCommitted, false);
  assert.equal(result.hasPushed, false);
  assert.equal(result.score, 0);
  assert.equal(result.totalCommands, 0);
  assert.equal(result.errorCommands, 0);
  assert.equal(result.masteredConcepts, undefined);
  assert.equal(result.diagnosticCommands, undefined);
  assert.equal(result.unaidedScore, undefined);
  assert.equal(result.hasPulled, undefined);
  assert.equal(result.hasResolvedConflict, undefined);
  assert.equal(result.transferCompleted, undefined);
});

test("(b) mesmo nome, outra turma, ganha registro novo e zerado", () => {
  const current = progressedStudent();
  assert.equal(isSameStudentIdentity(current, "Maria da Silva", "202"), false);
  const result = buildIdentifiedStudent(current, "Maria da Silva", "202");
  assert.notEqual(result.id, current.id);
  assert.equal(result.turma, "202");
  assert.equal(result.score, 0);
  assert.equal(result.masteredConcepts, undefined);
  assert.equal(result.hasResolvedConflict, undefined);
});

test("(b) sem aluno corrente, o registro é novo e zerado", () => {
  const result = buildIdentifiedStudent(null, "Ana Souza", "202");
  assert.ok(result.id.startsWith("student-"));
  assert.equal(result.name, "Ana Souza");
  assert.equal(result.turma, "202");
  assert.equal(result.score, 0);
  assert.equal(result.hasCloned, false);
  assert.equal(result.masteredConcepts, undefined);
});
