// Testes da partição da chamada por turma (node:test nativo, sem framework).
//
// COMO RODAR: `npm run test:unit` (scripts/test-unit.mjs compila a lib
// com o tsc do projeto para um diretório temporário e roda este arquivo
// com PARTITION_COMPILED apontando para o JS compilado). O storage aqui
// roda em Node (sem window): usa a memória do servidor, compartilhada
// entre os testes deste arquivo — cada teste de storage começa com
// resetAllData() para não vazar estado.
//
// O QUE ESTÁ TRAVADO AQUI (requisitos da partição por turma):
// - linhas com token 201 vão só para a 201; com 202, só para a 202;
// - linha com as duas turmas ou nenhuma vai para a lista legada, nunca
//   misturada em nenhuma turma; linhas do modelo (cabeçalho, instruções,
//   docente) não são dado de aluno e não viram legado;
// - commits seguem o authorTurma; o seed do docente não duplica;
// - push na 201 não altera a lista nem os commits da 202 (e vice-versa);
// - a conclusão (70 dos 4 passos) acontece sobre a lista da própria
//   turma: o nome do aluno está na lista da turma dele após o push.

import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const compiled = process.env.PARTITION_COMPILED;
if (!compiled) {
  throw new Error(
    "PARTITION_COMPILED não definido. Rode via `npm run test:unit`."
  );
}

const dir = dirname(fileURLToPath(pathToFileURL(compiled).href));
const { classifyChamadaLine, partitionChamadaContent, partitionLegacyRepository } =
  await import(pathToFileURL(join(dir, "partitionChamada.js")).href);
const {
  pushCommitToRepo,
  getStoredRepository,
  getStoredRepositories,
  saveRepository,
  resetAllData,
} = await import(pathToFileURL(join(dir, "storage.js")).href);
const { computeScoreBreakdown } = await import(pathToFileURL(join(dir, "gitEngine.js")).href);

function oldRepoFixture() {
  return {
    id: "repo-turma-a",
    name: "chamada-turma-a",
    owner: "prof-augusto",
    description: "Repositório antigo, lista única",
    defaultBranch: "main",
    cloneUrl: "https://gitsim.edu/prof-augusto/chamada-turma-a.git",
    files: {
      "README.md": "# Chamada antiga\n",
      "chamada.txt":
        "========================================\n" +
        "       LISTA DE PRESENÇA - TURMA A\n" +
        "========================================\n" +
        "Instruções: Adicione seu nome completo e turma nas linhas abaixo:\n" +
        "\n" +
        "- [Docente] Prof. Augusto - Orientador\n" +
        "- Ana Silva - 201\n" +
        "- Bruno Costa - 202\n" +
        "- Carla Dias - 201\n" +
        "- Sem Turma Nenhuma\n" +
        "- Duda Lima - 201/202\n" +
        "- Formando em 2024 sem turma\n",
    },
    commits: [
      {
        id: "commit-carla", hash: "ccccccc", author: "Carla Dias", authorTurma: "201",
        message: "Presente: Carla Dias", timestamp: "2026-10-24T00:00:02.000Z",
        filesChanged: ["chamada.txt"],
      },
      {
        id: "commit-bruno", hash: "bbbbbbb", author: "Bruno Costa", authorTurma: "202",
        message: "Presente: Bruno Costa", timestamp: "2026-10-24T00:00:01.000Z",
        filesChanged: ["chamada.txt"],
      },
      {
        id: "commit-ana", hash: "aaaaaaa", author: "Ana Silva", authorTurma: "201",
        message: "Presente: Ana Silva", timestamp: "2026-10-24T00:00:00.000Z",
        filesChanged: ["chamada.txt"],
      },
      {
        id: "commit-fantasma", hash: "fffffff", author: "Fantasma", authorTurma: "Turma-X",
        message: "Push de turma desconhecida", timestamp: "2026-10-24T00:00:03.000Z",
        filesChanged: ["chamada.txt"],
      },
      {
        id: "commit-init-001", hash: "a1b2c3d", author: "Prof. Augusto", authorTurma: "Docente",
        message: "Initial commit", timestamp: "2026-10-23T00:00:00.000Z",
        filesChanged: ["README.md", "chamada.txt"],
      },
    ],
    updatedAt: "2026-10-24T00:00:00.000Z",
  };
}

test("classifyChamadaLine: token de turma decide, resto vai para legado ou modelo", () => {
  assert.equal(classifyChamadaLine("- Ana Silva - 201"), "201");
  assert.equal(classifyChamadaLine("- Bruno Costa - 202"), "202");
  assert.equal(classifyChamadaLine("- Duda Lima - 201/202"), "legacy");
  assert.equal(classifyChamadaLine("- Sem Turma Nenhuma"), "legacy");
  // "2024" não é o token 202 (borda de palavra): não casa por engano.
  assert.equal(classifyChamadaLine("- Formando em 2024 sem turma"), "legacy");
  assert.equal(classifyChamadaLine("========================================"), "template");
  assert.equal(classifyChamadaLine("       LISTA DE PRESENÇA - TURMA A"), "template");
  assert.equal(classifyChamadaLine("Instruções: Adicione seu nome"), "template");
  assert.equal(classifyChamadaLine("- [Docente] Prof. Augusto - Orientador"), "template");
  assert.equal(classifyChamadaLine(""), "template");
});

test("partitionChamadaContent: separa linhas e conta o modelo à parte", () => {
  const { lines201, lines202, legacyLines, templateLinesSkipped } =
    partitionChamadaContent(oldRepoFixture().files["chamada.txt"]);
  assert.deepEqual(lines201, ["- Ana Silva - 201", "- Carla Dias - 201"]);
  assert.deepEqual(lines202, ["- Bruno Costa - 202"]);
  assert.deepEqual(legacyLines, [
    "- Sem Turma Nenhuma",
    "- Duda Lima - 201/202",
    "- Formando em 2024 sem turma",
  ]);
  assert.equal(templateLinesSkipped, 6);
});

test("partitionLegacyRepository: listas, commits e seed sem duplicar nem vazar", () => {
  const { repositories, legacyLines, stats } = partitionLegacyRepository(oldRepoFixture());

  const chamada201 = repositories["201"].files["chamada.txt"];
  const chamada202 = repositories["202"].files["chamada.txt"];
  assert.match(chamada201, /Ana Silva - 201/);
  assert.match(chamada201, /Carla Dias - 201/);
  assert.doesNotMatch(chamada201, /Bruno Costa/);
  assert.match(chamada202, /Bruno Costa - 202/);
  assert.doesNotMatch(chamada202, /Ana Silva|Carla Dias/);
  // Cabeçalho próprio de cada turma + docente presentes nos dois modelos.
  assert.match(chamada201, /LISTA DE PRESENÇA - TURMA 201/);
  assert.match(chamada202, /LISTA DE PRESENÇA - TURMA 202/);
  assert.equal((chamada201.match(/Prof\. Augusto/g) ?? []).length, 1);
  assert.equal((chamada202.match(/Prof\. Augusto/g) ?? []).length, 1);
  // Legado fora das duas listas.
  assert.equal(legacyLines.length, 3);
  assert.doesNotMatch(chamada201, /Sem Turma Nenhuma|201\/202|2024/);
  assert.doesNotMatch(chamada202, /Sem Turma Nenhuma|201\/202|2024/);

  // Commits: por authorTurma, ordem preservada, seed novo único.
  assert.deepEqual(
    repositories["201"].commits.map((c) => c.id),
    ["commit-carla", "commit-ana", "commit-init-201"]
  );
  assert.deepEqual(
    repositories["202"].commits.map((c) => c.id),
    ["commit-bruno", "commit-init-202"]
  );
  assert.equal(repositories["201"].id, "repo-turma-201");
  assert.equal(repositories["201"].turma, "201");
  assert.equal(repositories["202"].turma, "202");

  assert.deepEqual(stats, {
    lines201: 2,
    lines202: 1,
    legacyLines: 3,
    templateLinesSkipped: 6,
    commits201: 2,
    commits202: 1,
    legacyCommits: 1,
    seedCommitsSkipped: 1,
  });
});

test("storage por turma: push na 201 não altera a lista nem os commits da 202", () => {
  resetAllData();
  const base201 = getStoredRepository("201").files["chamada.txt"];
  const base202 = getStoredRepository("202").files["chamada.txt"];

  const commit201 = {
    id: "commit-part-201", hash: "1111111", author: "Ana Silva", authorTurma: "201",
    message: "Presente: Ana Silva", timestamp: "2026-10-24T00:00:00.000Z",
    filesChanged: ["chamada.txt"],
  };
  const after201 = pushCommitToRepo(commit201, {
    "chamada.txt": `${base201}- Ana Silva - 201\n`,
  }, "201");
  assert.match(after201.files["chamada.txt"], /Ana Silva - 201/);
  assert.equal(getStoredRepository("202").files["chamada.txt"], base202);
  assert.ok(!getStoredRepository("202").commits.some((c) => c.id === "commit-part-201"));

  const commit202 = {
    id: "commit-part-202", hash: "2222222", author: "Bruno Costa", authorTurma: "202",
    message: "Presente: Bruno Costa", timestamp: "2026-10-24T00:00:01.000Z",
    filesChanged: ["chamada.txt"],
  };
  const after202 = pushCommitToRepo(commit202, {
    "chamada.txt": `${base202}- Bruno Costa - 202\n`,
  }, "202");
  assert.match(after202.files["chamada.txt"], /Bruno Costa - 202/);
  assert.doesNotMatch(after202.files["chamada.txt"], /Ana Silva/);
  assert.doesNotMatch(getStoredRepository("201").files["chamada.txt"], /Bruno Costa/);

  // Dois alunos de turmas diferentes não veem o nome um do outro.
  const repos = getStoredRepositories();
  assert.match(repos["201"].files["chamada.txt"], /Ana Silva/);
  assert.doesNotMatch(repos["201"].files["chamada.txt"], /Bruno Costa/);
  assert.match(repos["202"].files["chamada.txt"], /Bruno Costa/);
  assert.doesNotMatch(repos["202"].files["chamada.txt"], /Ana Silva/);

  resetAllData();
});

test("conclusão pontua pela lista da própria turma (70 dos 4 passos)", () => {
  resetAllData();
  const base201 = getStoredRepository("201").files["chamada.txt"];
  const commit = {
    id: "commit-conclusao", hash: "3333333", author: "Ana Silva", authorTurma: "201",
    message: "Presente: Ana Silva", timestamp: "2026-10-24T00:00:00.000Z",
    filesChanged: ["chamada.txt"],
  };
  const merged = pushCommitToRepo(commit, {
    "chamada.txt": `${base201}- Ana Silva - 201\n`,
  }, "201");
  // O nome está na lista da própria turma após o push — e só nela.
  assert.match(merged.files["chamada.txt"], /Ana Silva - 201/);
  assert.doesNotMatch(getStoredRepository("202").files["chamada.txt"], /Ana Silva/);
  // Os 4 passos valem 70 (10 + 20 + 20 + 20) — o resto da nota não vem daqui.
  const breakdown = computeScoreBreakdown({
    hasCloned: true, hasEdited: true, hasCommitted: true, hasPushed: true,
  });
  assert.equal(breakdown.completion, 70);
  resetAllData();
});

test("saveRepository sem turma conhecida não escreve em nenhuma turma", () => {
  resetAllData();
  const before201 = getStoredRepository("201").files["chamada.txt"];
  const before202 = getStoredRepository("202").files["chamada.txt"];
  saveRepository({
    ...oldRepoFixture(),
    files: { "chamada.txt": "lista invasora\n" },
  });
  assert.equal(getStoredRepository("201").files["chamada.txt"], before201);
  assert.equal(getStoredRepository("202").files["chamada.txt"], before202);
  resetAllData();
});
