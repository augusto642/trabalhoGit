export interface Student {
  id: string;
  name: string;
  turma: string;
  hasCloned: boolean;
  hasEdited: boolean;
  hasCommitted: boolean;
  hasPushed: boolean;
  score: number;
  totalCommands: number;
  errorCommands: number;
  createdAt: string;
  lastActive: string;
  /**
   * Componentes da nota (frente MOTOR + NOTA; campos opcionais para não
   * quebrar alunos antigos nem o painel/CSV — valores ausentes valem 0).
   * - masteredConcepts: conceitos que o aluno DEMONSTROU dominar com um
   *   comando bem-sucedido (ex.: "staging", "clone-url"). Vale de
   *   primeira OU após erro: errar-e-recuperar é uma evidência de
   *   domínio, acertar de primeira é evidência equivalente. Cada
   *   conceito distinto vale pontos em computeScore
   *   (src/lib/gitEngine.ts). Registros antigos podem trazer o campo
   *   legado `recoveredErrorConcepts`; a leitura faz a união dele aqui
   *   (validate.ts / db.ts) para não perder o histórico.
   * - diagnosticCommands: comandos de diagnóstico já usados
   *   ("status" | "diff" | "log") antes de agir.
   * - unaidedScore: pontos (0–10) da segunda atividade sem ajuda. Gancho:
   *   a UI da segunda atividade ainda não existe; o campo já é somado
   *   pela nota quando preenchido.
   */
  masteredConcepts?: string[];
  diagnosticCommands?: string[];
  unaidedScore?: number;
  /**
   * Progresso da Aula 2 espelhado do motor (correção D1; campos opcionais
   * para não quebrar alunos antigos nem o CSV — valores ausentes valem
   * "nunca aconteceu"). A home lê DAQUI, sem erguer o gitState para o
   * contexto; o VSCodeView copia cada fato do GitEngineState para cá a
   * cada comando (mesmo padrão de hasCloned/hasCommitted/hasPushed).
   * - hasPulled: true após um `git pull` bem-sucedido; undefined = nunca
   *   houve pull (o motor nunca zera esta flag, o espelho também não).
   * - hasResolvedConflict: três estados — undefined = nunca houve
   *   conflito; false = conflito ativo (passo reaberto); true = resolvido
   *   via `git add` do arquivo em conflito. Um novo conflito via pull
   *   zera a flag no motor e o espelho acompanha (nunca fica true
   *   travado). Quando não há conflito nem resolução neste comando, o
   *   valor anterior é preservado (undefined segue undefined).
   * - transferCompleted: true SÓ quando a credencial simulada foi
   *   consumida (P4) — nunca por hasPushed: um push "up to date" ou da
   *   Aula 1 não conclui o passo "Git de verdade".
   */
  hasPulled?: boolean;
  hasResolvedConflict?: boolean;
  transferCompleted?: boolean;
}

export interface CommandLog {
  id: string;
  studentId: string;
  studentName: string;
  turma: string;
  command: string;
  output: string;
  isError: boolean;
  tip?: string;
  timestamp: string;
}

export interface Commit {
  id: string;
  hash: string;
  author: string;
  authorTurma: string;
  message: string;
  timestamp: string;
  filesChanged: string[];
  /** Nomes limpos excluídos neste commit (só quando há exclusões). */
  filesDeleted?: string[];
}

export interface Repository {
  id: string;
  /**
   * Turma dona deste repositório ("201" ou "202"). Opcional só para não
   * quebrar repositórios antigos lidos do armazenamento (sem o campo): a
   * partição/migração preenche o campo antes de qualquer escrita, e a
   * validação da API exige turma conhecida em todo POST.
   */
  turma?: string;
  name: string;
  owner: string;
  description: string;
  defaultBranch: string;
  cloneUrl: string;
  files: Record<string, string>;
  commits: Commit[];
  updatedAt: string;
}

export interface StepStatus {
  step: number;
  title: string;
  description: string;
  commandSuggestion?: string;
  completed: boolean;
}
