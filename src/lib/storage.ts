import { Repository, Student, CommandLog, Commit } from "./types";
import {
  INITIAL_REPOSITORIES,
  Turma,
  initialRepositoryForTurma,
  isKnownTurma,
  repositoryTurmaOf,
} from "./initialData";
import { computeScore, mergeLinesByUnion } from "./gitEngine";
import { partitionLegacyRepository } from "./partitionChamada";

export { mergeLinesByUnion };

/**
 * Merge de arquivos no push: a chamada.txt central faz união por linhas
 * (ordem preservada, sem duplicar linhas iguais) — o último push não pode
 * apagar os nomes dos colegas. Demais arquivos seguem overwrite normal.
 * O merge acontece SEMPRE dentro da lista da turma do push: nunca cruza
 * turmas (o chamador passa a turma, e o repositório lido/escrito é só o
 * dela).
 */
export const mergeRepoFiles = (
  existingFiles: Record<string, string>,
  incomingFiles: Record<string, string>
): Record<string, string> => {
  const merged: Record<string, string> = { ...existingFiles };
  for (const [name, content] of Object.entries(incomingFiles)) {
    if (name === "chamada.txt" && existingFiles[name] !== undefined) {
      merged[name] = mergeLinesByUnion(existingFiles[name], content);
    } else {
      merged[name] = content;
    }
  }
  return merged;
};

/**
 * Aplica exclusões de um push ao dicionário do repositório da turma.
 * EXCEÇÃO CONSCIENTE: `chamada.txt` nunca é apagada pelo push — ela é a
 * lista compartilhada da turma (merge por união de linhas); a exclusão
 * local do aluno continua valendo no computador dele, mas o push não
 * apaga a lista de todos os colegas. Qualquer outro arquivo some do
 * repositório da turma quando o push traz a exclusão commitada.
 */
export const applyPushDeletions = (
  files: Record<string, string>,
  deletedFiles: string[]
): Record<string, string> => {
  const next: Record<string, string> = { ...files };
  for (const name of deletedFiles) {
    if (name !== "chamada.txt") delete next[name];
  }
  return next;
};

/**
 * Uma linha da chamada "é do aluno" quando o nome completo dele aparece
 * nela com fronteira dos dois lados — substring pura NÃO basta (bug R1:
 * reiniciar como "Ana Teste" apagava a linha de "Ana Teste Silva").
 * Fronteira esquerda: início da linha ou caractere não alfanumérico
 * antes do nome. Fronteira direita: fim da linha, ou o resto (sem os
 * espaços iniciais) começando por caractere que NÃO é letra — número de
 * turma ("Ana Teste 201"), traço ("Ana Teste - 201") e parêntese
 * ("Ana Teste (Presente)") passam; sobrenome ("Ana Teste Silva") não.
 * Formatos reais cobertos: "Ana Teste", "- [Aluno] Ana Teste",
 * "- [Aluno] Ana Teste - 201 (Presente)", "Ana Teste - 201".
 * (O gate de crédito do push, lineContainsFullName, mantém includes —
 * lá, presença basta; aqui, apagar exige autoria.)
 */
export const lineBelongsToStudent = (line: string, fullName: string): boolean => {
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const isLetter = (ch: string) => /[\p{L}]/u.test(ch);
  const isDigit = (ch: string) => /[0-9]/.test(ch);
  const l = normalize(line);
  const name = normalize(fullName);
  if (!name) return false;
  let idx = l.indexOf(name);
  while (idx !== -1) {
    const leftOk = idx === 0 || (!isLetter(l[idx - 1]) && !isDigit(l[idx - 1]));
    const rest = l.slice(idx + name.length).replace(/^\s+/, "");
    const rightOk = rest === "" || !isLetter(rest[0]);
    if (leftOk && rightOk) return true;
    idx = l.indexOf(name, idx + 1);
  }
  return false;
};

/**
 * Reinício do aluno no repositório da turma: remove SÓ as contribuições
 * dele — os commits dele (igualdade exata de autor) e as linhas da
 * chamada.txt que são dele (lineBelongsToStudent, com fronteira — um
 * homônimo como "Ana Teste Silva" NÃO é podado pelo restart de
 * "Ana Teste"). Os colegas não são tocados.
 */
export const removeStudentContributions = (
  repo: Repository,
  studentName: string
): Repository => {
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const name = normalize(studentName);
  const files: Record<string, string> = { ...repo.files };
  const chamada = files["chamada.txt"];
  if (chamada !== undefined && name) {
    files["chamada.txt"] = chamada
      .split("\n")
      .filter((line) => !lineBelongsToStudent(line, studentName))
      .join("\n");
  }
  return {
    ...repo,
    files,
    commits: repo.commits.filter((c) => normalize(c.author) !== name),
    updatedAt: new Date().toISOString(),
  };
};

const REPO_STORAGE_KEY = (turma: string) => `gitsim_repository_${turma}`;
const LEGACY_REPO_STORAGE_KEY = "gitsim_repository";
const LEGACY_LINES_STORAGE_KEY = "gitsim_legacy_chamada";
const STUDENTS_STORAGE_KEY = "gitsim_students";
const LOGS_STORAGE_KEY = "gitsim_logs";
const CURRENT_STUDENT_KEY = "gitsim_current_student";

// Memória do servidor para fallback em APIs — um repositório por turma.
let serverRepositories: Record<string, Repository> = {
  "201": initialRepositoryForTurma("201"),
  "202": initialRepositoryForTurma("202"),
};
let serverLegacyLines: string[] = [];
let serverStudents: Student[] = [];
let serverLogs: CommandLog[] = [];

// Helper para verificar se está no browser
const isBrowser = () => typeof window !== "undefined";

/**
 * Migração do formato antigo (repositório único na chave
 * `gitsim_repository`) para o formato por turma. Roda uma vez, no
 * navegador, na primeira leitura após a atualização — e só quando a
 * chave antiga existe. Linhas sem turma reconhecível NÃO vão para
 * nenhuma turma: ficam em `gitsim_legacy_chamada`, visíveis só ao
 * professor. Falha de leitura não apaga a chave antiga (nova tentativa
 * na próxima leitura).
 */
let legacyMigrationDone = false;
function migrateLegacyLocalStorage(): void {
  if (legacyMigrationDone || !isBrowser()) return;
  legacyMigrationDone = true;
  try {
    const raw = localStorage.getItem(LEGACY_REPO_STORAGE_KEY);
    if (!raw) return;
    const oldRepo = JSON.parse(raw) as Repository;
    if (repositoryTurmaOf(oldRepo)) {
      // Chave antiga com id novo (não deveria existir): só limpa.
      localStorage.removeItem(LEGACY_REPO_STORAGE_KEY);
      return;
    }
    const { repositories, legacyLines, stats } = partitionLegacyRepository(oldRepo);
    for (const turma of ["201", "202"] as const) {
      serverRepositories[turma] = repositories[turma];
      localStorage.setItem(REPO_STORAGE_KEY(turma), JSON.stringify(repositories[turma]));
    }
    saveLegacyLines(legacyLines);
    localStorage.removeItem(LEGACY_REPO_STORAGE_KEY);
    console.info("[gitsim] Migração da chamada por turma concluída:", stats);
  } catch {
    legacyMigrationDone = false;
  }
}

export const getStoredRepositories = (): Record<Turma, Repository> => {
  migrateLegacyLocalStorage();
  if (isBrowser()) {
    try {
      const out: Record<string, Repository> = {};
      for (const turma of ["201", "202"] as const) {
        const data = localStorage.getItem(REPO_STORAGE_KEY(turma));
        out[turma] = data ? (JSON.parse(data) as Repository) : serverRepositories[turma];
      }
      return out as Record<Turma, Repository>;
    } catch {
      // fallback
    }
  }
  return serverRepositories as Record<Turma, Repository>;
};

/**
 * Repositório da turma. Turma desconhecida cai no 201 só na LEITURA
 * (o aluno com turma antiga é forçado a escolher de novo no login, então
 * um aluno identificado sempre tem 201/202); ESCRITAS exigem turma
 * conhecida (saveRepository descarta sem turma, a API rejeita com 400).
 */
export const getStoredRepository = (turma: string): Repository => {
  const repos = getStoredRepositories();
  return isKnownTurma(turma) ? repos[turma] : repos["201"];
};

/**
 * Merge de um snapshot de repositório sobre o estado atual da turma
 * (correção D-NOVO-1, 29/10/2026). O POST /api/repository recebia o
 * snapshot do cliente e o salvava por cima do estado do servidor — sob
 * concorrência, o snapshot de um aluno estava obsoleto no instante do
 * envio e apagava os commits dos colegas que pousaram depois (12 pushes
 * paralelos → só ~3 sobreviviam, sem erro). Merge NUNCA apaga:
 * - commits: união por id (os do snapshot primeiro, na ordem dele, e
 *   depois os do estado atual que o snapshot não tem);
 * - arquivos: mergeRepoFiles (chamada.txt por união de linhas; demais
 *   arquivos seguem overwrite pelo snapshot, igual ao push).
 * Remoção deliberada NÃO passa por aqui: o Reiniciar usa o campo
 * `pruneStudent` do POST (ver route.ts), que poda só aquele aluno
 * DEPOIS do merge, sobre o estado fresco. Sem isso, o merge
 * ressuscitaria os commits podados.
 * Residual conhecido: para arquivos que não são chamada.txt, o conteúdo
 * segue last-writer-wins (mesma semântica do push) — o defeito fechado
 * aqui é perda de commit/linha, não conflito de conteúdo de arquivo.
 */
export const mergeRepository = (
  existing: Repository,
  incoming: Repository
): Repository => {
  const incomingIds = new Set(incoming.commits.map((c) => c.id));
  return {
    // S6 (30/10/2026): os metadados são CANÔNICOS do servidor — o
    // snapshot do cliente nunca mais renomeia o repositório nem troca
    // owner/description/URL. Nenhum fluxo legítimo muda metadados (o
    // cliente só envia arquivos + commits); o que o merge aceita do
    // snapshot são files e commits, como antes.
    id: existing.id,
    turma: existing.turma,
    name: existing.name,
    owner: existing.owner,
    description: existing.description,
    defaultBranch: existing.defaultBranch,
    cloneUrl: existing.cloneUrl,
    files: mergeRepoFiles(existing.files, incoming.files),
    commits: [
      ...incoming.commits,
      ...existing.commits.filter((c) => !incomingIds.has(c.id)),
    ],
    updatedAt: new Date().toISOString(),
  };
};

/** Salva o repositório da turma dele. Sem turma reconhecível: não escreve. */
export const saveRepository = (repo: Repository): void => {
  const turma = repositoryTurmaOf(repo);
  if (!turma) {
    console.warn("[gitsim] saveRepository ignorado: repositório sem turma conhecida", repo.id);
    return;
  }
  serverRepositories[turma] = repo;
  if (isBrowser()) {
    try {
      localStorage.setItem(REPO_STORAGE_KEY(turma), JSON.stringify(repo));
      window.dispatchEvent(new CustomEvent("gitsim-repo-updated", { detail: repo }));
    } catch {
      // fallback
    }
  }
};

/** Linhas da chamada antiga sem turma reconhecível — só o professor as vê. */
export const getLegacyLines = (): string[] => {
  if (isBrowser()) {
    try {
      const data = localStorage.getItem(LEGACY_LINES_STORAGE_KEY);
      if (data) return JSON.parse(data) as string[];
    } catch {
      // fallback
    }
  }
  return serverLegacyLines;
};

export const saveLegacyLines = (lines: string[]): void => {
  serverLegacyLines = lines;
  if (isBrowser()) {
    try {
      localStorage.setItem(LEGACY_LINES_STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // fallback
    }
  }
};

export const getStoredStudents = (): Student[] => {
  if (isBrowser()) {
    try {
      const data = localStorage.getItem(STUDENTS_STORAGE_KEY);
      if (data) return JSON.parse(data);
    } catch {
      // fallback
    }
  }
  return serverStudents;
};

export const saveStudent = (student: Student): void => {
  const students = getStoredStudents();
  const index = students.findIndex((s) => s.id === student.id);
  if (index >= 0) {
    students[index] = { ...students[index], ...student, lastActive: new Date().toISOString() };
  } else {
    students.push(student);
  }
  serverStudents = students;
  if (isBrowser()) {
    try {
      localStorage.setItem(STUDENTS_STORAGE_KEY, JSON.stringify(students));
      window.dispatchEvent(new CustomEvent("gitsim-students-updated", { detail: students }));
    } catch {
      // fallback
    }
  }
};

export const getStoredLogs = (): CommandLog[] => {
  if (isBrowser()) {
    try {
      const data = localStorage.getItem(LOGS_STORAGE_KEY);
      if (data) return JSON.parse(data);
    } catch {
      // fallback
    }
  }
  return serverLogs;
};

export const addCommandLog = (log: CommandLog): void => {
  const logs = getStoredLogs();
  logs.unshift(log); // mais recente primeiro
  // Teto também na memória do servidor (antes só no localStorage/Redis):
  // sem ele, 50 alunos poluindo o log crescem a memória sem limite (P7).
  serverLogs = logs.slice(0, 500);
  if (isBrowser()) {
    try {
      localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(logs.slice(0, 500))); // guarda até 500 logs
      window.dispatchEvent(new CustomEvent("gitsim-logs-updated", { detail: log }));
    } catch {
      // fallback
    }
  }
};

/**
 * Retrocompatibilidade na leitura do cliente (correção D1): registros
 * antigos no localStorage trazem o campo legado `recoveredErrorConcepts`
 * em vez de `masteredConcepts`. A união dele aqui — espelhando
 * normalizeLegacyMasteredConcepts do servidor (db.ts) e a validação do
 * POST (validate.ts) — faz a nota exibida já vir correta no primeiro
 * render após o reload, sem depender do POST de re-registro (resposta
 * descartada no GitSimContext) nem de o aluno redemonstrar os conceitos.
 * Sem a união, o componente de domínio (até −10 pts) sumia da tela do
 * aluno e do TaskCompletionModal. A nota só é recalculada quando a união
 * acrescenta conceito — o score gravado no registro legado não contava
 * o domínio; se nada muda, o score original é preservado.
 */
export const normalizeLegacyMasteredConcepts = (student: Student): Student => {
  const legacy = (student as Student & { recoveredErrorConcepts?: unknown })
    .recoveredErrorConcepts;
  if (!Array.isArray(legacy)) return student;
  const legacyConcepts = legacy.filter((v): v is string => typeof v === "string");
  const rest = { ...student } as Student & { recoveredErrorConcepts?: string[] };
  delete rest.recoveredErrorConcepts;
  const mastered = [
    ...new Set([...(rest.masteredConcepts ?? []), ...legacyConcepts]),
  ];
  const normalized: Student = { ...rest, masteredConcepts: mastered };
  if (mastered.length > (student.masteredConcepts ?? []).length) {
    normalized.score = computeScore(normalized);
  }
  return normalized;
};

export const getCurrentStudent = (): Student | null => {
  if (isBrowser()) {
    try {
      const data = localStorage.getItem(CURRENT_STUDENT_KEY);
      if (data) return normalizeLegacyMasteredConcepts(JSON.parse(data) as Student);
    } catch {
      // fallback
    }
  }
  return null;
};

export const setCurrentStudent = (student: Student | null): void => {
  if (isBrowser()) {
    try {
      if (student) {
        localStorage.setItem(CURRENT_STUDENT_KEY, JSON.stringify(student));
        saveStudent(student);
      } else {
        localStorage.removeItem(CURRENT_STUDENT_KEY);
      }
      window.dispatchEvent(new CustomEvent("gitsim-student-session", { detail: student }));
    } catch {
      // fallback
    }
  }
};

/** Reset GLOBAL (decisão de produto desta tarefa): apaga as duas turmas. */
export const resetAllData = (): void => {
  serverRepositories = {
    "201": initialRepositoryForTurma("201"),
    "202": initialRepositoryForTurma("202"),
  };
  serverLegacyLines = [];
  serverStudents = [];
  serverLogs = [];
  if (isBrowser()) {
    try {
      for (const turma of ["201", "202"] as const) {
        localStorage.setItem(
          REPO_STORAGE_KEY(turma),
          JSON.stringify(INITIAL_REPOSITORIES[turma])
        );
      }
      localStorage.setItem(LEGACY_LINES_STORAGE_KEY, JSON.stringify([]));
      localStorage.setItem(STUDENTS_STORAGE_KEY, JSON.stringify([]));
      localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify([]));
      window.dispatchEvent(
        new CustomEvent("gitsim-repo-updated", { detail: INITIAL_REPOSITORIES["201"] })
      );
      window.dispatchEvent(new CustomEvent("gitsim-students-updated", { detail: [] }));
      window.dispatchEvent(new CustomEvent("gitsim-logs-updated", { detail: null }));
    } catch {
      // fallback
    }
  }
};

// Adiciona novo commit e atualiza o repo DA TURMA (chamada.txt com merge
// por linhas, só dentro da lista da turma — a outra turma não é lida nem
// escrita aqui). Push idempotente por id: o handler do VSCodeView escreve
// duas vezes (cópia local + POST /api/repository, e POST /api/git/push)
// — sem dedup, o mesmo commit aparecia 2 vezes no repo da turma no modo
// memória (o caminho do banco já dedupava). Re-push do mesmo id não
// duplica o histórico, em qualquer ordem de chegada das duas escritas.
// (D-NOVO-1: o POST /api/repository também mescla agora — ver
// mergeRepository — então a escrita via snapshot não apaga mais commits
// alheios; o dedup por id aqui continua valendo.)
export const pushCommitToRepo = (
  commit: Commit,
  updatedFiles: Record<string, string>,
  turma: string,
  deletedFiles: string[] = []
): Repository => {
  const repo = getStoredRepository(turma);
  const newRepo: Repository = {
    ...repo,
    files: applyPushDeletions(mergeRepoFiles(repo.files, updatedFiles), deletedFiles),
    commits: [commit, ...repo.commits.filter((c) => c.id !== commit.id)],
    updatedAt: new Date().toISOString(),
  };
  saveRepository(newRepo);
  return newRepo;
};
