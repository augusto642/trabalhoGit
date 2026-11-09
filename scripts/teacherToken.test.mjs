// Testes unitários do token de sessão do professor (node:test nativo).
//
// COMO RODAR: `npm run test:unit` (scripts/test-unit.mjs compila
// src/lib/auth.ts com o tsc do projeto para um diretório temporário fora
// do repo e roda este arquivo com AUTH_COMPILED apontando para o JS
// compilado). Rodar este arquivo direto sem essa variável falha com
// mensagem explicativa.
//
// O QUE É TESTADO (desbloqueio ÚNICO): o token emitido por
// `issueTeacherToken` é aceito por `verifyTeacherToken` com o mesmo
// segredo, e recusado quando adulterado, expirado, com outro segredo ou
// malformado. O token é stateless: a verificação usa só o segredo
// (TEACHER_PASSWORD) e o relógio — nenhum estado de servidor.

import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const compiled = process.env.AUTH_COMPILED;
if (!compiled) {
  throw new Error(
    "AUTH_COMPILED não definido. Rode via `npm run test:unit` " +
      "(scripts/test-unit.mjs compila src/lib/auth.ts e define essa variável).",
  );
}

const { issueTeacherToken, verifyTeacherToken, TEACHER_TOKEN_TTL_MS } =
  await import(pathToFileURL(compiled).href);

const SECRET = "senha-de-teste-do-token";
const NOW = Date.UTC(2026, 9, 24, 12, 0, 0);

test("token emitido é aceito com o mesmo segredo", () => {
  const token = issueTeacherToken(SECRET, NOW);
  assert.equal(verifyTeacherToken(token, SECRET, NOW), true);
});

test("token tem formato v1.<exp>.<sig> e expira em 2h", () => {
  const token = issueTeacherToken(SECRET, NOW);
  const parts = token.split(".");
  assert.equal(parts.length, 3);
  assert.equal(parts[0], "v1");
  assert.equal(Number(parts[1]), Math.floor((NOW + TEACHER_TOKEN_TTL_MS) / 1000));
  assert.equal(TEACHER_TOKEN_TTL_MS, 2 * 60 * 60 * 1000);
  // Um segundo antes de expirar ainda vale; no vencimento, não vale mais.
  assert.equal(verifyTeacherToken(token, SECRET, NOW + TEACHER_TOKEN_TTL_MS - 1000), true);
  assert.equal(verifyTeacherToken(token, SECRET, NOW + TEACHER_TOKEN_TTL_MS), false);
});

test("token adulterado (payload ou assinatura) é recusado", () => {
  const token = issueTeacherToken(SECRET, NOW);
  const [v, exp, sig] = token.split(".");
  const tamperedExp = `${v}.${Number(exp) + 3600}.${sig}`;
  assert.equal(verifyTeacherToken(tamperedExp, SECRET, NOW), false);
  const tamperedSig = `${v}.${exp}.${sig.slice(0, -1)}${sig.endsWith("0") ? "1" : "0"}`;
  assert.equal(verifyTeacherToken(tamperedSig, SECRET, NOW), false);
});

test("token com outro segredo é recusado (senha trocada mata tokens antigos)", () => {
  const token = issueTeacherToken(SECRET, NOW);
  assert.equal(verifyTeacherToken(token, "outra-senha", NOW), false);
  assert.equal(verifyTeacherToken(token, "", NOW), false);
});

test("token malformado é recusado sem lançar", () => {
  for (const bad of ["", "v1", "v1.123", "v1.abc.sig", "v2.1234567890.abcdef", "a.b.c.d"]) {
    assert.equal(verifyTeacherToken(bad, SECRET, NOW), false);
  }
});

test("token não revela o segredo", () => {
  const token = issueTeacherToken(SECRET, NOW);
  assert.equal(token.includes(SECRET), false);
});
