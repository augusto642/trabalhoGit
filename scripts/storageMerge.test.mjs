// Testes do merge do POST /api/repository (correção D-NOVO-1, 29/10/2026).
//
// COMO RODAR: `npm run test:unit` (scripts/test-unit.mjs compila a lib
// com o tsc do projeto para um diretório temporário e roda este arquivo
// com STORAGE_COMPILED apontando para o JS compilado).
//
// O QUE ESTÁ TRAVADO AQUI (o vetor do D-NOVO-1):
// - mergeRepository NUNCA apaga commit: commits do estado atual que o
//   snapshot não tem sobrevivem (união por id);
// - commit com mesmo id não duplica (a escrita do push continua
//   idempotente);
// - chamada.txt mescla por união de linhas: nenhuma linha some;
// - arquivo que só existe no estado atual sobrevive; arquivo do snapshot
//   vence sobre o atual (last-writer-wins, igual ao push — residual
//   documentado, fora do D-NOVO-1);
// - prune DEPOIS do merge (fluxo Reiniciar): remove só os commits e as
//   linhas do aluno nomeado; homônimo preservado (D3).
// mergeRepository é puro (sem estado de servidor): sem resetAllData.

import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const compiled = process.env.STORAGE_COMPILED;
if (!compiled) {
  throw new Error("STORAGE_COMPILED não definido. Rode via `npm run test:unit`.");
}

// getCurrentStudent lê localStorage via window: em Node, simula o
// navegador com um localStorage em memória ANTES de importar o módulo
// compilado (isBrowser() testa `typeof window !== "undefined"`; o
// storage.ts usa o global nu `localStorage`, por isso os dois stubs).
const localStorageStore = new Map();
globalThis.localStorage = {
  getItem: (key) => (localStorageStore.has(key) ? localStorageStore.get(key) : null),
  setItem: (key, value) => localStorageStore.set(key, String(value)),
  removeItem: (key) => localStorageStore.delete(key),
};
globalThis.window = {
  localStorage: globalThis.localStorage,
  dispatchEvent: () => true,
};

const { mergeRepository, removeStudentContributions, getCurrentStudent } = await import(
  pathToFileURL(compiled).href
);

const repo = (turma, commits, files) => ({
  id: `chamada-turma-${turma}`,
  turma,
  name: `chamada-turma-${turma}`,
  owner: "prof-augusto",
  description: "Chamada",
  defaultBranch: "main",
  cloneUrl: `https://gitsim.edu/prof-augusto/chamada-turma-${turma}.git`,
  files: files ?? { "chamada.txt": "LISTA DE PRESENÇA\n" },
  commits: commits ?? [],
  updatedAt: "2026-10-29T00:00:00.000Z",
});
const commit = (id, author, turma) => ({
  id,
  hash: `h-${id}`,
  author,
  authorTurma: turma,
  message: `presenca ${author}`,
  timestamp: "2026-10-29T00:00:00.000Z",
  filesChanged: ["chamada.txt"],
});

test("merge nunca apaga commit do estado atual ausente no snapshot (D-NOVO-1)", () => {
  const existing = repo("201", [commit("c-bruno", "Bruno Alves", "201")], {
    "chamada.txt": "LISTA DE PRESENÇA\n- [Aluno] Bruno Alves\n",
  });
  const incoming = repo("201", [commit("c-carla", "Carla Dias", "201")], {
    "chamada.txt": "LISTA DE PRESENÇA\n- [Aluno] Carla Dias\n",
  });
  const merged = mergeRepository(existing, incoming);
  const ids = merged.commits.map((c) => c.id);
  assert.deepEqual(ids.sort(), ["c-bruno", "c-carla"].sort());
  assert.match(merged.files["chamada.txt"], /Bruno Alves/);
  assert.match(merged.files["chamada.txt"], /Carla Dias/);
});

test("merge não duplica commit com mesmo id", () => {
  const c = commit("c-dup", "Diego Fontes", "201");
  const merged = mergeRepository(repo("201", [c]), repo("201", [c]));
  assert.equal(merged.commits.filter((x) => x.id === "c-dup").length, 1);
});

test("merge com snapshot vazio preserva todo o estado atual", () => {
  const existing = repo("201", [commit("c-a", "Ana Teste", "201")], {
    "chamada.txt": "LISTA DE PRESENÇA\n- [Aluno] Ana Teste\n",
    "README.md": "conteúdo do colega",
  });
  const merged = mergeRepository(existing, repo("201", [], { "chamada.txt": "LISTA DE PRESENÇA\n" }));
  assert.equal(merged.commits.length, 1);
  assert.match(merged.files["chamada.txt"], /Ana Teste/);
  assert.equal(merged.files["README.md"], "conteúdo do colega");
});

test("prune depois do merge remove só o aluno nomeado (Reiniciar + D3)", () => {
  const existing = repo(
    "201",
    [commit("c-ana", "Ana Teste", "201"), commit("c-silva", "Ana Teste Silva", "201")],
    { "chamada.txt": "LISTA DE PRESENÇA\n- [Aluno] Ana Teste - 201 (Presente)\n- [Aluno] Ana Teste Silva - 201 (Presente)\n" }
  );
  // Snapshot podado da Ana Teste (sem os commits/linhas dela), como o
  // cliente do Reiniciar envia — mas o servidor já tem a colega Silva.
  const incoming = repo("201", [], {
    "chamada.txt": "LISTA DE PRESENÇA\n",
  });
  const merged = mergeRepository(existing, incoming);
  const pruned = removeStudentContributions(merged, "Ana Teste");
  assert.deepEqual(
    pruned.commits.map((c) => c.id),
    ["c-silva"]
  );
  assert.doesNotMatch(pruned.files["chamada.txt"], /- \[Aluno\] Ana Teste - 201/);
  assert.match(pruned.files["chamada.txt"], /Ana Teste Silva/);
});

test("merge não vaza entre turmas (cada chamada é só da turma dela)", () => {
  const repo201 = repo("201", [commit("c-201", "Bruno Alves", "201")]);
  const merged = mergeRepository(repo201, repo("201", [commit("c-201b", "Carla Dias", "201")]));
  assert.equal(merged.turma, "201");
  assert.ok(merged.commits.every((c) => c.authorTurma === "201"));
});

// --- Regressão D1: registro legado perde o domínio na exibição ---
// getCurrentStudent é o ponto central de load do registro do aluno no
// cliente (GitSimContext, handleSaveStudent e o sync do VSCodeView
// derivam dele). Antes da correção, o JSON.parse era cru: o campo
// legado `recoveredErrorConcepts` nunca era lido no cliente e a nota
// exibida perdia o componente de domínio (até −10 pts) até o aluno
// redemonstrar os conceitos.

const legacyStudent = (overrides = {}) => ({
  id: "student-legado",
  name: "Ana Teste",
  turma: "201",
  hasCloned: true,
  hasEdited: true,
  hasCommitted: true,
  hasPushed: true,
  score: 70, // nota gravada sem o componente de domínio (só conclusão)
  totalCommands: 10,
  errorCommands: 2,
  createdAt: "2026-10-29T00:00:00.000Z",
  lastActive: "2026-10-29T00:00:00.000Z",
  ...overrides,
});

test("getCurrentStudent une o campo legado em masteredConcepts e recalcula a nota (D1)", () => {
  localStorageStore.set(
    "gitsim_current_student",
    JSON.stringify(legacyStudent({ recoveredErrorConcepts: ["staging", "repo"] }))
  );
  const loaded = getCurrentStudent();
  assert.ok(loaded);
  assert.deepEqual(loaded.masteredConcepts, ["staging", "repo"]);
  assert.equal("recoveredErrorConcepts" in loaded, false);
  // 70 de conclusão + 2 conceitos × 5 = 80, já no primeiro load.
  assert.equal(loaded.score, 80);
});

test("getCurrentStudent une sem duplicar quando o legado já está em masteredConcepts (D1)", () => {
  localStorageStore.set(
    "gitsim_current_student",
    JSON.stringify(
      legacyStudent({
        masteredConcepts: ["staging"],
        recoveredErrorConcepts: ["staging", "repo"],
        score: 75, // 70 de conclusão + 1 conceito já contado
      })
    )
  );
  const loaded = getCurrentStudent();
  assert.deepEqual(loaded.masteredConcepts, ["staging", "repo"]);
  assert.equal("recoveredErrorConcepts" in loaded, false);
  assert.equal(loaded.score, 80);
});

test("getCurrentStudent não altera registro sem campo legado (D1)", () => {
  const current = legacyStudent({ masteredConcepts: ["staging"], score: 75 });
  localStorageStore.set("gitsim_current_student", JSON.stringify(current));
  const loaded = getCurrentStudent();
  assert.deepEqual(loaded, current);
});
