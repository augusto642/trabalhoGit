import { Student, Commit, Repository } from "./types";

export interface VirtualFileTree {
  [path: string]: string; // path relativo a /home/aluno, ex: 'chamada-turma-a/chamada.txt'
}

export interface GitEngineState {
  currentDir: string; // ex: '~' ou '~/chamada-turma-a'
  isRepoCloned: boolean;
  repoFolder: string; // 'chamada-turma-a'
  head: string; // 'main'
  files: VirtualFileTree;
  stagedFiles: Set<string>;
  untrackedFiles: Set<string>;
  modifiedFiles: Set<string>;
  /**
   * Nomes limpos removidos da pasta de trabalho. Um arquivo aqui está
   * excluído; se também estiver em `stagedFiles`, a exclusão está
   * preparada (staged); senão, é uma exclusão ainda não staged. Não há
   * "deleted" derivado de comparação de dicionários: o estado é explícito.
   */
  deletedFiles: Set<string>;
  localCommits: Commit[];
  remoteRepo: Repository;
  student: Student;
  /** Branches conhecidas (a primeira é a default do remoto). */
  branches: string[];
  /** Conteúdo de cada arquivo no momento do clone — base do diff e do pull. */
  baseFiles: VirtualFileTree;
  /** Arquivos (nome limpo) com conflito de merge não resolvido. */
  conflictedFiles: Set<string>;
  /** Identidade simulada de `git config` — nunca enviada a lugar nenhum. */
  gitIdentity: { name?: string; email?: string };
  /** Modo de transferência para o Git real: o push pede credencial SIMULADA. */
  transferMode: boolean;
  /** Verdadeiro enquanto o terminal aguarda a credencial simulada. */
  awaitingSimulatedCredential: boolean;
  /**
   * P4 — Verdadeiro após uma credencial SIMULADA ter sido de fato
   * consumida (o push pediu e o aluno digitou um valor). É só o FATO do
   * consumo, nunca o valor digitado: a credencial continua descartada,
   * nunca logada e nunca persistida como valor. O passo 5 da Aula 2 só
   * se conclui com esta flag — um push "up to date" sem credencial não
   * basta, mesmo que hasPushed já estivesse verdadeiro antes.
   */
  transferCredentialConsumed: boolean;
  /** P5 — Verdadeiro após um `git pull` bem-sucedido (Aula 2, passo 3). */
  hasPulled: boolean;
  /**
   * P5 — Verdadeiro após um `git add` preparar um arquivo que estava em
   * conflito (Aula 2, passo 4). Um novo conflito via pull zera a flag.
   */
  hasResolvedConflict: boolean;
}

/**
 * Dica em 2 níveis (frente MOTOR + NOTA).
 * - pista: orientação sem o comando exato (o que a UI mostra primeiro).
 * - comando: comando exato, revelado pela UI sob ação do aluno.
 * `tip` (string legada) continua existindo em CommandExecutionResult para
 * não quebrar consumidores antigos (logs do professor, testes, UI legada).
 */
export interface TipDetail {
  pista: string;
  comando?: string;
}

export interface CommandExecutionResult {
  output: string;
  isError: boolean;
  tip?: string;
  tipDetail?: TipDetail;
  newState: GitEngineState;
  pushedCommit?: Commit;
  stepCompleted?: "clone" | "edit" | "commit" | "push";
  /** A linha digitada foi consumida como credencial SIMULADA (descartada). */
  consumedSimulatedCredential?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers puros (exportados para testes e para o VSCodeView / painel)
// ---------------------------------------------------------------------------

/** União de linhas preservando a ordem, sem duplicar linhas idênticas. */
export function mergeLinesByUnion(centralContent: string, incomingContent: string): string {
  // O "" final de um split de texto terminado em \n NÃO é uma linha: sem
  // este corte, a união gerava uma linha vazia fantasma no meio do arquivo.
  const stripTrailing = (lines: string[]) =>
    lines.length > 0 && lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of [
    ...stripTrailing(centralContent.split("\n")),
    ...stripTrailing(incomingContent.split("\n")),
  ]) {
    if (!seen.has(line)) {
      seen.add(line);
      out.push(line);
    }
  }
  if (out.length === 0) return "";
  const joined = out.join("\n");
  return centralContent.endsWith("\n") || incomingContent.endsWith("\n") ? `${joined}\n` : joined;
}

/**
 * Detecção de edição válida (substitui a substring do primeiro nome):
 * existe uma LINHA NOVA (que não estava no conteúdo original) contendo o
 * NOME COMPLETO do aluno (case-insensitive, espaços colapsados).
 * Ex.: "Augusto" no chamada.txt inicial não conta; "Ana" em "Mariana" não
 * conta para a aluna "Ana Teste" — só uma linha nova com "Ana Teste".
 */
/**
 * Nome completo presente em QUALQUER linha do conteúdo (mesma
 * normalização de hasNewLineWithFullName, mas sem exigir que a linha
 * seja nova: aqui vale a presença, não a novidade).
 * Usado pelo gate de conclusão do push (R1): o que conta é o nome
 * estar na lista, venha ele de uma linha nova ou de um clone anterior.
 */
export function lineContainsFullName(content: string, fullName: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const name = normalize(fullName);
  if (!name) return false;
  return content.split("\n").some((line) => normalize(line).includes(name));
}

/**
 * Gate de conclusão do push (R1): o envio SÓ conta para o passo de
 * push/conclusão quando (a) o commit inclui o chamada.txt e (b) o
 * chamada.txt de trabalho do aluno contém o nome completo dele. Sem
 * isso, um push de outro arquivo (ex.: README) marcaria conclusão sem
 * assinar a lista. O envio em si continua válido como git — o que se
 * retém é só o crédito do passo, nunca o envio.
 */
export function pushCountsForCompletion(
  commit: Commit,
  files: VirtualFileTree,
  repoFolder: string,
  fullName: string,
): boolean {
  const touchesChamada = commit.filesChanged.some((f) => {
    const base = f.replace(/^\.\//, "").split("/").pop();
    return base === "chamada.txt";
  });
  if (!touchesChamada) return false;
  const content = files[`${repoFolder}/chamada.txt`] ?? "";
  return lineContainsFullName(content, fullName);
}

export function hasNewLineWithFullName(
  originalContent: string,
  newContent: string,
  fullName: string
): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const name = normalize(fullName);
  if (!name) return false;
  const originalLines = new Set(originalContent.split("\n").map((l) => l.trim().toLowerCase()));
  return newContent.split("\n").some((line) => {
    const trimmed = line.trim().toLowerCase();
    return trimmed && !originalLines.has(trimmed) && normalize(line).includes(name);
  });
}

/** Pesos da nota 0–100: conclusão conta, mas não é tudo. */
export const SCORE_WEIGHTS = {
  clone: 10,
  edit: 20,
  commit: 20,
  push: 20,
  masteredPerConcept: 5,
  masteredMax: 10,
  diagnosticPerCommand: 5,
  diagnosticMax: 10,
  unaidedMax: 10,
} as const;

export interface ScoreBreakdown {
  completion: number;
  mastered: number;
  diagnostic: number;
  unaided: number;
  total: number;
}

export function computeScoreBreakdown(input: {
  hasCloned: boolean;
  hasEdited: boolean;
  hasCommitted: boolean;
  hasPushed: boolean;
  masteredConcepts?: string[];
  diagnosticCommands?: string[];
  unaidedScore?: number;
}): ScoreBreakdown {
  const completion =
    (input.hasCloned ? SCORE_WEIGHTS.clone : 0) +
    (input.hasEdited ? SCORE_WEIGHTS.edit : 0) +
    (input.hasCommitted ? SCORE_WEIGHTS.commit : 0) +
    (input.hasPushed ? SCORE_WEIGHTS.push : 0);
  const mastered = Math.min(
    SCORE_WEIGHTS.masteredMax,
    new Set(input.masteredConcepts ?? []).size * SCORE_WEIGHTS.masteredPerConcept
  );
  const diagnostic = Math.min(
    SCORE_WEIGHTS.diagnosticMax,
    new Set(input.diagnosticCommands ?? []).size * SCORE_WEIGHTS.diagnosticPerCommand
  );
  const unaided = Math.max(0, Math.min(SCORE_WEIGHTS.unaidedMax, input.unaidedScore ?? 0));
  return {
    completion,
    mastered,
    diagnostic,
    unaided,
    total: Math.max(0, Math.min(100, completion + mastered + diagnostic + unaided)),
  };
}

export function computeScore(input: Parameters<typeof computeScoreBreakdown>[0]): number {
  return computeScoreBreakdown(input).total;
}

/**
 * Conceito pedagógico de um erro do terminal. Retorna undefined quando a
 * saída não mapeia para um conceito rastreado. O conceito em si é
 * dominado pelo acerto (ver conceptsResolvedByCommand): errar e depois
 * acertar é uma evidência de domínio, acertar de primeira é outra — o
 * erro aqui só serve para diagnóstico (logs do professor, testes).
 */
export function conceptForFailedCommand(output: string): string | undefined {
  if (/no changes added to commit|not staged/i.test(output)) return "staging";
  if (/not a git repository/i.test(output)) return "repo";
  if (/does not exist/i.test(output)) return "clone-url";
  if (/did not match any files/i.test(output)) return "add-path";
  if (/requires a value|empty commit message/i.test(output)) return "commit-message";
  if (/already exists/i.test(output)) return "clone-repeat";
  return undefined;
}

/** Conceitos que um comando bem-sucedido demonstra que o aluno domina. */
export function conceptsResolvedByCommand(command: string, isError: boolean): string[] {
  if (isError) return [];
  const cmd = command.trim().toLowerCase();
  if (cmd.startsWith("git add")) return ["staging", "add-path"];
  if (cmd.startsWith("git commit")) return ["staging", "commit-message"];
  if (cmd.startsWith("git clone")) return ["clone-url", "repo"];
  if (cmd.startsWith("cd ")) return ["repo"];
  return [];
}

/** Comandos de diagnóstico contados no componente (b) da nota. */
export function diagnosticCommandOf(command: string): string | undefined {
  const cmd = command.trim().toLowerCase();
  if (cmd.startsWith("git status")) return "status";
  if (cmd.startsWith("git diff")) return "diff";
  if (cmd.startsWith("git log")) return "log";
  return undefined;
}

// Gera um hash SHA curto de 7 caracteres
function generateHash(): string {
  const chars = "0123456789abcdef";
  let hash = "";
  for (let i = 0; i < 7; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}

/** Diff linha a linha (LCS) entre base e atual: [{ tipo, texto }]. */
export function lineDiff(
  baseContent: string,
  newContent: string
): { type: " " | "-" | "+"; text: string }[] {
  const base = baseContent.split("\n");
  const next = newContent.split("\n");
  // Arquivos da aula são curtos; LCS O(n*m) é suficiente e exato.
  const dp: number[][] = Array.from({ length: base.length + 1 }, () =>
    new Array<number>(next.length + 1).fill(0)
  );
  for (let i = base.length - 1; i >= 0; i--) {
    for (let j = next.length - 1; j >= 0; j--) {
      dp[i][j] = base[i] === next[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: { type: " " | "-" | "+"; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < base.length && j < next.length) {
    if (base[i] === next[j]) {
      out.push({ type: " ", text: base[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "-", text: base[i] });
      i++;
    } else {
      out.push({ type: "+", text: next[j] });
      j++;
    }
  }
  while (i < base.length) out.push({ type: "-", text: base[i++] });
  while (j < next.length) out.push({ type: "+", text: next[j++] });
  return out;
}

export interface ThreeWayMerge {
  merged: string;
  hasConflict: boolean;
  conflictedLineIndexes: number[];
}

/**
 * Merge 3-way por linhas para o `git pull` simulado.
 * Conflito = mesma posição do arquivo-base alterada de forma diferente no
 * local e no remoto. Linhas acrescentadas nos dois lados (caso da chamada)
 * são unidas sem duplicar. Em conflito, a região vira marcadores
 * <<<<<<< HEAD / ======= / >>>>>>> origin/<branch>.
 */
export function threeWayMerge(base: string, local: string, remote: string, branch: string): ThreeWayMerge {
  // Normaliza o "" final do split (artefato do \n final, não linha) para
  // que acréscimos ao fim do arquivo não "disputem" a mesma posição.
  const stripTrailing = (lines: string[]) =>
    lines.length > 0 && lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;
  const baseLines = stripTrailing(base.split("\n"));
  const localLines = stripTrailing(local.split("\n"));
  const remoteLines = stripTrailing(remote.split("\n"));
  const endsWithNewline =
    base.endsWith("\n") || local.endsWith("\n") || remote.endsWith("\n");
  const finish = (lines: string[]) =>
    lines.length === 0 ? "" : endsWithNewline ? `${lines.join("\n")}\n` : lines.join("\n");
  const maxLen = Math.max(baseLines.length, localLines.length, remoteLines.length);
  const conflicted = new Set<number>();
  // Conflito SÓ em linhas que existiam na base e foram alteradas de forma
  // diferente nos dois lados. Acréscimos (idx >= base) nunca conflitam:
  // são unidos (caso da chamada: cada aluno acrescenta sua linha).
  for (let idx = 0; idx < baseLines.length; idx++) {
    const b = baseLines[idx] ?? "";
    const l = localLines[idx] ?? "";
    const r = remoteLines[idx] ?? "";
    if (l !== b && r !== b && l !== r) conflicted.add(idx);
  }
  if (conflicted.size === 0) {
    // Sem conflito: linha a linha (preferência local), acréscimos unidos.
    const merged: string[] = [];
    for (let idx = 0; idx < maxLen; idx++) {
      const b = baseLines[idx] ?? "";
      const l = localLines[idx] ?? "";
      const r = remoteLines[idx] ?? "";
      if (idx < baseLines.length) {
        merged.push(l !== b ? l : r);
      } else if (l !== "" || r !== "") {
        if (l !== "" && !merged.includes(l)) merged.push(l);
        if (r !== "" && !merged.includes(r)) merged.push(r);
      }
    }
    return { merged: finish(merged), hasConflict: false, conflictedLineIndexes: [] };
  }
  // Com conflito: agrupa índices consecutivos em um bloco de marcadores.
  const out: string[] = [];
  let idx = 0;
  while (idx < maxLen) {
    if (!conflicted.has(idx)) {
      const b = baseLines[idx] ?? "";
      const l = localLines[idx] ?? "";
      const r = remoteLines[idx] ?? "";
      if (idx < baseLines.length) out.push(l !== b ? l : r);
      else {
        if (l !== "" && !out.includes(l)) out.push(l);
        if (r !== "" && !out.includes(r)) out.push(r);
      }
      idx++;
    } else {
      const headLines: string[] = [];
      const remoteLinesBlock: string[] = [];
      while (idx < maxLen && conflicted.has(idx)) {
        headLines.push(localLines[idx] ?? "");
        remoteLinesBlock.push(remoteLines[idx] ?? "");
        idx++;
      }
      out.push("<<<<<<< HEAD", ...headLines, "=======", ...remoteLinesBlock, `>>>>>>> origin/${branch}`);
    }
  }
  return { merged: finish(out), hasConflict: true, conflictedLineIndexes: [...conflicted] };
}

/**
 * Merge 3-way com detecção de "variante", SÓ para a chamada.txt.
 *
 * Por que existe: o push da chamada.txt usa união de linhas (proteção:
 * nenhum push apaga a linha do colega). Efeito colateral: quando um
 * aluno EDITA uma linha da base (ex.: o cabeçalho) e dá push, a variante
 * editada é ANEXADA ao fim do arquivo e a linha original permanece no
 * índice — então o merge posicional do pull nunca vê divergência no
 * mesmo índice e responde Fast-forward. A receita da Aula 2 (dois alunos
 * editando a mesma linha inicial) nunca gerava conflito por esse caminho.
 *
 * Detecção: se o merge posicional não achou conflito, para cada linha da
 * base que o local editou, procura no remoto uma linha VARIANTE dela —
 * linha nova no remoto (não estava na base, o aluno ainda não a tem e
 * diferente da versão local) que CONTÉM a linha da base ou ESTÁ CONTIDA
 * nela, com a menor das duas tendo ao menos 20 caracteres normalizados.
 * O piso de 20 é o que separa "edição do cabeçalho" (as linhas da
 * semente têm 28+ caracteres) de "nome de colega" (nomes próprios
 * raramente chegam a 20): sem ele, um homônimo ("Ana Teste Silva")
 * seria falso-positivo de variante da linha ("Ana Teste").
 *
 * Limitações honestas: (a) só detecta variantes por contenção — edição
 * que reescreve a linha por completo sem manter 20 caracteres dela não
 * vira conflito (o pull então só atualiza, como antes); (b) se o merge
 * posicional já achou conflito em outra linha, a variante não é
 * procurada — o conflito posicional vence; (c) exclusões com
 * deslocamento de índice seguem a aproximação posicional de antes.
 * Nada disso toca o push: a proteção por união está intacta.
 */
export function mergeChamadaWithVariantConflicts(
  base: string,
  local: string,
  remote: string,
  branch: string,
): ThreeWayMerge {
  const positional = threeWayMerge(base, local, remote, branch);
  if (positional.hasConflict) return positional;
  const stripTrailing = (lines: string[]) =>
    lines.length > 0 && lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const baseLines = stripTrailing(base.split("\n"));
  const localLines = stripTrailing(local.split("\n"));
  const remoteLines = stripTrailing(remote.split("\n"));
  const baseSet = new Set(baseLines);
  const localSet = new Set(localLines);
  const endsWithNewline =
    base.endsWith("\n") || local.endsWith("\n") || remote.endsWith("\n");
  const finish = (lines: string[]) =>
    lines.length === 0 ? "" : endsWithNewline ? `${lines.join("\n")}\n` : lines.join("\n");
  // Índice da base → variante remota (primeira encontrada).
  const variantAt = new Map<number, string>();
  for (let idx = 0; idx < baseLines.length; idx++) {
    const b = baseLines[idx] ?? "";
    const nb = norm(b);
    if (nb.length < 20) continue;
    const l = localLines[idx] ?? "";
    if (l === "" || l === b) continue; // local não editou esta linha
    for (const r of remoteLines) {
      if (r === "" || baseSet.has(r) || localSet.has(r) || r === l) continue;
      const nr = norm(r);
      const isVariant =
        (nr.includes(nb) || nb.includes(nr)) && Math.min(nb.length, nr.length) >= 20;
      if (isVariant) {
        variantAt.set(idx, r);
        break;
      }
    }
  }
  if (variantAt.size === 0) return positional;
  // Reconstrói o merge com marcadores nas linhas variantes (mesma regra
  // do caminho sem conflito para o resto: preferência local, acréscimos
  // unidos — exceto as variantes, que já aparecem nos marcadores).
  const usedVariants = new Set(variantAt.values());
  const out: string[] = [];
  const maxLen = Math.max(baseLines.length, localLines.length, remoteLines.length);
  for (let idx = 0; idx < maxLen; idx++) {
    if (variantAt.has(idx)) {
      out.push(
        "<<<<<<< HEAD",
        localLines[idx] ?? "",
        "=======",
        variantAt.get(idx) ?? "",
        `>>>>>>> origin/${branch}`,
      );
      continue;
    }
    if (idx < baseLines.length) {
      const b = baseLines[idx] ?? "";
      const l = localLines[idx] ?? "";
      const r = remoteLines[idx] ?? "";
      out.push(l !== b ? l : r);
    } else {
      const l = localLines[idx] ?? "";
      const r = remoteLines[idx] ?? "";
      if (l !== "" && !usedVariants.has(l) && !out.includes(l)) out.push(l);
      if (r !== "" && !usedVariants.has(r) && !out.includes(r)) out.push(r);
    }
  }
  return { merged: finish(out), hasConflict: true, conflictedLineIndexes: [...variantAt.keys()] };
}

export function createInitialGitState(student: Student, remoteRepo: Repository): GitEngineState {
  return {
    currentDir: "~",
    isRepoCloned: false,
    repoFolder: remoteRepo.name,
    head: remoteRepo.defaultBranch || "main",
    files: {},
    stagedFiles: new Set<string>(),
    untrackedFiles: new Set<string>(),
    modifiedFiles: new Set<string>(),
    deletedFiles: new Set<string>(),
    localCommits: [],
    remoteRepo,
    student,
    branches: [remoteRepo.defaultBranch || "main"],
    baseFiles: {},
    conflictedFiles: new Set<string>(),
    gitIdentity: {},
    transferMode: false,
    awaitingSimulatedCredential: false,
    transferCredentialConsumed: false,
    hasPulled: false,
    hasResolvedConflict: false,
  };
}

/** Nome limpo (sem pasta, sem ./) a partir do argumento do aluno. */
function cleanFileArg(state: GitEngineState, target: string): string {
  let clean = target.replace(/^\.\//, "");
  if (clean.startsWith(`${state.repoFolder}/`)) {
    clean = clean.slice(state.repoFolder.length + 1);
  }
  return clean;
}

/**
 * Exclusão na pasta de trabalho: tira o arquivo do dicionário e marca a
 * exclusão como pendente. Quem chama decide o staged: `rm` e a exclusão
 * pela UI limpam o staged do arquivo; `git rm` o adiciona ao staged.
 */
function applyWorkingTreeDeletion(newState: GitEngineState, clean: string): void {
  delete newState.files[`${newState.repoFolder}/${clean}`];
  newState.deletedFiles.add(clean);
  newState.modifiedFiles.delete(clean);
  newState.untrackedFiles.delete(clean);
  newState.conflictedFiles.delete(clean);
}

function executeSingleTerminalCommand(
  rawCommand: string,
  state: GitEngineState
): CommandExecutionResult {
  const trimmed = rawCommand.trim();
  const newState: GitEngineState = {
    ...state,
    stagedFiles: new Set(state.stagedFiles),
    untrackedFiles: new Set(state.untrackedFiles),
    modifiedFiles: new Set(state.modifiedFiles),
    deletedFiles: new Set(state.deletedFiles),
    conflictedFiles: new Set(state.conflictedFiles),
    files: { ...state.files },
    localCommits: [...state.localCommits],
    branches: [...state.branches],
    baseFiles: { ...state.baseFiles },
    gitIdentity: { ...state.gitIdentity },
  };

  if (!trimmed) {
    return { output: "", isError: false, newState };
  }

  // Credencial SIMULADA (modo de transferência): qualquer linha digitada
  // enquanto o push a aguarda é consumida e DESCARTADA — nunca ecoada na
  // saída, nunca registrada como comando, nunca enviada ou persistida.
  // O chamador (VSCodeView) deve ainda redigir o log dessa linha.
  if (newState.awaitingSimulatedCredential) {
    newState.awaitingSimulatedCredential = false;
    // P4 — a credencial foi consumida (e descartada logo abaixo, como
    // sempre: o valor nunca aparece na saída, no log ou no estado).
    newState.transferCredentialConsumed = true;
    const localOnly = newState.localCommits.filter(
      (lc) => !newState.remoteRepo.commits.some((rc) => rc.hash === lc.hash)
    );
    if (localOnly.length === 0) {
      return {
        output: "Everything up-to-date\n⚠️ SIMULAÇÃO: a credencial digitada foi descartada — nada foi enviado ou salvo.",
        isError: false,
        newState,
        consumedSimulatedCredential: true,
      };
    }
    const latestCommit = localOnly[0];
    const prevHash = newState.remoteRepo.commits[0]?.hash || "0000000";
    // Gate R1 também no modo transferência: o consumo da credencial
    // marca o passo de transferência por si só (transferCredentialConsumed
    // é setado acima, independente disto); o crédito do passo de push
    // segue a mesma regra do push normal.
    if (!pushCountsForCompletion(latestCommit, newState.files, newState.repoFolder, newState.student.name)) {
      return {
        output: `⚠️ SIMULAÇÃO: credencial descartada — nada foi enviado, salvo ou verificado de verdade.\nEnumerating objects: 5, done.\nTo ${newState.remoteRepo.cloneUrl}\n   ${prevHash}..${latestCommit.hash}  ${newState.head} -> ${newState.head}\n⚠️ Este envio foi registrado, mas não conta como conclusão: o chamada.txt enviado não traz seu nome completo. Confira o arquivo e envie de novo.`,
        isError: false,
        tip: "💡 Dica: O envio foi registrado, mas a conclusão pede o chamada.txt com seu nome completo. Abra o arquivo, confira sua linha e envie de novo.",
        newState,
        pushedCommit: latestCommit,
        consumedSimulatedCredential: true,
      };
    }
    return {
      output: `⚠️ SIMULAÇÃO: credencial descartada — nada foi enviado, salvo ou verificado de verdade.\nEnumerating objects: 5, done.\nTo ${newState.remoteRepo.cloneUrl}\n   ${prevHash}..${latestCommit.hash}  ${newState.head} -> ${newState.head}`,
      isError: false,
      tip: "⚠️ No GitHub de verdade, o push pede login (usuário + token) — nunca digite sua senha real em simulações.",
      newState,
      pushedCommit: latestCommit,
      stepCompleted: "push",
      consumedSimulatedCredential: true,
    };
  }

  // Argument parser respeitando aspas
  const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
  const args: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(trimmed)) !== null) {
    args.push(match[1] ?? match[2] ?? match[0]);
  }

  const cmd = args[0].toLowerCase();

  // COMANDOS BÁSICOS DE SHELL
  if (cmd === "clear" || cmd === "cls") {
    return { output: "\x1b[CLEAR]", isError: false, newState };
  }

  if (cmd === "pwd") {
    const fullPath = newState.currentDir === "~" ? "/home/aluno" : `/home/aluno/${newState.repoFolder}`;
    return { output: fullPath, isError: false, newState };
  }

  // RM — exclui da pasta de trabalho, sem preparar (não staged). O `git
  // status` passa a mostrar "deleted:" e `git add` prepara a exclusão.
  if (cmd === "rm") {
    const target = args.slice(1).find((a) => !a.startsWith("-"));
    if (!target) {
      return {
        output: "rm: falta o operando\nTente 'rm <arquivo>' (ex: rm README.md).",
        isError: true,
        tip: "💡 Dica: Informe o arquivo: 'rm README.md'.",
        newState,
      };
    }
    const clean = cleanFileArg(newState, target);
    const fullPath = `${newState.repoFolder}/${clean}`;
    if (newState.files[fullPath] === undefined) {
      return {
        output: `rm: cannot remove '${target}': No such file or directory`,
        isError: true,
        tip: `💡 Dica: O arquivo '${target}' não foi encontrado. Use 'ls' para ver o nome correto.`,
        newState,
      };
    }
    applyWorkingTreeDeletion(newState, clean);
    newState.stagedFiles.delete(clean);
    return {
      output: "",
      isError: false,
      tip: `💡 Arquivo '${clean}' removido da pasta de trabalho (ainda não staged).`,
      tipDetail: {
        pista: `O arquivo '${clean}' saiu da pasta de trabalho. Prepare a exclusão ou recupere o arquivo.`,
        comando: `git add ${clean}`,
      },
      newState,
    };
  }

  if (cmd === "help") {
    const helpText = `Comandos disponíveis no simulador:
  git clone <url>      - Clona o repositório remoto para o VS Code
  cd <pasta>           - Entra em um diretório (ex: cd ${newState.repoFolder} ou cd ..)
  ls / dir             - Lista arquivos e pastas do diretório atual
  cat <arquivo>        - Exibe o conteúdo de um arquivo de texto
  pwd                  - Mostra o caminho da pasta atual
  rm <arquivo>         - Exclui um arquivo da pasta de trabalho (não staged)
  git status           - Mostra o estado dos arquivos (modificados, staged, untracked)
  git diff             - Mostra o que mudou nos arquivos antes do commit
  git branch [nome]    - Lista as branches, ou cria uma com o nome dado
  git checkout <branch>- Troca para outra branch (checkout -b cria e troca)
  git switch <branch>  - Troca para outra branch (atalho de checkout)
  git pull             - Traz as novidades do remoto (pode gerar conflito)
  git config user.name/email - Registra nome/e-mail simulados (só local)
  git add <arquivo>    - Adiciona arquivos para a área de preparação (staging)
  git rm <arquivo>     - Exclui um arquivo e já prepara a exclusão
  git restore <arquivo>- Recupera um arquivo excluído (só exclusões)
  git commit -m "msg"  - Cria um commit com as alterações preparadas
  git push origin main - Envia seus commits para o GitHub
  git log              - Mostra o histórico de commits
  clear                - Limpa a tela do terminal`;
    return { output: helpText, isError: false, newState };
  }

  if (cmd === "ls" || cmd === "dir") {
    if (newState.currentDir === "~") {
      if (newState.isRepoCloned) {
        return {
          output: `\x1b[34m${newState.repoFolder}/\x1b[0m`,
          isError: false,
          newState,
        };
      }
      return { output: "(diretório vazio)", isError: false, newState };
    } else {
      // Dentro do repo
      const filesInRepo = Object.keys(newState.files)
        .filter((f) => f.startsWith(`${newState.repoFolder}/`))
        .map((f) => f.replace(`${newState.repoFolder}/`, ""));

      if (filesInRepo.length === 0) {
        return { output: "(repositório vazio)", isError: false, newState };
      }

      return {
        output: filesInRepo.join("   "),
        isError: false,
        newState,
      };
    }
  }

  if (cmd === "cd") {
    const target = args[1]?.trim() || "~";
    if (target === "~" || target === ".." || target === "/" || target === "/home/aluno") {
      newState.currentDir = "~";
      return { output: "", isError: false, newState };
    }

    const cleanTarget = target.replace(/\/$/, "");
    if (cleanTarget === newState.repoFolder || cleanTarget === `./${newState.repoFolder}`) {
      if (!newState.isRepoCloned) {
        return {
          output: `bash: cd: ${target}: Arquivo ou diretório inexistente`,
          isError: true,
          tip: `💡 Dica: Você ainda não clonou o repositório! Use 'git clone ${newState.remoteRepo.cloneUrl}' primeiro.`,
          tipDetail: {
            pista: "Você ainda não trouxe o repositório para o seu computador, por isso a pasta não existe. Clone-o primeiro usando a URL oficial da aba GitHub.",
            comando: `git clone ${newState.remoteRepo.cloneUrl}`,
          },
          newState,
        };
      }
      newState.currentDir = `~/${newState.repoFolder}`;
      return { output: "", isError: false, newState };
    }

    return {
      output: `bash: cd: ${target}: Arquivo ou diretório inexistente`,
      isError: true,
      tip: `💡 Dica: Use 'ls' para ver as pastas disponíveis ou 'cd ${newState.repoFolder}' para entrar no repositório.`,
      newState,
    };
  }

  if (cmd === "cat") {
    const file = args[1]?.trim();
    if (!file) {
      return { output: "cat: argumento ausente", isError: true, newState };
    }
    const filePath =
      newState.currentDir === "~" ? file : `${newState.repoFolder}/${file}`;

    if (newState.files[filePath] !== undefined) {
      return { output: newState.files[filePath], isError: false, newState };
    }
    return {
      output: `cat: ${file}: Arquivo ou diretório inexistente`,
      isError: true,
      tip: `💡 Dica: Verifique o nome do arquivo usando 'ls'. Certifique-se de que está dentro da pasta com 'cd ${newState.repoFolder}'.`,
      newState,
    };
  }

  // COMANDOS GIT
  if (cmd === "git") {
    const gitSubCmd = args[1]?.toLowerCase();

    if (!gitSubCmd) {
      return {
        output: "usage: git <command> [<args>]\nDigite 'help' para ver os comandos suportados.",
        isError: false,
        newState,
      };
    }

    // GIT CLONE
    if (gitSubCmd === "clone") {
      const url = args[2]?.trim();

      if (!url) {
        return {
          output: "fatal: You must specify a repository to clone.\n\nusage: git clone <url>",
          isError: true,
          tip: `💡 Dica: Copie a URL no botão verde '<> Code' da aba GitHub e digite:\ngit clone ${newState.remoteRepo.cloneUrl}`,
          tipDetail: {
            pista: "O clone precisa da URL do repositório da turma. Copie-a no botão verde '<> Code' da aba GitHub.",
            comando: `git clone ${newState.remoteRepo.cloneUrl}`,
          },
          newState,
        };
      }

      // URL EXATA do repositório da turma (initialData): só a caixa e uma
      // eventual "/" final são toleradas. URL contendo o nome do repo em
      // outro host, sem .git ou com outro caminho NÃO clona — era o bug
      // que fazia URL errada "funcionar".
      const expectedUrl = newState.remoteRepo.cloneUrl.toLowerCase().replace(/\/$/, "");
      const inputUrl = url.toLowerCase().replace(/\/$/, "");

      if (inputUrl !== expectedUrl) {
        return {
          output: `fatal: repository '${url}' does not exist`,
          isError: true,
          tip: `💡 Dica: URL inválida! Copie o link oficial clicando no botão verde '<> Code' no GitHub:\n${newState.remoteRepo.cloneUrl}`,
          tipDetail: {
            pista: "Copie a URL oficial no botão verde '<> Code' da aba GitHub e clone o repositório da turma.",
            comando: `git clone ${newState.remoteRepo.cloneUrl}`,
          },
          newState,
        };
      }

      if (newState.isRepoCloned) {
        return {
          output: `fatal: destination path '${newState.repoFolder}' already exists and is not an empty directory.`,
          isError: true,
          tip: `💡 Dica: O repositório já foi clonado! Use 'cd ${newState.repoFolder}' para entrar nele.`,
          newState,
        };
      }

      // Clona arquivos do remoteRepo e congela a base (diff/pull usam-na)
      newState.isRepoCloned = true;
      for (const [filename, content] of Object.entries(newState.remoteRepo.files)) {
        newState.files[`${newState.repoFolder}/${filename}`] = content;
        newState.baseFiles[`${newState.repoFolder}/${filename}`] = content;
      }
      newState.localCommits = [...newState.remoteRepo.commits];

      return {
        output: `Cloning into '${newState.repoFolder}'...
remote: Enumerating objects: 6, done.
remote: Counting objects: 100% (6/6), done.
remote: Compressing objects: 100% (4/4), done.
remote: Total 6 (delta 1), reused 0 (delta 0)
Receiving objects: 100% (6/6), done.`,
        isError: false,
        tip: `💡 Muito bem! O repositório foi clonado com sucesso!\n👉 Próximo passo: Digite 'cd ${newState.repoFolder}' para entrar na pasta do projeto.`,
        newState,
        stepCompleted: "clone",
      };
    }

    // Verificação de estar dentro do repositório
    const isInsideRepo = newState.currentDir === `~/${newState.repoFolder}`;

    if (!isInsideRepo) {
      if (
        gitSubCmd === "status" || gitSubCmd === "add" || gitSubCmd === "commit" ||
        gitSubCmd === "push" || gitSubCmd === "log" || gitSubCmd === "branch" ||
        gitSubCmd === "checkout" || gitSubCmd === "switch" || gitSubCmd === "pull" ||
        gitSubCmd === "rm" || gitSubCmd === "restore"
      ) {
        return {
          output: "fatal: not a git repository (or any of the parent directories): .git",
          isError: true,
          tip: newState.isRepoCloned
            ? `💡 Dica: Você está fora da pasta do repositório! Digite 'cd ${newState.repoFolder}' para entrar nela.`
            : `💡 Dica: Você precisa clonar o repositório antes de usar o Git! Use: git clone ${newState.remoteRepo.cloneUrl}`,
          newState,
        };
      }
    }

    // GIT STATUS
    if (gitSubCmd === "status") {
      let output = `On branch ${newState.head}\nYour branch is up to date with 'origin/${newState.head}'.\n\n`;

      if (newState.localCommits.length > newState.remoteRepo.commits.length) {
        const diff = newState.localCommits.length - newState.remoteRepo.commits.length;
        output = `On branch ${newState.head}\nYour branch is ahead of 'origin/${newState.head}' by ${diff} commit${diff > 1 ? "s" : ""}.\n  (use "git push" to publish your local commits)\n\n`;
      }

      const hasStaged = newState.stagedFiles.size > 0;
      const hasModified = newState.modifiedFiles.size > 0;
      const hasUntracked = newState.untrackedFiles.size > 0;
      const hasConflict = newState.conflictedFiles.size > 0;
      const hasDeletedUnstaged = [...newState.deletedFiles].some(
        (f) => !newState.stagedFiles.has(f)
      );

      if (!hasStaged && !hasModified && !hasUntracked && !hasConflict && !hasDeletedUnstaged) {
        output += `nothing to commit, working tree clean`;
        return { output, isError: false, newState };
      }

      if (hasConflict) {
        output += `Unmerged paths:\n  (use "git add <file>..." to mark resolution)\n`;
        newState.conflictedFiles.forEach((file) => {
          output += `\t\x1b[31mboth modified:   ${file}\x1b[0m\n`;
        });
        output += `\n`;
      }

      if (hasStaged) {
        output += `Changes to be committed:\n  (use "git restore --staged <file>..." to unstage)\n`;
        newState.stagedFiles.forEach((file) => {
          const verb = newState.deletedFiles.has(file) ? "deleted:" : "modified:";
          output += `\t\x1b[32m${verb}   ${file}\x1b[0m\n`;
        });
        output += `\n`;
      }

      if (hasModified || hasDeletedUnstaged) {
        output += `Changes not staged for commit:\n  (use "git add <file>..." to update what will be committed)\n`;
        newState.modifiedFiles.forEach((file) => {
          output += `\t\x1b[31mmodified:   ${file}\x1b[0m\n`;
        });
        newState.deletedFiles.forEach((file) => {
          if (!newState.stagedFiles.has(file)) {
            output += `\t\x1b[31mdeleted:   ${file}\x1b[0m\n`;
          }
        });
        output += `\n`;
      }

      if (hasUntracked) {
        output += `Untracked files:\n  (use "git add <file>..." to include in what will be committed)\n`;
        newState.untrackedFiles.forEach((file) => {
          output += `\t\x1b[31m${file}\x1b[0m\n`;
        });
        output += `\n`;
      }

      let tip: string | undefined;
      let tipDetail: TipDetail | undefined;
      if (hasConflict) {
        tip = `💡 Dica: Há um conflito! Edite o arquivo, remova os marcadores <<<<<<< / ======= / >>>>>>>, e depois execute 'git add chamada.txt'.`;
        tipDetail = {
          pista: "Edite o arquivo, remova os marcadores de conflito e prepare o arquivo resolvido.",
          comando: "git add chamada.txt",
        };
      } else if (hasModified || hasUntracked || hasDeletedUnstaged) {
        tip = `💡 Dica: Você tem arquivos modificados! Execute 'git add chamada.txt' (ou 'git add .') para prepará-los para o commit.`;
        tipDetail = {
          pista: "Prepare os arquivos modificados para o commit.",
          comando: "git add chamada.txt",
        };
      } else if (hasStaged) {
        tip = `💡 Dica: As alterações já estão preparadas (em verde)! Agora crie o commit com: git commit -m "Presente: ${newState.student.name}"`;
        tipDetail = {
          pista: "As alterações já estão preparadas. Agora crie o commit com uma mensagem de presença.",
          comando: `git commit -m "Presente: ${newState.student.name}"`,
        };
      }

      return { output, isError: false, tip, tipDetail, newState };
    }

    // GIT ADD
    if (gitSubCmd === "add") {
      const targetFile = args[2];
      if (!targetFile) {
        return {
          output: "Nothing specified, nothing added.\nMaybe you wanted to say 'git add .'?",
          isError: true,
          tip: "💡 Dica: Especifique o arquivo: 'git add chamada.txt' ou 'git add .' para adicionar todos.",
          tipDetail: {
            pista: "Informe qual arquivo preparar para o commit: um arquivo específico ou todos de uma vez.",
            comando: "git add chamada.txt",
          },
          newState,
        };
      }

      if (targetFile === "." || targetFile === "*") {
        if (newState.modifiedFiles.size === 0 && newState.untrackedFiles.size === 0 && newState.deletedFiles.size === 0) {
          return {
            output: "",
            isError: false,
            tip: "💡 Nada a ser adicionado. Você já editou o arquivo chamada.txt no editor à esquerda?",
            newState,
          };
        }
        newState.modifiedFiles.forEach((f) => newState.stagedFiles.add(f));
        newState.untrackedFiles.forEach((f) => newState.stagedFiles.add(f));
        // Exclusões também entram no staging (ficam em deletedFiles, agora staged).
        newState.deletedFiles.forEach((f) => newState.stagedFiles.add(f));
        // Arquivo em conflito que entra no staging = conflito resolvido.
        if (newState.conflictedFiles.size > 0) newState.hasResolvedConflict = true;
        newState.conflictedFiles.forEach((f) => newState.stagedFiles.add(f));
        newState.modifiedFiles.clear();
        newState.untrackedFiles.clear();
        newState.conflictedFiles.clear();

        return {
          output: "",
          isError: false,
          tip: `💡 Arquivos adicionados à área de preparação (Staging)!\n👉 Próximo passo: Crie o commit com: git commit -m "Presente: ${newState.student.name}"`,
          tipDetail: {
            pista: "Arquivos preparados. Agora registre o commit com uma mensagem que diga o que você fez.",
            comando: `git commit -m "Presente: ${newState.student.name}"`,
          },
          newState,
        };
      }

      const cleanFileName = targetFile.replace(/^\.\//, "");
      const fullPath = `${newState.repoFolder}/${cleanFileName}`;

      // Preparar uma exclusão: o arquivo já saiu da pasta de trabalho e
      // está em deletedFiles — o add só o move para o staged.
      if (newState.deletedFiles.has(cleanFileName)) {
        newState.stagedFiles.add(cleanFileName);
        return {
          output: "",
          isError: false,
          tip: `💡 Exclusão de '${cleanFileName}' preparada com sucesso!\n👉 Próximo passo: Execute 'git commit -m "Remove ${cleanFileName}"'`,
          tipDetail: {
            pista: "A exclusão está preparada. Agora registre o commit com uma mensagem que diga o que você fez.",
            comando: `git commit -m "Remove ${cleanFileName}"`,
          },
          newState,
        };
      }

      if (newState.files[fullPath] === undefined) {
        return {
          output: `fatal: pathspec '${targetFile}' did not match any files`,
          isError: true,
          tip: `💡 Dica: O arquivo '${targetFile}' não foi encontrado. Use 'ls' para ver o nome correto (ex: chamada.txt).`,
          tipDetail: {
            pista: "Esse arquivo não existe aqui. Liste os arquivos do repositório e confira o nome exato antes de preparar.",
            comando: "git add chamada.txt",
          },
          newState,
        };
      }

      newState.stagedFiles.add(cleanFileName);
      newState.modifiedFiles.delete(cleanFileName);
      newState.untrackedFiles.delete(cleanFileName);
      // Adicionar um arquivo em conflito marca o conflito como resolvido.
      if (newState.conflictedFiles.delete(cleanFileName)) newState.hasResolvedConflict = true;

      return {
        output: "",
        isError: false,
        tip: `💡 Arquivo '${cleanFileName}' preparado com sucesso!\n👉 Próximo passo: Execute 'git commit -m "Presente: ${newState.student.name}"'`,
        tipDetail: {
          pista: "Arquivo preparado. Agora registre o commit com uma mensagem que diga o que você fez.",
          comando: `git commit -m "Presente: ${newState.student.name}"`,
        },
        newState,
      };
    }

    // GIT COMMIT
    if (gitSubCmd === "commit") {
      const mIndex = args.findIndex((a) => a === "-m" || a.startsWith("-m="));
      if (mIndex === -1) {
        return {
          output: "error: switch 'm' requires a value\nAborting commit due to empty commit message.",
          isError: true,
          tip: `💡 Dica: O commit precisa de uma mensagem explicativa com o parâmetro -m.\nExemplo: git commit -m "Presente: ${newState.student.name}"`,
          tipDetail: {
            pista: "O commit precisa de uma mensagem explicando a mudança. Passe-a com o parâmetro -m.",
            comando: `git commit -m "Presente: ${newState.student.name}"`,
          },
          newState,
        };
      }

      const commitMessage = args[mIndex + 1]?.trim();
      if (!commitMessage) {
        return {
          output: "error: empty commit message specified.\nAborting commit.",
          isError: true,
          tip: `💡 Dica: Coloque a mensagem entre aspas após o -m!\nExemplo: git commit -m "Presente: ${newState.student.name}"`,
          tipDetail: {
            pista: "A mensagem do commit não pode ficar vazia: escreva-a entre aspas após o -m.",
            comando: `git commit -m "Presente: ${newState.student.name}"`,
          },
          newState,
        };
      }

      if (newState.conflictedFiles.size > 0) {
        return {
          output: `On branch ${newState.head}\nerror: you need to resolve your current index first`,
          isError: true,
          tip: `💡 Dica: Há conflito não resolvido! Edite o arquivo, remova os marcadores <<<<<<< / ======= / >>>>>>> e execute 'git add' no arquivo resolvido antes de commitar.`,
          tipDetail: {
            pista: "Resolva o conflito editando o arquivo e prepare o arquivo resolvido antes de commitar.",
            comando: "git add chamada.txt",
          },
          newState,
        };
      }

      if (newState.stagedFiles.size === 0) {
        if (newState.modifiedFiles.size > 0) {
          return {
            output: `On branch main\nChanges not staged for commit:\n\tmodified:   chamada.txt\n\nno changes added to commit (use "git add")`,
            isError: true,
            tip: `💡 Dica: Você modificou o arquivo, mas esqueceu de prepará-lo com 'git add'!\nExecute primeiro: git add chamada.txt`,
            tipDetail: {
              pista: "Você modificou o arquivo, mas ainda não o preparou para o commit. Prepare-o antes de registrar.",
              comando: "git add chamada.txt",
            },
            newState,
          };
        }
        return {
          output: "On branch main\nnothing to commit, working tree clean",
          isError: true,
          tip: `💡 Dica: Você ainda não modificou nenhum arquivo ou nada foi salvo. Abra 'chamada.txt' no editor, digite seu nome e salve (Ctrl+S).`,
          // Sem comando: o próximo passo aqui NÃO é um comando de
          // terminal — é editar o arquivo no editor e salvar. A pista
          // aparece sozinha, sem botão "Revelar comando".
          tipDetail: {
            pista: "Nada para registrar ainda. Abra chamada.txt no editor, escreva sua linha e salve antes de preparar e commitar.",
          },
          newState,
        };
      }

      const stagedList = Array.from(newState.stagedFiles);
      const stagedDeletions = stagedList.filter((f) => newState.deletedFiles.has(f));
      const commitHash = generateHash();
      const newCommit: Commit = {
        id: `commit-${Date.now()}`,
        hash: commitHash,
        author: newState.student.name,
        authorTurma: newState.student.turma,
        message: commitMessage,
        timestamp: new Date().toISOString(),
        filesChanged: stagedList,
        // Exclusões registradas neste commit — o push usa esta lista
        // (precisa) para propagar a exclusão ao repositório da turma.
        ...(stagedDeletions.length > 0 ? { filesDeleted: stagedDeletions } : {}),
      };

      newState.localCommits.unshift(newCommit);
      newState.stagedFiles.clear();
      // Exclusões commitadas saem do pendente (o arquivo continua fora da
      // pasta de trabalho; exclusões ainda não staged permanecem).
      stagedList.forEach((f) => newState.deletedFiles.delete(f));

      return {
        output:
          stagedDeletions.length > 0
            ? `[${newState.head} ${commitHash}] ${commitMessage}\n ${stagedList.length} file${stagedList.length > 1 ? "s" : ""} changed, ${stagedList.length - stagedDeletions.length} insertion${stagedList.length - stagedDeletions.length !== 1 ? "s" : ""}(+), ${stagedDeletions.length} deletion${stagedDeletions.length !== 1 ? "s" : ""}(-)`
            : `[${newState.head} ${commitHash}] ${commitMessage}\n ${stagedList.length} file${stagedList.length > 1 ? "s" : ""} changed, 1 insertion(+)`,
        isError: false,
        tip: `💡 Perfeito! Commit gravado localmente no histórico!\n👉 Próximo passo: Envie para o GitHub executando:\ngit push origin ${newState.head}`,
        tipDetail: {
          pista: "O commit está só no seu computador. Envie-o para o repositório da turma.",
          comando: `git push origin ${newState.head}`,
        },
        newState,
        stepCompleted: "commit",
      };
    }

    // GIT PUSH
    if (gitSubCmd === "push") {
      const localOnlyCommits = newState.localCommits.filter(
        (lc) => !newState.remoteRepo.commits.some((rc) => rc.hash === lc.hash)
      );

      if (localOnlyCommits.length === 0) {
        return {
          output: "Everything up-to-date",
          isError: false,
          tip: "💡 Todas as suas alterações já estão sincronizadas com o GitHub!",
          newState,
        };
      }

      // Modo de transferência: o push pede uma credencial SIMULADA antes
      // de enviar. Nada real é pedido, enviado ou persistido — a próxima
      // linha digitada é consumida e descartada (ver topo da função).
      if (newState.transferMode && !newState.awaitingSimulatedCredential) {
        newState.awaitingSimulatedCredential = true;
        return {
          output: `⚠️ SIMULAÇÃO — não é o GitHub de verdade.\nUsername for '${newState.remoteRepo.cloneUrl}':\n(Digite qualquer valor simulado e tecle Enter. NÃO digite sua senha real: o valor será descartado e nunca enviado ou salvo.)`,
          isError: false,
          tip: "⚠️ SIMULAÇÃO: no GitHub de verdade o push pede login — aqui o valor digitado é descartado.",
          newState,
        };
      }

      const latestCommit = localOnlyCommits[0];
      const prevHash = newState.remoteRepo.commits[0]?.hash || "0000000";

      // Gate R1: o envio em si é válido como git e acontece (o chamador
      // escreve no repositório da turma com pushedCommit), mas o crédito
      // do passo de push/conclusão só vem quando o commit inclui o
      // chamada.txt e o arquivo traz o nome completo do aluno.
      if (!pushCountsForCompletion(latestCommit, newState.files, newState.repoFolder, newState.student.name)) {
        return {
          output: `Enumerating objects: 5, done.
Counting objects: 100% (5/5), done.
Writing objects: 100% (3/3), done.
Total 3 (delta 1), reused 0 (delta 0)
To ${newState.remoteRepo.cloneUrl}
   ${prevHash}..${latestCommit.hash}  ${newState.head} -> ${newState.head}
⚠️ Este envio foi registrado, mas não conta como conclusão: o chamada.txt enviado não traz seu nome completo. Confira o arquivo e envie de novo.`,
          isError: false,
          tip: "💡 Dica: O envio foi registrado, mas a conclusão pede o chamada.txt com seu nome completo. Abra o arquivo, confira sua linha e envie de novo.",
          newState,
          pushedCommit: latestCommit,
        };
      }

      // Atualiza os arquivos no estado
      return {
        output: `Enumerating objects: 5, done.
Counting objects: 100% (5/5), done.
Writing objects: 100% (3/3), done.
Total 3 (delta 1), reused 0 (delta 0)
To ${newState.remoteRepo.cloneUrl}
   ${prevHash}..${latestCommit.hash}  ${newState.head} -> ${newState.head}`,
        isError: false,
        tip: `🎉 SUCESSO TOTAL! Seu commit foi enviado para o repositório da turma!\n👉 Acesse a aba 'GitHub' para ver seu nome na chamada e seu commit no histórico!`,
        newState,
        pushedCommit: latestCommit,
        stepCompleted: "push",
      };
    }

    // GIT LOG
    if (gitSubCmd === "log") {
      if (newState.localCommits.length === 0) {
        return { output: "fatal: your current branch 'main' does not have any commits yet", isError: false, newState };
      }

      const logOutput = newState.localCommits
        .map((c) => {
          const dateStr = new Date(c.timestamp).toLocaleString("pt-BR");
          return `\x1b[33mcommit ${c.hash}\x1b[0m\nAuthor: ${c.author} <${c.authorTurma}>\nDate:   ${dateStr}\n\n    ${c.message}\n`;
        })
        .join("\n");

      return { output: logOutput, isError: false, newState };
    }

    // GIT DIFF — real: compara o conteúdo SALVO com a base do clone.
    // (O editor só alimenta o motor ao salvar com Ctrl+S / botão Salvar;
    // texto apenas digitado, sem salvar, NÃO aparece aqui — como no Git.)
    if (gitSubCmd === "diff") {
      const cached = args.includes("--cached") || args.includes("--staged");
      const fileArg = args.slice(2).find((a) => !a.startsWith("-"));
      const targets = cached
        ? [...newState.stagedFiles]
        : [
            ...[...newState.modifiedFiles].filter((f) => !newState.stagedFiles.has(f)),
            // Excluído não staged: base → vazio rende só linhas "-" no diff.
            ...[...newState.deletedFiles].filter((f) => !newState.stagedFiles.has(f)),
          ];
      const filtered = fileArg ? targets.filter((f) => f === fileArg) : targets;

      if (filtered.length === 0) {
        const untrackedOnly = !cached && newState.modifiedFiles.size === 0 && newState.untrackedFiles.size > 0;
        return {
          output: "",
          isError: false,
          tip: untrackedOnly
            ? "💡 Arquivos novos (untracked) não aparecem no 'git diff'. Use 'git add' para prepará-los primeiro."
            : "💡 Nenhuma alteração pendente no momento para exibir no diff.",
          newState,
        };
      }

      const blocks: string[] = [];
      for (const cleanName of filtered) {
        const fullPath = `${newState.repoFolder}/${cleanName}`;
        const base = newState.baseFiles[fullPath] ?? newState.remoteRepo.files[cleanName] ?? "";
        const current = newState.files[fullPath] ?? "";
        const hunks = lineDiff(base, current);
        if (!hunks.some((h) => h.type !== " ")) continue;
        const rendered = hunks
          .map((h) =>
            h.type === "+"
              ? `\x1b[32m+${h.text}\x1b[0m`
              : h.type === "-"
                ? `\x1b[31m-${h.text}\x1b[0m`
                : ` ${h.text}`
          )
          .join("\n");
        blocks.push(
          `diff --git a/${cleanName} b/${cleanName}\n--- a/${cleanName}\n+++ b/${cleanName}\n${rendered}`
        );
      }

      if (blocks.length === 0) {
        return {
          output: "",
          isError: false,
          tip: "💡 Nenhuma alteração pendente no momento para exibir no diff.",
          newState,
        };
      }

      return {
        output: blocks.join("\n"),
        isError: false,
        tip: "💡 O 'git diff' mostra exatamente o que foi adicionado (em verde) ou removido (em vermelho) antes do commit!",
        newState,
      };
    }

    // GIT BRANCH — listar ou criar. (Modelo simplificado da Aula 2: as
    // branches compartilham o mesmo conteúdo de trabalho; o que o motor
    // registra de verdade é a lista e a branch ativa.)
    if (gitSubCmd === "branch") {
      const nameArg = args.slice(2).find((a) => !a.startsWith("-"));
      const deleteFlag = args.includes("-d") || args.includes("-D");
      if (deleteFlag && nameArg) {
        if (nameArg === newState.head) {
          return {
            output: `error: Cannot delete branch '${nameArg}' checked out at '${newState.head}'`,
            isError: true,
            tip: `💡 Dica: Troque para outra branch antes de apagar a atual.`,
            newState,
          };
        }
        if (!newState.branches.includes(nameArg)) {
          return {
            output: `error: branch '${nameArg}' not found.`,
            isError: true,
            tip: `💡 Dica: Liste as branches com 'git branch' para ver os nomes existentes.`,
            newState,
          };
        }
        newState.branches = newState.branches.filter((b) => b !== nameArg);
        return { output: `Deleted branch ${nameArg}.`, isError: false, newState };
      }
      if (nameArg) {
        if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(nameArg)) {
          return {
            output: `fatal: '${nameArg}' is not a valid branch name.`,
            isError: true,
            tip: `💡 Dica: Use só letras, números, '-', '_' e '/' no nome da branch, sem espaços.`,
            newState,
          };
        }
        if (newState.branches.includes(nameArg)) {
          return {
            output: `fatal: A branch '${nameArg}' already exists.`,
            isError: true,
            tip: `💡 Dica: Use 'git checkout ${nameArg}' para trocar para a branch existente.`,
            newState,
          };
        }
        newState.branches = [...newState.branches, nameArg];
        return { output: `Created branch '${nameArg}'.`, isError: false, newState };
      }
      const listing = newState.branches
        .map((b) => (b === newState.head ? `* \x1b[32m${b}\x1b[0m` : `  ${b}`))
        .join("\n");
      return {
        output: listing,
        isError: false,
        tip: `💡 O asterisco (*) e a cor verde indicam que sua branch atual ativa é a '${newState.head}'.`,
        newState,
      };
    }

    // GIT CHECKOUT / SWITCH — trocar de branch (checkout -b cria e troca).
    if (gitSubCmd === "checkout" || gitSubCmd === "switch") {
      const createFlag = args.includes("-b") || args.includes("-c");
      const nameArg = args.slice(2).find((a) => !a.startsWith("-"));
      if (!nameArg) {
        return {
          output: `usage: git ${gitSubCmd} <branch>`,
          isError: true,
          tip: `💡 Dica: Informe a branch, por exemplo: git checkout ${newState.branches[0] ?? "main"}.`,
          newState,
        };
      }
      if (createFlag) {
        if (newState.branches.includes(nameArg)) {
          return {
            output: `fatal: A branch '${nameArg}' already exists.`,
            isError: true,
            tip: `💡 Dica: A branch já existe — troque para ela sem o -b: git checkout ${nameArg}.`,
            newState,
          };
        }
        newState.branches = [...newState.branches, nameArg];
        newState.head = nameArg;
        return { output: `Switched to a new branch '${nameArg}'`, isError: false, newState };
      }
      if (!newState.branches.includes(nameArg)) {
        return {
          output: `error: pathspec '${nameArg}' did not match any file(s) known to git`,
          isError: true,
          tip: `💡 Dica: A branch '${nameArg}' não existe. Liste com 'git branch' ou crie com 'git checkout -b ${nameArg}'.`,
          newState,
        };
      }
      newState.head = nameArg;
      return { output: `Switched to branch '${nameArg}'`, isError: false, newState };
    }

    // GIT PULL — traz o remoto; divergência na mesma linha vira conflito
    // simulado com marcadores, resolvível editando + add + commit + push.
    if (gitSubCmd === "pull") {
      if (newState.conflictedFiles.size > 0) {
        return {
          output: `error: you need to resolve your current index first`,
          isError: true,
          tip: `💡 Dica: Resolva o conflito atual (edite os marcadores e faça 'git add') antes de puxar de novo.`,
          newState,
        };
      }
      const remoteFiles = newState.remoteRepo.files;
      const localOnly = newState.localCommits.filter(
        (lc) => !newState.remoteRepo.commits.some((rc) => rc.hash === lc.hash)
      );
      let changed = false;
      let conflictFile: string | null = null;
      for (const cleanName of Object.keys(remoteFiles)) {
        const fullPath = `${newState.repoFolder}/${cleanName}`;
        const base = newState.baseFiles[fullPath] ?? remoteFiles[cleanName];
        const local = newState.files[fullPath] ?? "";
        const remote = remoteFiles[cleanName];
        if (local === remote) continue;
        if (local === base) {
          newState.files[fullPath] = remote;
          changed = true;
          continue;
        }
        if (remote === base) continue; // só o local mudou: nada a trazer
        // Só a chamada.txt usa união no push — só ela precisa da
        // detecção de variante (mergeChamadaWithVariantConflicts); os
        // demais arquivos usam o merge posicional puro.
        const merged =
          cleanName === "chamada.txt"
            ? mergeChamadaWithVariantConflicts(base, local, remote, newState.head)
            : threeWayMerge(base, local, remote, newState.head);
        if (merged.hasConflict) {
          newState.files[fullPath] = merged.merged;
          newState.conflictedFiles.add(cleanName);
          // Novo conflito reabre o passo de resolução da Aula 2.
          newState.hasResolvedConflict = false;
          // Arquivo em conflito volta a ser "modificado", não staged.
          newState.stagedFiles.delete(cleanName);
          newState.modifiedFiles.add(cleanName);
          conflictFile = cleanName;
          changed = true;
        } else {
          newState.files[fullPath] = merged.merged;
          changed = true;
        }
      }
      if (conflictFile) {
        return {
          output: `CONFLICT (content): Merge conflict in ${conflictFile}\nAutomatic merge failed; fix conflicts and then commit the result.`,
          isError: true,
          tip: `💡 Dica: Abra o arquivo, apague os marcadores <<<<<<< / ======= / >>>>>>> deixando o conteúdo certo, salve (Ctrl+S) e execute 'git add ${conflictFile}'.`,
          tipDetail: {
            pista: "Abra o arquivo em conflito, escolha o conteúdo certo apagando os marcadores e prepare o arquivo resolvido.",
            comando: `git add ${conflictFile}`,
          },
          newState,
        };
      }
      // Sincroniza o histórico local com o remoto (sem duplicar commits).
      const knownIds = new Set(newState.localCommits.map((c) => c.id));
      const remoteNew = newState.remoteRepo.commits.filter((c) => !knownIds.has(c.id));
      if (remoteNew.length > 0) {
        newState.localCommits = [...localOnly, ...newState.remoteRepo.commits];
        changed = true;
      }
      if (!changed) {
        newState.hasPulled = true;
        return { output: "Already up to date.", isError: false, newState };
      }
      newState.hasPulled = true;
      return {
        output: `Updating ${newState.remoteRepo.commits[0]?.hash ?? "0000000"}..HEAD\nFast-forward\nSeu conteúdo local foi atualizado com as novidades do remoto.`,
        isError: false,
        tip: "💡 O 'git pull' trouxe as novidades do remoto para o seu computador. Confira com 'git status'.",
        newState,
      };
    }

    // GIT CONFIG — só registra nome/e-mail simulados no estado local.
    // Nada é enviado a lugar nenhum; não há conta, senha ou token aqui.
    if (gitSubCmd === "config") {
      const listFlag = args.includes("--list") || args.includes("-l");
      if (listFlag) {
        const lines = [
          ...(newState.gitIdentity.name ? [`user.name=${newState.gitIdentity.name}`] : []),
          ...(newState.gitIdentity.email ? [`user.email=${newState.gitIdentity.email}`] : []),
        ];
        return { output: lines.join("\n"), isError: false, newState };
      }
      const key = args[2];
      const value = args[3];
      if (key === "user.name" || key === "user.email") {
        if (value === undefined) {
          const stored = key === "user.name" ? newState.gitIdentity.name : newState.gitIdentity.email;
          return { output: stored ?? "", isError: false, newState };
        }
        if (key === "user.name") newState.gitIdentity.name = value;
        else newState.gitIdentity.email = value;
        return {
          output: "",
          isError: false,
          tip: `💡 Identidade simulada registrada só neste simulador (${key}=${value}). Nada foi enviado a lugar nenhum.`,
          newState,
        };
      }
      return {
        output: `error: key '${key ?? ""}' is not supported in this simulator`,
        isError: true,
        tip: `💡 Dica: Neste simulador só há 'git config user.name "Seu Nome"' e 'git config user.email "voce@exemplo.com"'.`,
        newState,
      };
    }

    // GIT RM — exclui da pasta de trabalho E já prepara a exclusão (como
    // no Git de verdade). Se o arquivo já estava excluído sem staged, o
    // `git rm` só prepara a exclusão pendente.
    if (gitSubCmd === "rm") {
      const target = args.slice(2).find((a) => !a.startsWith("-"));
      if (!target) {
        return {
          output: "usage: git rm <arquivo>",
          isError: true,
          tip: "💡 Dica: Informe o arquivo: 'git rm README.md'.",
          newState,
        };
      }
      const clean = cleanFileArg(newState, target);
      const fullPath = `${newState.repoFolder}/${clean}`;
      if (newState.files[fullPath] !== undefined) {
        applyWorkingTreeDeletion(newState, clean);
      } else if (!newState.deletedFiles.has(clean)) {
        return {
          output: `fatal: pathspec '${target}' did not match any files`,
          isError: true,
          tip: `💡 Dica: O arquivo '${target}' não foi encontrado. Use 'ls' para ver o nome correto.`,
          newState,
        };
      }
      newState.stagedFiles.add(clean);
      return {
        output: `rm '${clean}'`,
        isError: false,
        tip: `💡 Exclusão de '${clean}' preparada (staged).`,
        tipDetail: {
          pista: `A exclusão de '${clean}' está preparada. Registre o commit ou recupere o arquivo.`,
          comando: `git commit -m "Remove ${clean}"`,
        },
        newState,
      };
    }

    // GIT RESTORE — neste simulador, só recupera arquivos excluídos
    // (restaurar edições não é um comando implementado; o erro diz isso).
    // `--staged` sobre uma exclusão staged só a devolve para não staged.
    if (gitSubCmd === "restore") {
      const target = args.slice(2).find((a) => !a.startsWith("-"));
      if (!target) {
        return {
          output: "usage: git restore <arquivo>",
          isError: true,
          tip: "💡 Dica: Informe o arquivo: 'git restore README.md'.",
          newState,
        };
      }
      const clean = cleanFileArg(newState, target);
      if (!newState.deletedFiles.has(clean)) {
        return {
          output: `error: o arquivo '${target}' não está excluído — neste simulador, 'git restore' só recupera arquivos excluídos.`,
          isError: true,
          tip: "💡 Dica: Para desfazer uma edição, abra o arquivo no editor e salve o conteúdo anterior.",
          newState,
        };
      }
      if (args.includes("--staged")) {
        newState.stagedFiles.delete(clean);
        return {
          output: "",
          isError: false,
          tip: `💡 Exclusão de '${clean}' voltou para não staged (o arquivo continua fora da pasta de trabalho).`,
          newState,
        };
      }
      const fullPath = `${newState.repoFolder}/${clean}`;
      const restored = newState.baseFiles[fullPath] ?? newState.remoteRepo.files[clean];
      if (restored === undefined) {
        return {
          output: `error: não é possível recuperar '${target}': o arquivo não estava no repositório clonado.`,
          isError: true,
          newState,
        };
      }
      newState.files[fullPath] = restored;
      newState.deletedFiles.delete(clean);
      newState.stagedFiles.delete(clean);
      if (restored !== (newState.baseFiles[fullPath] ?? "")) {
        newState.modifiedFiles.add(clean);
      }
      return {
        output: "",
        isError: false,
        tip: `💡 Arquivo '${clean}' recuperado na pasta de trabalho.`,
        newState,
      };
    }

    return {
      output: `git: '${gitSubCmd}' não é um comando git suportado neste simulador.\nDigite 'help' para ver os comandos.`,
      isError: true,
      tip: `💡 Dica: Use os comandos principais: git clone, git status, git add, git commit -m "...", git push, git diff, git branch, git checkout, git pull, git config, git log, git rm, git restore.`,
      newState,
    };
  }

  // Comando não reconhecido
  return {
    output: `bash: ${cmd}: comando não encontrado`,
    isError: true,
    tip: `💡 Dica: Digite 'help' para ver a lista de comandos disponíveis no simulador.`,
    newState,
  };
}

// Quebra comandos encadeados por && respeitando aspas
function splitByLogicalAnd(input: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes: string | null = null;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if ((char === '"' || char === "'") && (i === 0 || input[i - 1] !== "\\")) {
      if (inQuotes === char) {
        inQuotes = null;
      } else if (!inQuotes) {
        inQuotes = char;
      }
    }

    if (!inQuotes && char === "&" && input[i + 1] === "&") {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = "";
      i++; // pula o segundo &
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

export function executeTerminalCommand(
  rawCommand: string,
  state: GitEngineState
): CommandExecutionResult {
  const parts = splitByLogicalAnd(rawCommand);

  if (parts.length <= 1) {
    return executeSingleTerminalCommand(rawCommand, state);
  }

  let currentState = state;
  const outputs: string[] = [];
  let lastTip: string | undefined;
  let lastTipDetail: TipDetail | undefined;
  let pushedCommit: Commit | undefined;
  let stepCompleted: "clone" | "edit" | "commit" | "push" | undefined;
  let consumedSimulatedCredential = false;

  for (const part of parts) {
    if (!part) continue;
    const result = executeSingleTerminalCommand(part, currentState);
    if (result.output) {
      outputs.push(result.output);
    }
    currentState = result.newState;
    if (result.tip) lastTip = result.tip;
    if (result.tipDetail) lastTipDetail = result.tipDetail;
    if (result.pushedCommit) pushedCommit = result.pushedCommit;
    if (result.stepCompleted) stepCompleted = result.stepCompleted;
    if (result.consumedSimulatedCredential) consumedSimulatedCredential = true;

    if (result.isError) {
      return {
        output: outputs.join("\n"),
        isError: true,
        tip: `⚠️ O comando '${part}' falhou. Os comandos seguintes da cadeia não foram executados.\n${result.tip || ""}`.trim(),
        tipDetail: result.tipDetail,
        newState: currentState,
        pushedCommit,
        stepCompleted,
        consumedSimulatedCredential,
      };
    }
  }

  return {
    output: outputs.join("\n"),
    isError: false,
    tip: lastTip,
    tipDetail: lastTipDetail,
    newState: currentState,
    pushedCommit,
    stepCompleted,
    consumedSimulatedCredential: consumedSimulatedCredential || undefined,
  };
}
