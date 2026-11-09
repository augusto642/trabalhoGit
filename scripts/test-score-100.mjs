// Runner do walkthrough de 100% (scripts/score-100.test.mjs).
//
// Por que compilar: mesmo motivo de scripts/test-unit.mjs —
// src/lib/*.ts usa alias `@/` + moduleResolution bundler; este
// runner compila só a lib (gitEngine + activity + types + storage +
// initialData + partitionChamada + auth, sem tocar em src/) com o
// tsc do projeto para um diretório temporário fora do repo, roda o
// node:test contra o JS compilado e remove o diretório ao final.
// Nenhuma nova dependência, nenhum arquivo gerado dentro do repo.
//
// Uso: `npm run test:score-100`
// Saída: exit code do node:test (0 = o aluno consegue chegar a 100%).

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = mkdtempSync(join(tmpdir(), "trabalhoGit-score-100-"));

try {
  const tsc = spawnSync(
    "npx",
    [
      "tsc",
      "src/lib/gitEngine.ts",
      "src/lib/activity.ts",
      "src/lib/types.ts",
      "src/lib/storage.ts",
      "src/lib/initialData.ts",
      "src/lib/partitionChamada.ts",
      "src/lib/auth.ts",
      "--outDir",
      buildDir,
      "--module",
      "nodenext",
      "--moduleResolution",
      "nodenext",
      "--target",
      "es2022",
      "--skipLibCheck",
    ],
    { cwd: root, stdio: "inherit", shell: true },
  );
  if (tsc.status !== 0) {
    console.error("❌ Falha ao compilar src/lib para o teste de 100%.");
    process.exit(tsc.status ?? 1);
  }

  const tests = spawnSync("node", ["--test", "scripts/score-100.test.mjs"], {
    cwd: root,
    stdio: "inherit",
    shell: false,
    env: {
      ...process.env,
      GITENGINE_COMPILED: join(buildDir, "gitEngine.js"),
      ACTIVITY_COMPILED: join(buildDir, "activity.js"),
    },
  });
  process.exit(tests.status ?? 1);
} finally {
  rmSync(buildDir, { recursive: true, force: true });
}
