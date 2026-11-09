import { Repository } from "./types";

/**
 * Turmas do projeto — fonte única da partição por turma. O valor salvo
 * no login é sempre "201" ou "202" (StudentIdentificationModal); qualquer
 * outro valor é tratado como desconhecido e nunca vira dono de escrita.
 */
export const TURMAS = ["201", "202"] as const;
export type Turma = (typeof TURMAS)[number];

export function isKnownTurma(value: unknown): value is Turma {
  return value === "201" || value === "202";
}

/**
 * Turma de um repositório: campo `turma` quando presente, senão o sufixo
 * do id legado (`repo-turma-201` / `repo-turma-202`). Retorna null para
 * repositórios do formato antigo (id `repo-turma-a`, sem turma) — esses
 * passam pela migração (partitionChamada) antes de qualquer escrita, e
 * nunca são salvos como se fossem de uma turma.
 */
export function repositoryTurmaOf(repo: Repository): Turma | null {
  if (isKnownTurma(repo.turma)) return repo.turma;
  if (repo.id === "repo-turma-201") return "201";
  if (repo.id === "repo-turma-202") return "202";
  return null;
}

function buildInitialRepository(turma: Turma): Repository {
  return {
    id: `repo-turma-${turma}`,
    turma,
    name: `chamada-turma-${turma}`,
    owner: "prof-augusto",
    description:
      "Repositório oficial para a chamada de presença e introdução prática aos comandos Git & fluxo GitHub.",
    defaultBranch: "main",
    cloneUrl: `https://gitsim.edu/prof-augusto/chamada-turma-${turma}.git`,
    files: {
      // P2 — sem receita numerada e sem nenhum comando git: o passo a
      // passo vive só no Guia da atividade da aba VS Code.
      "README.md": `# 📚 Chamada de Presença - Turma ${turma}

Bem-vindo(a) ao repositório oficial da disciplina!

Este repositório guarda a lista de presença da turma. Cada aluno registra sua presença com uma linha nova em chamada.txt, seguindo o Guia da atividade na aba VS Code.

Abra a aba VS Code e siga o Guia da atividade — lá estão os passos e as micro-explicações.
`,
      "chamada.txt": `========================================
       LISTA DE PRESENÇA - TURMA ${turma}
========================================
Instruções: Adicione seu nome completo e turma nas linhas abaixo:

- [Docente] Prof. Augusto - Orientador
`,
    },
    commits: [
      {
        id: `commit-init-${turma}`,
        hash: "a1b2c3d",
        author: "Prof. Augusto",
        authorTurma: "Docente",
        message: "Initial commit: Configurado README e lista de chamada da turma",
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        filesChanged: ["README.md", "chamada.txt"],
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

/** Repositório inicial de cada turma — cópias independentes. */
export const INITIAL_REPOSITORIES: Record<Turma, Repository> = {
  "201": buildInitialRepository("201"),
  "202": buildInitialRepository("202"),
};

/** Cópia nova do repositório inicial da turma (nunca o objeto compartilhado). */
export function initialRepositoryForTurma(turma: Turma): Repository {
  return JSON.parse(JSON.stringify(INITIAL_REPOSITORIES[turma])) as Repository;
}
