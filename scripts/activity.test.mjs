// Testes unitários de src/lib/activity.ts (node:test nativo, sem framework).
//
// COMO RODAR: `npm run test:unit` (scripts/test-unit.mjs compila
// src/lib/activity.ts + src/lib/types.ts com o tsc do projeto para um
// diretório temporário fora do repo e roda este arquivo com
// ACTIVITY_COMPILED apontando para o JS compilado). Rodar este arquivo
// direto sem essa variável falha com mensagem explicativa.
//
// POR QUE EXISTE: os comportamentos pedagógicos da frente UI vivem em
// funções puras em activity.ts, mas até esta bateria só o motor
// (gitEngine) tinha teste. Estes testes travam: (a) os 3 modos de
// atividade e a regra "sem receita" (objetivos sem comando revelável);
// (b) os tiers da nota sem receita; (c) a regra 2-de-3 do alerta
// "só copiou" do professor; (d) o glossário (termos, definição
// não-vazia, sem duplicata). O que é React (GlossaryModal, VSCodeView,
// ProfessorView) continua sem teste automatizado — não há harness de
// browser neste repo — e segue verificado por inspeção de código.
//
// NOTA DE CONTAGEM: o glossário implementado tem 22 termos (contagem
// direta de GLOSSARY), não 21 como diz o briefing da tarefa. O teste
// trava o número implementado (22); se um termo for removido ou
// adicionado de propósito, o teste deve ser atualizado junto.

import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const compiled = process.env.ACTIVITY_COMPILED;
if (!compiled) {
  throw new Error(
    "ACTIVITY_COMPILED não definido. Rode via `npm run test:unit` " +
      "(scripts/test-unit.mjs compila activity.ts e define essa variável).",
  );
}

const {
  ACTIVITY_MODES,
  GLOSSARY,
  UNAIDED_OBJECTIVES,
  guidedSteps,
  lesson2Steps,
  computeUnaidedScore,
  detectCopiedAlert,
} = await import(pathToFileURL(compiled).href);

function makeStudent(overrides = {}) {
  return {
    id: "student-activity-1",
    name: "Ana Teste",
    turma: "Turma-A",
    hasCloned: true,
    hasEdited: true,
    hasCommitted: true,
    hasPushed: true,
    score: 70,
    totalCommands: 6,
    errorCommands: 0,
    createdAt: "2026-10-24T00:00:00.000Z",
    lastActive: "2026-10-24T00:00:00.000Z",
    ...overrides,
  };
}

function makeLog(command, timestamp, isError = false) {
  return {
    id: `log-${command}-${timestamp}`,
    studentId: "student-activity-1",
    studentName: "Ana Teste",
    turma: "Turma-A",
    command,
    output: "",
    isError,
    timestamp,
  };
}

test("modos: guided, unaided e lesson2 existem com rótulo e descrição", () => {
  for (const mode of ["guided", "unaided", "lesson2"]) {
    assert.ok(ACTIVITY_MODES[mode], `modo ${mode} ausente`);
    assert.ok(ACTIVITY_MODES[mode].label.length > 0);
    assert.ok(ACTIVITY_MODES[mode].description.length > 0);
  }
});

test("sem receita: os 4 objetivos têm conceito e meta, nenhum tem comando revelável", () => {
  assert.equal(UNAIDED_OBJECTIVES.length, 4);
  for (const step of UNAIDED_OBJECTIVES) {
    assert.ok(step.concept.length > 0, `${step.id} sem conceito`);
    assert.ok(step.goal.length > 0, `${step.id} sem meta`);
    assert.equal(step.revealCommand, undefined, `${step.id} vaza comando revelável`);
  }
});

test("aula 1 guiada: os 4 passos têm conceito e comando revelável (revelado sob demanda)", () => {
  const steps = guidedSteps("https://github.com/escola/chamada-turma-a.git", "chamada-turma-a");
  assert.equal(steps.length, 4);
  for (const step of steps) {
    assert.ok(step.concept.length > 0, `${step.id} sem conceito`);
    assert.ok(step.revealCommand && step.revealCommand.length > 0, `${step.id} sem revealCommand`);
  }
});

test("aula 2: todos os passos têm conceito e comando revelável", () => {
  const steps = lesson2Steps("chamada-turma-a");
  assert.ok(steps.length >= 4, `esperava ao menos 4 passos, veio ${steps.length}`);
  const ids = steps.map((s) => s.id);
  for (const expected of ["branch", "pull", "conflict", "transfer"]) {
    assert.ok(ids.includes(expected), `passo ${expected} ausente na Aula 2`);
  }
  for (const step of steps) {
    assert.ok(step.concept.length > 0, `${step.id} sem conceito`);
    assert.ok(step.revealCommand && step.revealCommand.length > 0, `${step.id} sem revealCommand`);
  }
});

test("nota sem receita: 0 dicas reveladas = 10; 1 = 5; 2 ou mais = 0", () => {
  assert.equal(computeUnaidedScore(0), 10);
  assert.equal(computeUnaidedScore(1), 5);
  assert.equal(computeUnaidedScore(2), 0);
  assert.equal(computeUnaidedScore(9), 0);
});

test("alerta 'só copiou': 1 indício isolado NÃO dispara o alerta", () => {
  // Só o indício 3 (zero erros, >= 4 comandos), com ritmo espaçado e
  // sem cadeia &&: 1 motivo, alerta falso.
  const logs = [
    makeLog("git clone https://github.com/escola/chamada-turma-a.git", "2026-10-24T10:00:00.000Z"),
    makeLog("git status", "2026-10-24T10:01:00.000Z"),
    makeLog("git add .", "2026-10-24T10:02:00.000Z"),
    makeLog("git commit -m \"Presente\"", "2026-10-24T10:03:00.000Z"),
    makeLog("git push origin main", "2026-10-24T10:04:00.000Z"),
  ];
  const result = detectCopiedAlert(makeStudent({ totalCommands: 5, errorCommands: 0 }), logs);
  assert.equal(result.alert, false);
  assert.equal(result.reasons.length, 1);
});

test("alerta 'só copiou': ritmo curtíssimo + cadeia && sem diagnóstico dispara (>= 2 indícios)", () => {
  const logs = [
    makeLog("git clone https://github.com/escola/chamada-turma-a.git", "2026-10-24T10:00:00.000Z"),
    makeLog("git add . && git commit -m \"Presente\" && git push", "2026-10-24T10:00:03.000Z"),
    makeLog("git log --oneline", "2026-10-24T10:00:05.000Z"),
  ];
  // git log é diagnóstico para o indício 2? Não: o indício 2 exige
  // cadeia && SEM nenhum status/diff/log — aqui há log, então o
  // indício 2 não conta; ritmo curtíssimo + zero erros = 2 indícios.
  const result = detectCopiedAlert(makeStudent({ totalCommands: 5, errorCommands: 0 }), logs);
  assert.equal(result.alert, true);
  assert.ok(result.reasons.length >= 2);
});

test("alerta 'só copiou': diagnóstico presente quebra o indício da cadeia &&", () => {
  const logs = [
    makeLog("git status", "2026-10-24T10:00:00.000Z"),
    makeLog("git add . && git commit -m \"Presente\" && git push", "2026-10-24T10:05:00.000Z"),
  ];
  const result = detectCopiedAlert(makeStudent({ totalCommands: 2, errorCommands: 1 }), logs);
  assert.equal(result.alert, false);
  assert.equal(result.reasons.length, 0);
});

test("glossário: 22 termos, cada um com definição, sem duplicata", () => {
  assert.equal(GLOSSARY.length, 22);
  const terms = new Set();
  for (const entry of GLOSSARY) {
    assert.ok(entry.term.length > 0, "termo vazio");
    assert.ok(entry.definition.length > 0, `${entry.term} sem definição`);
    assert.ok(!terms.has(entry.term), `termo duplicado: ${entry.term}`);
    terms.add(entry.term);
  }
});

test("glossário: cobre os conceitos que a análise apontou como jargão sem definição", () => {
  const terms = GLOSSARY.map((e) => e.term);
  for (const needed of ["Staging (área de preparação)", "Remoto (origin)", "Conflito", "Credencial / login (push de verdade)"]) {
    assert.ok(terms.includes(needed), `termo ausente: ${needed}`);
  }
});
