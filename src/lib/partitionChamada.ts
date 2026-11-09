import { Repository } from "./types";
import { INITIAL_REPOSITORIES, Turma, isKnownTurma, initialRepositoryForTurma } from "./initialData";

/**
 * Partição da lista de chamada por turma — funções puras, sem I/O.
 *
 * Regra de classificação de cada linha do chamada.txt antigo:
 * - template (cabeçalho, separadores, instruções, linha do docente):
 *   pertence ao modelo, não a nenhum aluno — descartada aqui porque cada
 *   repositório novo já nasce com o próprio cabeçalho e a linha do
 *   docente. Não é dado de aluno, não vai para a lista legada.
 * - "201" / "202": a linha menciona exatamente um token de turma
 *   (`\b201\b` / `\b202\b` — "2024" não casa, por causa da borda de
 *   palavra) e vai para a lista daquela turma, sem tocar na outra.
 * - legacy: qualquer outra linha (menciona as duas turmas, ou nenhuma).
 *   Linhas legadas NUNCA são misturadas em nenhuma turma: voltam no
 *   campo `legacyLines`, visível só ao professor.
 *
 * Commits: vão para a turma do `authorTurma` quando conhecida; o commit
 * inicial do docente é pulado (cada repositório novo já tem o seu seed);
 * commits com autor sem turma reconhecível são contados como legados e
 * não entram em nenhum repositório (o histórico por turma não vaza).
 */

export type LineClass = Turma | "legacy" | "template";

function isTemplateLine(line: string): boolean {
  const t = line.trim();
  if (t === "") return true;
  if (/^=+$/.test(t)) return true;
  if (/^LISTA DE PRESENÇA/i.test(t)) return true;
  if (/^Instruções:/i.test(t)) return true;
  if (/\[Docente\]/.test(t)) return true;
  return false;
}

export function classifyChamadaLine(line: string): LineClass {
  if (isTemplateLine(line)) return "template";
  const has201 = /\b201\b/.test(line);
  const has202 = /\b202\b/.test(line);
  if (has201 && !has202) return "201";
  if (has202 && !has201) return "202";
  return "legacy";
}

export interface PartitionedLines {
  lines201: string[];
  lines202: string[];
  legacyLines: string[];
  templateLinesSkipped: number;
}

export function partitionChamadaContent(content: string): PartitionedLines {
  const lines201: string[] = [];
  const lines202: string[] = [];
  const legacyLines: string[] = [];
  let templateLinesSkipped = 0;
  // O "" final de um split de texto terminado em \n NÃO é uma linha
  // (mesmo artefato que o merge por linhas já trata).
  const rawLines = content.split("\n");
  if (rawLines.length > 0 && rawLines[rawLines.length - 1] === "") rawLines.pop();
  for (const line of rawLines) {
    const c = classifyChamadaLine(line);
    if (c === "template") templateLinesSkipped++;
    else if (c === "201") lines201.push(line);
    else if (c === "202") lines202.push(line);
    else legacyLines.push(line);
  }
  return { lines201, lines202, legacyLines, templateLinesSkipped };
}

export interface PartitionStats {
  lines201: number;
  lines202: number;
  legacyLines: number;
  templateLinesSkipped: number;
  commits201: number;
  commits202: number;
  legacyCommits: number;
  seedCommitsSkipped: number;
}

export interface PartitionResult {
  repositories: Record<Turma, Repository>;
  legacyLines: string[];
  stats: PartitionStats;
}

/** Particiona um repositório do formato antigo (único) nos dois por turma. */
export function partitionLegacyRepository(repo: Repository): PartitionResult {
  const repositories: Record<Turma, Repository> = {
    "201": initialRepositoryForTurma("201"),
    "202": initialRepositoryForTurma("202"),
  };

  const chamada = repo.files["chamada.txt"] ?? "";
  const { lines201, lines202, legacyLines, templateLinesSkipped } =
    partitionChamadaContent(chamada);

  // Anexa as linhas no fim da lista da turma, preservando a ordem e sem
  // duplicar linhas já presentes no modelo.
  const appendLines = (turma: Turma, lines: string[]) => {
    if (lines.length === 0) return;
    const target = repositories[turma];
    const base = target.files["chamada.txt"];
    const withNewline = base.endsWith("\n") ? base : `${base}\n`;
    const fresh = lines.filter((l) => !withNewline.includes(`${l}\n`));
    if (fresh.length > 0) {
      target.files["chamada.txt"] = `${withNewline}${fresh.join("\n")}\n`;
    }
  };
  appendLines("201", lines201);
  appendLines("202", lines202);

  // Commits: ordem original (mais recente primeiro) + seed no fim.
  const collected: Record<Turma, typeof repo.commits> = { "201": [], "202": [] };
  let legacyCommits = 0;
  let seedCommitsSkipped = 0;
  for (const commit of repo.commits) {
    if (commit.authorTurma === "Docente") {
      seedCommitsSkipped++;
      continue;
    }
    if (isKnownTurma(commit.authorTurma)) {
      collected[commit.authorTurma].push(commit);
    } else {
      legacyCommits++;
    }
  }
  for (const turma of ["201", "202"] as const) {
    const target = repositories[turma];
    target.commits = [...collected[turma], ...target.commits];
    target.updatedAt = new Date().toISOString();
  }

  return {
    repositories,
    legacyLines,
    stats: {
      lines201: lines201.length,
      lines202: lines202.length,
      legacyLines: legacyLines.length,
      templateLinesSkipped,
      commits201: collected["201"].length,
      commits202: collected["202"].length,
      legacyCommits,
      seedCommitsSkipped,
    },
  };
}

/** Mapa inicial vazio (cópias novas) — usado pelo reset e pelos testes. */
export function freshInitialRepositories(): Record<Turma, Repository> {
  return {
    "201": initialRepositoryForTurma("201"),
    "202": initialRepositoryForTurma("202"),
  };
}

export { INITIAL_REPOSITORIES };
