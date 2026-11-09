// Runner dos testes unitários do gitEngine + activity (node:test nativo).
//
// Por que compilar: src/lib/gitEngine.ts e src/lib/activity.ts são
// TypeScript e o projeto usa alias `@/` + moduleResolution bundler; em
// vez de depender do type-stripping do Node 24 resolver isso, este
// runner compila só a lib (gitEngine + activity + types + storage +
// initialData + partitionChamada, sem tocar em src/) com o tsc do projeto para um diretório
// temporário fora do repo, roda o node:test contra o JS compilado e
// remove o diretório temporário ao final. Nenhuma nova dependência,
// nenhum arquivo gerado dentro do repo.
// storage entra para testar o merge por linhas do push de verdade.
// activity entra para travar as regras pedagógicas puras (modos, nota
// sem receita, alerta "só copiou", glossário) — ver activity.test.mjs.
//
// Uso: `npm run test:unit`
// Saída: exit code do node:test (0 = todos os testes passaram).

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = mkdtempSync(join(tmpdir(), "trabalhoGit-gitEngine-"));

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
      "src/lib/studentIdentity.ts",
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
    console.error("❌ Falha ao compilar src/lib/gitEngine.ts para os testes unitários.");
    process.exit(tsc.status ?? 1);
  }

  const tests = spawnSync("node", ["--test", "scripts/gitEngine.test.mjs"], {
    cwd: root,
    stdio: "inherit",
    shell: false,
    env: { ...process.env, GITENGINE_COMPILED: join(buildDir, "gitEngine.js") },
  });
  if (tests.status !== 0) process.exit(tests.status ?? 1);

  const activityTests = spawnSync("node", ["--test", "scripts/activity.test.mjs"], {
    cwd: root,
    stdio: "inherit",
    shell: false,
    env: { ...process.env, ACTIVITY_COMPILED: join(buildDir, "activity.js") },
  });
  if (activityTests.status !== 0) process.exit(activityTests.status ?? 1);

  const partitionTests = spawnSync("node", ["--test", "scripts/partition.test.mjs"], {
    cwd: root,
    stdio: "inherit",
    shell: false,
    env: { ...process.env, PARTITION_COMPILED: join(buildDir, "partitionChamada.js") },
  });
  if (partitionTests.status !== 0) process.exit(partitionTests.status ?? 1);

  const teacherTokenTests = spawnSync("node", ["--test", "scripts/teacherToken.test.mjs"], {
    cwd: root,
    stdio: "inherit",
    shell: false,
    env: { ...process.env, AUTH_COMPILED: join(buildDir, "auth.js") },
  });
  if (teacherTokenTests.status !== 0) process.exit(teacherTokenTests.status ?? 1);

  const storageMergeTests = spawnSync("node", ["--test", "scripts/storageMerge.test.mjs"], {
    cwd: root,
    stdio: "inherit",
    shell: false,
    env: { ...process.env, STORAGE_COMPILED: join(buildDir, "storage.js") },
  });
  if (storageMergeTests.status !== 0) process.exit(storageMergeTests.status ?? 1);

  const reidentifyTests = spawnSync("node", ["--test", "scripts/reidentify.test.mjs"], {
    cwd: root,
    stdio: "inherit",
    shell: false,
    env: { ...process.env, STUDENTIDENTITY_COMPILED: join(buildDir, "studentIdentity.js") },
  });
  process.exit(reidentifyTests.status ?? 1);
} finally {
  rmSync(buildDir, { recursive: true, force: true });
}
