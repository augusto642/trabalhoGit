"use client";

import React, { useState, useEffect, useRef } from "react";
import { Student, Repository, CommandLog, Commit } from "@/lib/types";
import {
  GitEngineState,
  TipDetail,
  createInitialGitState,
  executeTerminalCommand,
  hasNewLineWithFullName,
  computeScore,
  conceptsResolvedByCommand,
  diagnosticCommandOf,
} from "@/lib/gitEngine";
import { addCommandLog, saveStudent, pushCommitToRepo, removeStudentContributions } from "@/lib/storage";
import confetti from "canvas-confetti";
import {
  Files,
  GitBranch,
  Terminal as TerminalIcon,
  Play,
  Save,
  CheckCircle2,
  AlertCircle,
  Folder,
  FileCode,
  FileText,
  BookOpen,
  Search,
  Blocks,
  X,
  ChevronRight,
  ChevronDown,
  Trash2,
  RotateCcw,
  Sparkles,
  Info,
  User,
  Settings,
  RefreshCw,
  Bell,
  Cloud,
  PanelLeft,
} from "lucide-react";

/** Ícone por extensão, como no VS Code de verdade. */
function fileIcon(fileName: string) {
  if (fileName.endsWith(".md")) return BookOpen;
  if (fileName.endsWith(".txt")) return FileText;
  return FileCode;
}
import { TaskCompletionModal } from "../TaskCompletionModal";
import { GlossaryModal } from "../GlossaryModal";
import {
  ACTIVITY_MODES,
  ActivityMode,
  UNAIDED_OBJECTIVES,
  computeUnaidedScore,
  getStoredActivityMode,
  guidedSteps,
  lesson2Steps,
  setStoredActivityMode,
} from "@/lib/activity";

/** Cores ANSI que o motor emite (gitEngine): 31 vermelho, 32 verde,
 *  33 amarelo, 34 azul, 0 reset. O <pre> do terminal NÃO interpreta
 *  ANSI — sem este parser o aluno via "[31m" literal no git status. */
const ANSI_COLORS: Record<string, string> = {
  "31": "text-red-400",
  "32": "text-emerald-400",
  "33": "text-amber-400",
  "34": "text-blue-400",
};

/** Renderiza saída do terminal interpretando os códigos ANSI do motor.
 *  Sequência desconhecida é descartada (nunca exibida como lixo). */
function renderAnsi(text: string): React.ReactNode[] {
  const parts = text.split(/(\x1b\[[0-9;]*m)/g);
  const nodes: React.ReactNode[] = [];
  let color = "";
  parts.forEach((part, i) => {
    const m = part.match(/^\x1b\[([0-9;]*)m$/);
    if (m) {
      color = m[1] === "0" ? "" : (ANSI_COLORS[m[1]] ?? color);
      return;
    }
    if (part === "") return;
    nodes.push(
      color ? (
        <span key={i} className={color}>
          {part}
        </span>
      ) : (
        <React.Fragment key={i}>{part}</React.Fragment>
      )
    );
  });
  return nodes;
}

/** Prompt com as cores de um shell de verdade: usuário em verde, caminho
 *  em azul, branch em ciano. O prompt é gerado por nós em dois formatos
 *  conhecidos ("aluno@gitsim:~$" e "aluno@gitsim:~/pasta (branch)$");
 *  qualquer outro formato cai para texto simples. */
function renderPrompt(prompt: string): React.ReactNode {
  const m = prompt.match(/^([^@]+@[^:]+):(.*?)(?: \((.*?)\))?\$$/);
  if (!m) return <span className="text-emerald-400 font-semibold">{prompt}</span>;
  return (
    <span className="font-semibold">
      <span className="text-emerald-400">{m[1]}</span>
      <span className="text-gray-400">:</span>
      <span className="text-blue-400">{m[2]}</span>
      {m[3] && (
        <span className="text-cyan-400 font-normal"> ({m[3]})</span>
      )}
      <span className="text-gray-200">$</span>
    </span>
  );
}

interface Props {
  student: Student;
  repository: Repository;
  onStudentUpdate: (updated: Student) => void;
  onRepoUpdate: (updated: Repository, opts?: { pruneStudent?: string; pruneStudentId?: string }) => void;
}

interface TerminalHistoryItem {
  prompt: string;
  command: string;
  output: string;
  isError: boolean;
  tip?: string;
  tipDetail?: TipDetail;
}

// Mensagem de boas-vindas do terminal — o estado inicial do terminal, para
// o qual o botão Reiniciar também volta (sem comando pronto na mensagem:
// o aluno começa pelo Guia da atividade).
const INITIAL_TERMINAL_HISTORY: TerminalHistoryItem[] = [
  {
    prompt: "aluno@gitsim:~$",
    command: "",
    output: `Bem-vindo ao terminal do VS Code simulado! 🚀\nComece pelo Guia da atividade (painel acima do terminal) e pela aba GitHub simulado.\n\nDigite 'help' para ver os comandos disponíveis.`,
    isError: false,
  },
];

export const VSCodeView: React.FC<Props> = ({
  student,
  repository,
  onStudentUpdate,
  onRepoUpdate,
}) => {
  // Estado do Git e arquivos
  const [gitState, setGitState] = useState<GitEngineState>(() =>
    createInitialGitState(student, repository)
  );

  // Editor de código
  const [openFiles, setOpenFiles] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState<string>("");
  const [isModified, setIsModified] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string>("");
  const [showCompletionModal, setShowCompletionModal] = useState<boolean>(false);
  // Frente MOTOR + NOTA: NÃO há autosave. Texto digitado vive aqui (por
  // arquivo) até Ctrl+S / botão Salvar — só o conteúdo SALVO alimenta o
  // motor (git status / diff / commit). Trocar de aba não perde o texto.
  const [unsavedEdits, setUnsavedEdits] = useState<Record<string, string>>({});
  // Índices do histórico do terminal com o comando da dica revelado.
  const [revealedTipIndexes, setRevealedTipIndexes] = useState<Set<number>>(new Set());
  // Frente UI/UX — modo de atividade (home → VS Code via localStorage).
  // Inicial "guided" + sincronização pós-montagem, para não quebrar a
  // hidratação (o servidor não tem o valor do localStorage).
  const [activityMode, setActivityMode] = useState<ActivityMode>("guided");
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(true);

  useEffect(() => {
    // Leitura pós-montagem de propósito (mesmo padrão do ProfessorView):
    // localStorage não existe na pré-renderização do servidor. O guia
    // começa aberto em todos os modos; no "Sem receita" ele só mostra
    // objetivos, sem comando revelável, então abrir por padrão não vaza nada.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActivityMode(getStoredActivityMode());
  }, []);
  const [revealedGuideSteps, setRevealedGuideSteps] = useState<Set<string>>(new Set());
  const [revealCloneHint, setRevealCloneHint] = useState(false);
  const [revealQuickCommands, setRevealQuickCommands] = useState(false);
  const [revealConflictCommand, setRevealConflictCommand] = useState(false);

  const changeActivityMode = (next: ActivityMode) => {
    setActivityMode(next);
    setStoredActivityMode(next);
    setRevealedGuideSteps(new Set());
    setGuideOpen(next !== "unaided");
  };

  // Passos do guia do modo atual (fonte: src/lib/activity.ts). No modo
  // "Sem receita" os passos não trazem comando revelável.
  const guideSteps =
    activityMode === "guided"
      ? guidedSteps(repository.cloneUrl, repository.name)
      : activityMode === "lesson2"
        ? lesson2Steps(repository.name)
        : UNAIDED_OBJECTIVES;

  // Passos da Aula 2 mapeados para estados determináveis do motor (P5):
  // branch = criada (lista/head), pull = executado com sucesso
  // (hasPulled), conflito = resolvido via add do arquivo (flag do motor;
  // false enquanto houver conflito ativo, undefined se nunca houve),
  // transferência = credencial simulada consumida (P4 — nunca
  // transferMode + hasPushed: um push "up to date" sem credencial não
  // conclui o passo). `git merge` segue fora do escopo (trabalho futuro,
  // ver README — Limitações honestas).
  const guideDone: Record<string, boolean | undefined> = {
    clone: student.hasCloned,
    edit: student.hasEdited,
    "add-commit": student.hasCommitted,
    push: student.hasPushed,
    branch: gitState.branches.length > 1 || gitState.head !== "main",
    "edit-branch": student.hasEdited,
    pull: gitState.hasPulled,
    conflict: gitState.hasResolvedConflict
      ? true
      : gitState.conflictedFiles.size > 0
        ? false
        : undefined,
    transfer: gitState.transferCredentialConsumed,
  };

  // Terminal
  const [terminalHistory, setTerminalHistory] = useState<TerminalHistoryItem[]>(INITIAL_TERMINAL_HISTORY);
  const [currentInput, setCurrentInput] = useState("");
  const [commandHistoryList, setCommandHistoryList] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Sidebar do VS Code
  const [activeSidebar, setActiveSidebar] = useState<"explorer" | "git">("explorer");
  const [isRepoFolderOpen, setIsRepoFolderOpen] = useState(true);
  // Confirmação em 2 toques da exclusão no Explorer: o primeiro toque no
  // lixo arma a confirmação na linha; o segundo exclui de verdade. Sem
  // diálogo bloqueante (o headless e o celular agradecem) e sem trava de
  // professor — excluir o próprio arquivo é ação do aluno.
  const [confirmDeletePath, setConfirmDeletePath] = useState<string | null>(null);
  // Mobile: sidebar colapsável. Em desktop (md+) ela está sempre visível
  // (md:flex prevalece sobre "hidden"), então o estado só afeta telas pequenas.
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  // Padrões de visibilidade por tamanho de tela (correção do editor, 28/10):
  // com sidebar (256px) + guia aberto + terminal fixo, o editor ficava
  // com ~24px de altura em telas baixas (1024×600, sem conseguir clicar)
  // e ~38px de largura no celular (sidebar comendo a tela). Em telas
  // estreitas a sidebar começa oculta e em telas baixas o guia começa
  // fechado — ambos voltam com um clique (botão de painel / "Mostrar
  // guia"), então nada de funcionalidade é perdido. Só pós-montagem, para
  // não quebrar a hidratação (o servidor não conhece o viewport).
  // Dois efeitos separados, um setState cada, no mesmo padrão do efeito
  // de activityMode acima.
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsSidebarVisible(false);
    }
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerHeight < 760) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGuideOpen(false);
    }
  }, []);

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const terminalBodyRef = useRef<HTMLDivElement>(null);
  // "Grudar" no fim do terminal: true enquanto o aluno está perto do
  // fim; vira false quando ele rola para cima para ler (ver onScroll).
  const stickToBottomRef = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);
  // Posição real do cursor no editor (status bar Ln/Col, como no VS Code).
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(1);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  // Guarda da restauração de sessão: qual aluno já teve a sessão
  // restaurada (ver o efeito "Restaura sessão" abaixo).
  const restoredStudentRef = useRef<string | null>(null);
  const updateCursor = () => {
    const el = editorRef.current;
    if (!el) return;
    const before = el.value.slice(0, el.selectionStart ?? 0);
    const lines = before.split("\n");
    setCursorLine(lines.length);
    setCursorCol(lines[lines.length - 1].length + 1);
  };

  // Rola o terminal para o fim quando novo comando é executado — como
  // num terminal de verdade, só "gruda" no fim se o aluno já estava
  // perto dele; se ele rolou para cima para ler a saída, não puxa de
  // volta (o aluno volta ao fim rolando ou com o próximo comando).
  useEffect(() => {
    if (stickToBottomRef.current) {
      terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [terminalHistory]);

  // Atualiza aluno no Git State se mudar props
  useEffect(() => {
    queueMicrotask(() => {
      setGitState((prev) => ({
        ...prev,
        student,
        remoteRepo: repository,
      }));
    });
  }, [student, repository]);

  // Restaura sessão anterior do aluno do localStorage se existir.
  // CORREÇÃO (bug do editor, 27/10): este efeito rodava a CADA comando
  // do terminal, não só na entrada do aluno — as deps [student,
  // repository] mudam a cada onStudentUpdate (objeto novo a cada comando)
  // e a cada poll de /api/repository (JSON novo a cada 4s). Como ele é
  // declarado ANTES do efeito "Persiste estado", lia o snapshot ANTERIOR
  // do localStorage e REVERTIA o gitState, desfazendo o comando que
  // acabou de rodar: o aluno via "git add" sem erro, mas o "git status"
  // seguinte mostrava o arquivo ainda como "not staged" (e commit/push
  // na sequência falhavam do mesmo jeito). Restauração é evento de
  // entrada do aluno: dispara uma vez por student.id (mount + eventual
  // troca de aluno sem reload), nunca por comando.
  useEffect(() => {
    if (restoredStudentRef.current === student.id) return;
    restoredStudentRef.current = student.id;
    queueMicrotask(() => {
      try {
        const savedKey = `gitsim_state_${student.id}`;
        const savedRaw = localStorage.getItem(savedKey);
        if (savedRaw) {
          const parsed = JSON.parse(savedRaw);
          // Sessão do formato antigo (pasta chamada-turma-a, lista única):
          // não restaura — o aluno começa do zero no repositório da turma
          // dele, em vez de carregar arquivos da lista compartilhada.
          if (parsed.isRepoCloned && parsed.repoFolder === repository.name) {
            setGitState((prev) => ({
              ...prev,
              ...parsed,
              stagedFiles: new Set(parsed.stagedFiles || []),
              untrackedFiles: new Set(parsed.untrackedFiles || []),
              modifiedFiles: new Set(parsed.modifiedFiles || []),
              conflictedFiles: new Set(parsed.conflictedFiles || []),
              deletedFiles: new Set(parsed.deletedFiles || []),
              branches: parsed.branches || prev.branches,
              baseFiles: parsed.baseFiles || prev.baseFiles,
              gitIdentity: parsed.gitIdentity || prev.gitIdentity,
              student,
              remoteRepo: repository,
            }));
            const targetFile = `${parsed.repoFolder}/chamada.txt`;
            if (parsed.files && parsed.files[targetFile]) {
              setOpenFiles([targetFile]);
              setActiveFile(targetFile);
              setEditorContent(parsed.files[targetFile]);
            }
          }
        }
      } catch {
        // fallback
      }
    });
  }, [student.id, student, repository]);

  // Persiste estado do Git no localStorage sempre que alterado
  useEffect(() => {
    if (gitState.isRepoCloned) {
      try {
        const savedKey = `gitsim_state_${student.id}`;
        const serialized = {
          ...gitState,
          stagedFiles: Array.from(gitState.stagedFiles),
          untrackedFiles: Array.from(gitState.untrackedFiles),
          modifiedFiles: Array.from(gitState.modifiedFiles),
          conflictedFiles: Array.from(gitState.conflictedFiles),
          deletedFiles: Array.from(gitState.deletedFiles),
        };
        localStorage.setItem(savedKey, JSON.stringify(serialized));
      } catch {
        // fallback
      }
    }
  }, [gitState, student.id]);

  // SEM AUTOSAVE (frente MOTOR + NOTA): o arquivo só entra no motor
  // quando o aluno salva (Ctrl+S / botão Salvar, em handleSaveFile).
  // Digitar sem salvar deixa o editor marcado como "não salvo" e NÃO
  // aparece no git status nem no diff — como no Git de verdade.

  // Se o aluno clica em um arquivo para abrir no editor. Texto não salvo
  // (unsavedEdits) sobrevive à troca de aba; só o salvo vive no motor.
  const handleOpenFile = (filePath: string) => {
    if (!openFiles.includes(filePath)) {
      setOpenFiles((prev) => [...prev, filePath]);
    }
    activateFile(filePath);
  };

  // Ativa um arquivo já aberto (seletor do cabeçalho do editor, lista
  // "Open Editors" da sidebar). Mesma regra de handleOpenFile, sem
  // reabrir: texto não salvo sobrevive à troca.
  const activateFile = (filePath: string) => {
    setActiveFile(filePath);
    setEditorContent(unsavedEdits[filePath] ?? gitState.files[filePath] ?? "");
    setIsModified(filePath in unsavedEdits);
  };

  const handleCloseFile = (filePath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const remaining = openFiles.filter((f) => f !== filePath);
    setOpenFiles(remaining);
    if (activeFile === filePath) {
      if (remaining.length > 0) {
        const next = remaining[remaining.length - 1];
        setActiveFile(next);
        setEditorContent(unsavedEdits[next] ?? gitState.files[next] ?? "");
        setIsModified(next in unsavedEdits);
      } else {
        setActiveFile(null);
        setEditorContent("");
        setIsModified(false);
      }
    }
  };

  // Excluir arquivo pela UI (Explorer): exclusão na pasta de trabalho,
  // NÃO staged — o aluno prepara com `git add` depois, como no `rm` do
  // terminal. A exclusão supersede qualquer staged anterior do arquivo
  // (o conteúdo staged não existe mais) e fecha as abas abertas dele.
  const handleDeleteFile = (filePath: string) => {
    if (confirmDeletePath !== filePath) {
      setConfirmDeletePath(filePath);
      return;
    }
    setConfirmDeletePath(null);
    const cleanFileName = filePath.replace(`${gitState.repoFolder}/`, "");
    setGitState((prev) => {
      const files = { ...prev.files };
      delete files[filePath];
      const deletedFiles = new Set(prev.deletedFiles);
      deletedFiles.add(cleanFileName);
      const modifiedFiles = new Set(prev.modifiedFiles);
      modifiedFiles.delete(cleanFileName);
      const stagedFiles = new Set(prev.stagedFiles);
      stagedFiles.delete(cleanFileName);
      const untrackedFiles = new Set(prev.untrackedFiles);
      untrackedFiles.delete(cleanFileName);
      const conflictedFiles = new Set(prev.conflictedFiles);
      conflictedFiles.delete(cleanFileName);
      return {
        ...prev,
        files,
        deletedFiles,
        modifiedFiles,
        stagedFiles,
        untrackedFiles,
        conflictedFiles,
      };
    });
    const remaining = openFiles.filter((f) => f !== filePath);
    setOpenFiles(remaining);
    if (activeFile === filePath) {
      if (remaining.length > 0) {
        const next = remaining[remaining.length - 1];
        setActiveFile(next);
        setEditorContent(unsavedEdits[next] ?? gitState.files[next] ?? "");
        setIsModified(next in unsavedEdits);
      } else {
        setActiveFile(null);
        setEditorContent("");
        setIsModified(false);
      }
    }
    setUnsavedEdits((prev) => {
      const next = { ...prev };
      delete next[filePath];
      return next;
    });
  };

  // Botão Reiniciar (só do PRÓPRIO aluno, sem senha de professor): zera
  // tudo do aluno na tarefa e volta o GitHub simulado ao inicial para
  // ele. O que zera: estado local do Git (volta a pré-clone), arquivos,
  // abas, terminal, progresso (flags, comandos, nota) e as contribuições
  // dele no repositório da turma (commits dele + linhas dele na
  // chamada.txt — os colegas não são tocados). O que NÃO zera, de
  // propósito: os logs de comandos do professor (auditoria independente
  // em /api/logs) — o professor decide depois se quer que o log zere.
  // E o reset global do professor continua existindo, intocado.
  const [restartConfirmOpen, setRestartConfirmOpen] = useState(false);

  const handleRestartStudent = () => {
    const prunedRepo = removeStudentContributions(repository, student.name);
    const resetStudent: Student = {
      ...student,
      hasCloned: false,
      hasEdited: false,
      hasCommitted: false,
      hasPushed: false,
      totalCommands: 0,
      errorCommands: 0,
      diagnosticCommands: [],
      masteredConcepts: [],
      hasPulled: undefined,
      hasResolvedConflict: undefined,
      transferCompleted: undefined,
      score: 0,
      lastActive: new Date().toISOString(),
    };
    resetStudent.score = computeScore(resetStudent);

    // Sessão local antiga fora: sem isso, o restore de entrada a traria
    // de volta no próximo mount (o efeito de persistência não escreve
    // quando isRepoCloned é falso, então só remover resolve).
    try {
      localStorage.removeItem(`gitsim_state_${student.id}`);
    } catch {
      // fallback: sem localStorage, não há sessão a limpar
    }

    setGitState(createInitialGitState(resetStudent, prunedRepo));
    setOpenFiles([]);
    setActiveFile(null);
    setEditorContent("");
    setIsModified(false);
    setUnsavedEdits({});
    setTerminalHistory(INITIAL_TERMINAL_HISTORY);
    setCommandHistoryList([]);
    setHistoryIndex(-1);
    setConfirmDeletePath(null);
    setShowCompletionModal(false);
    setGuideOpen(true);
    setRevealedGuideSteps(new Set());
    setRevealCloneHint(false);
    setRevealQuickCommands(false);
    setRevealConflictCommand(false);
    setRevealedTipIndexes(new Set());
    setRestartConfirmOpen(false);

    // Sincroniza pela via existente (só a turma do aluno): localStorage +
    // POST /api/repository e /api/students, via callbacks do contexto.
    // O pruneStudent avisa o servidor para podar SÓ este aluno DEPOIS
    // do merge (D-NOVO-1): sem ele, o merge ressuscitaria os commits
    // podados; sem o merge, o snapshot podado apagaria os colegas que
    // pousaram depois do último poll.
    // S1: a poda própria agora prova o id registrado do aluno (o servidor
    // confere id + nome + turma); sem ele, o servidor recusa com 403.
    onRepoUpdate(prunedRepo, { pruneStudent: student.name, pruneStudentId: student.id });
    onStudentUpdate(resetStudent);
  };

  // Salvar arquivo no editor — o ÚNICO momento em que o texto digitado
  // entra no motor (git status / diff passam a refletir o conteúdo SALVO).
  const handleSaveFile = () => {
    // Arquivo excluído não volta por salvar (as abas dele já fecharam na
    // exclusão; esta guarda é defesa, não caminho normal).
    if (!activeFile || gitState.files[activeFile] === undefined) return;

    const updatedFiles = { ...gitState.files, [activeFile]: editorContent };
    const cleanFileName = activeFile.replace(`${gitState.repoFolder}/`, "");

    // Alteração em relação à base do clone (não ao remoto atual, que pode
    // já conter pushes de colegas com merge por linhas).
    const originalContent =
      gitState.baseFiles[activeFile] ?? gitState.remoteRepo.files[cleanFileName] ?? "";
    const hasChanged = editorContent !== originalContent;

    const modified = new Set(gitState.modifiedFiles);
    if (hasChanged) {
      modified.add(cleanFileName);
    } else {
      modified.delete(cleanFileName);
    }
    // Arquivo salvo não está mais em conflito pendente de edição: o aluno
    // resolveu os marcadores ao salvar (o add posterior confirma).
    // (O conflito só sai de conflictedFiles no git add — ver gitEngine.)

    setGitState((prev) => ({
      ...prev,
      files: updatedFiles,
      modifiedFiles: modified,
    }));

    setUnsavedEdits((prev) => {
      const next = { ...prev };
      delete next[activeFile];
      return next;
    });
    setIsModified(false);
    setSaveSuccessMsg("Arquivo salvo com sucesso!");
    setTimeout(() => setSaveSuccessMsg(""), 2500);

    // Edição válida: LINHA NOVA com o NOME COMPLETO (não substring do
    // primeiro nome — "Augusto" já estava no arquivo inicial).
    if (cleanFileName === "chamada.txt") {
      const editedNow = hasNewLineWithFullName(originalContent, editorContent, student.name);
      if (editedNow && !student.hasEdited) {
        const updatedStudent: Student = {
          ...student,
          hasEdited: true,
          lastActive: new Date().toISOString(),
        };
        updatedStudent.score = computeScore(updatedStudent);
        onStudentUpdate(updatedStudent);
        saveStudent(updatedStudent);
      }
    }
  };

  // Atalho Ctrl+S para salvar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSaveFile();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeFile, editorContent, gitState]);

  // Execução de comando no terminal
  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = currentInput;
    if (!cmd.trim()) return;

    const promptText =
      gitState.currentDir === "~"
        ? "aluno@gitsim:~$"
        : `aluno@gitsim:~/${gitState.repoFolder} (${gitState.head || "main"})$`;

    const result = executeTerminalCommand(cmd, gitState);

    // Componentes da nota (frente MOTOR + NOTA). A credencial simulada
    // NÃO entra no histórico do shell nem no log do professor.
    if (!result.consumedSimulatedCredential) {
      setCommandHistoryList((prev) => [...prev, cmd]);
    }
    setHistoryIndex(-1);

    // (b) uso de git status/diff/log — distinto, antes de agir.
    const diagnostic = diagnosticCommandOf(cmd);
    const diagnosticCommands = diagnostic
      ? Array.from(new Set([...(student.diagnosticCommands ?? []), diagnostic]))
      : (student.diagnosticCommands ?? []);
    // (a) domínio de conceito: todo conceito demonstrado por um comando
    // bem-sucedido entra no conjunto de dominados (com dedup) — de
    // primeira OU após erro. Errar-e-recuperar é uma evidência de
    // domínio; acertar de primeira é evidência equivalente. Não há gate
    // de erro pendente: o acerto por si só demonstra o conceito.
    const resolved = conceptsResolvedByCommand(cmd, result.isError);
    const masteredConcepts = [...(student.masteredConcepts ?? [])];
    for (const concept of resolved) {
      if (!masteredConcepts.includes(concept)) {
        masteredConcepts.push(concept);
      }
    }
    // Base da nota para este comando (os passos são completados abaixo).
    const scoreBase = {
      ...student,
      diagnosticCommands,
      masteredConcepts,
    };

    // Trata comando clear
    if (result.output === "\x1b[CLEAR]") {
      setTerminalHistory([]);
      setCurrentInput("");
      setGitState(result.newState);
      return;
    }

    // Registra item no terminal (credencial simulada: comando redigido)
    setTerminalHistory((prev) => [
      ...prev,
      {
        prompt: promptText,
        command: result.consumedSimulatedCredential ? "[credencial simulada — descartada]" : cmd,
        output: result.output,
        isError: result.isError,
        tip: result.tip,
        tipDetail: result.tipDetail,
      },
    ]);

    // Atualiza estado do Git
    setGitState(result.newState);

    // Se um comando mudou o arquivo aberto (ex.: pull trazendo novidades
    // ou marcadores de conflito) e o aluno NÃO tem edição não salva nele,
    // o editor reflete o conteúdo novo — sem isso, o conflito ficaria
    // invisível até reabrir o arquivo e um salvar por cima o apagaria.
    if (activeFile && !(activeFile in unsavedEdits)) {
      const updatedContent = result.newState.files[activeFile];
      if (updatedContent !== undefined && updatedContent !== editorContent) {
        setEditorContent(updatedContent);
      }
    }

    // Se clonou, abre a pasta e abre o arquivo no editor automaticamente para ajudar o aluno
    if (result.stepCompleted === "clone") {
      const fileToOpen = `${result.newState.repoFolder}/chamada.txt`;
      if (!openFiles.includes(fileToOpen)) {
        setOpenFiles([fileToOpen]);
        setActiveFile(fileToOpen);
        setEditorContent(result.newState.files[fileToOpen] || "");
      }
      const updatedStudent: Student = {
        ...scoreBase,
        hasCloned: true,
        totalCommands: student.totalCommands + 1,
        errorCommands: result.isError ? student.errorCommands + 1 : student.errorCommands,
        lastActive: new Date().toISOString(),
      };
      updatedStudent.score = computeScore(updatedStudent);
      onStudentUpdate(updatedStudent);
      saveStudent(updatedStudent);
    } else {
      // Atualiza contadores gerais do aluno
      const updatedStudent: Student = {
        ...scoreBase,
        totalCommands: student.totalCommands + 1,
        errorCommands: result.isError ? student.errorCommands + 1 : student.errorCommands,
        lastActive: new Date().toISOString(),
      };

      if (result.stepCompleted === "commit") {
        updatedStudent.hasCommitted = true;
      }

      if (result.pushedCommit) {
        // O envio em si é sempre válido como git: escreve no repositório
        // da turma e sincroniza com o backend, mesmo quando o gate R1 do
        // motor não deu o crédito do passo (ex.: push sem o nome na lista).
        const cleanFiles: Record<string, string> = {};
        for (const [k, v] of Object.entries(result.newState.files)) {
          cleanFiles[k.replace(`${result.newState.repoFolder}/`, "")] = v;
        }

        // Push SÓ na lista da turma do aluno (a outra turma não é lida
        // nem escrita aqui; o servidor valida turma === authorTurma).
        // Exclusões commitadas propagam (exceto chamada.txt, protegida
        // no storage — ver applyPushDeletions).
        const newRepo = pushCommitToRepo(
          result.pushedCommit,
          cleanFiles,
          student.turma,
          result.pushedCommit.filesDeleted ?? []
        );
        onRepoUpdate(newRepo);

        // Sincroniza push com o backend / banco serverless
        fetch("/api/git/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            commit: result.pushedCommit,
            updatedFiles: cleanFiles,
            deletedFiles: result.pushedCommit.filesDeleted ?? [],
            turma: student.turma,
            studentId: student.id,
          }),
        }).catch((err) => console.warn("[VSCode] Erro sync push:", err));

        // Crédito do passo de push/conclusão: SÓ quando o motor marcou
        // stepCompleted "push" (gate R1: commit com chamada.txt e nome
        // completo do aluno na lista). Sem ele, nada de confete, modal
        // ou hasPushed — o envio aconteceu, a conclusão não.
        if (result.stepCompleted === "push") {
          updatedStudent.hasPushed = true;

          // Dispara confetes de comemoração e abre o card animado de conclusão!
          confetti({
            particleCount: 120,
            spread: 70,
            origin: { y: 0.6 },
          });
          setShowCompletionModal(true);
        }
      }

      // D1 — Espelho do progresso da Aula 2 (motor → Student). A home lê
      // SÓ o Student, então cada fato do motor precisa ser copiado aqui,
      // no mesmo padrão de hasCommitted/hasPushed acima (onStudentUpdate
      // + saveStudent + POST /api/students, logo abaixo). Não é gated por
      // stepCompleted: pull, add de conflito e credencial consumida não
      // geram stepCompleted (e o consumo com "up to date" também não).
      // - pull: só vira true (o motor nunca zera hasPulled); undefined é
      //   preservado até o primeiro pull, para a home não afirmar nada
      //   sobre um passo que nunca aconteceu.
      // - conflito: espelha a semântica tri-estado do guia (guideDone):
      //   true quando o motor marca resolvido, false quando há conflito
      //   ativo (inclusive reaberto por um novo pull — o motor zera a
      //   flag), e valor anterior preservado quando não há conflito nem
      //   resolução neste comando (undefined segue undefined).
      // - transferência: SÓ quando a credencial simulada foi consumida
      //   (P4) — nunca por hasPushed. Um push "up to date" ou da Aula 1
      //   não marca este passo; já um consumo com "up to date" marca.
      if (result.newState.hasPulled) {
        updatedStudent.hasPulled = true;
      }
      if (result.newState.hasResolvedConflict) {
        updatedStudent.hasResolvedConflict = true;
      } else if (result.newState.conflictedFiles.size > 0) {
        updatedStudent.hasResolvedConflict = false;
      }
      if (result.newState.transferCredentialConsumed) {
        updatedStudent.transferCompleted = true;
      }

      // Atividade 2 "Sem receita" (frente UI/UX): o push concluído no modo
      // sem receita alimenta Student.unaidedScore (gancho do motor) pela
      // regra de src/lib/activity.ts — 10 sem revelar nenhum comando de
      // dica nesta sessão, 5 com 1 revelado, 0 com 2+. Mantém o melhor
      // valor já registrado. Limite honesto: a contagem é da sessão atual
      // do VS Code; trocar de modo no meio da atividade não é detectado
      // pelo registro do aluno — o professor deve definir o modo no início.
      if (result.stepCompleted === "push" && activityMode === "unaided") {
        updatedStudent.unaidedScore = Math.max(
          student.unaidedScore ?? 0,
          computeUnaidedScore(revealedTipIndexes.size)
        );
      }

      // Nota = conclusão + domínio de conceito + diagnóstico + sem ajuda
      // (nunca mais degrau fixo nem 100 automático no push).
      updatedStudent.score = computeScore(updatedStudent);
      onStudentUpdate(updatedStudent);
      saveStudent(updatedStudent);

      // Sincroniza progresso do aluno com o backend
      fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedStudent),
      }).catch((err) => console.warn("[VSCode] Erro sync student:", err));
    }

    // Registra log para o professor — credencial simulada NUNCA é logada.
    const logItem: CommandLog = {
      id: `log-${Date.now()}`,
      studentId: student.id,
      studentName: student.name,
      turma: student.turma,
      command: result.consumedSimulatedCredential ? "[credencial simulada — descartada]" : cmd,
      output: result.output,
      isError: result.isError,
      tip: result.tip,
      timestamp: new Date().toISOString(),
    };
    addCommandLog(logItem);

    // Sincroniza log com o backend
    fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(logItem),
    }).catch((err) => console.warn("[VSCode] Erro sync log:", err));

    setCurrentInput("");
  };

  // Navegar histórico com setas Up/Down e autocompletar com Tab
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Atalhos de terminal de verdade: Ctrl+L limpa a tela; Ctrl+C
    // cancela a linha atual (mostra ^C, não executa, não entra no
    // histórico de comandos nem no log do professor). Ctrl+C com texto
    // selecionado continua sendo "copiar" (não interceptado).
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") {
      e.preventDefault();
      setTerminalHistory([]);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
      const el = e.currentTarget;
      if (el.selectionStart === el.selectionEnd) {
        e.preventDefault();
        const promptText =
          gitState.currentDir === "~"
            ? "aluno@gitsim:~$"
            : `aluno@gitsim:~/${gitState.repoFolder} (${gitState.head || "main"})$`;
        setTerminalHistory((prev) => [
          ...prev,
          {
            prompt: promptText,
            command: currentInput ? `${currentInput}^C` : "^C",
            output: "",
            isError: false,
          },
        ]);
        setCurrentInput("");
        return;
      }
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const input = currentInput;
      const parts = input.split(" ");
      const lastWord = parts[parts.length - 1];

      if (lastWord) {
        // Tenta autocompletar nomes de arquivos e pastas
        const fileFolderCandidates = [gitState.repoFolder, "chamada.txt", "README.md"];
        const match = fileFolderCandidates.find((item) =>
          item.toLowerCase().startsWith(lastWord.toLowerCase())
        );

        if (match) {
          parts[parts.length - 1] = match;
          setCurrentInput(parts.join(" "));
          return;
        }

        // Tenta autocompletar subcomandos do git
        if (parts[0] === "git" && parts.length === 2) {
          const gitCommands = ["clone", "status", "add", "commit", "push", "diff", "branch", "log"];
          const cmdMatch = gitCommands.find((gc) => gc.startsWith(parts[1].toLowerCase()));
          if (cmdMatch) {
            parts[1] = cmdMatch;
            setCurrentInput(parts.join(" ") + " ");
            return;
          }
        }
      } else {
        if (input.endsWith("cd ")) {
          setCurrentInput(`${input}${gitState.repoFolder}`);
          return;
        }
        if (input.endsWith("git add ")) {
          setCurrentInput(`${input}chamada.txt`);
          return;
        }
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (commandHistoryList.length === 0) return;
      const nextIdx =
        historyIndex === -1 ? commandHistoryList.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIdx);
      setCurrentInput(commandHistoryList[nextIdx]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex === -1) return;
      const nextIdx = historyIndex + 1;
      if (nextIdx >= commandHistoryList.length) {
        setHistoryIndex(-1);
        setCurrentInput("");
      } else {
        setHistoryIndex(nextIdx);
        setCurrentInput(commandHistoryList[nextIdx]);
      }
    }
  };

  const promptString =
    gitState.currentDir === "~"
      ? "aluno@gitsim:~$"
      : `aluno@gitsim:~/${gitState.repoFolder} (${gitState.head || "main"})$`;

  const activeFileName = activeFile ? activeFile.replace(`${gitState.repoFolder}/`, "") : null;

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-[#1e1e1e] text-[#cccccc] select-none">
      {/* BARRA DE TÍTULO ESTILO VS CODE (menus decorativos + título central) */}
      <div className="h-9 bg-[#323233] flex items-center px-3 text-xs text-gray-300 shrink-0 relative">
        <nav className="flex items-center gap-3 shrink-0" aria-label="Menus do VS Code (não fazem parte da simulação)">
          {["File", "Edit", "Selection", "View", "Go", "Run", "Terminal", "Help"].map((menu) => (
            <span
              key={menu}
              title={`${menu} — não faz parte da simulação`}
              className="hover:text-white cursor-default hidden md:inline"
            >
              {menu}
            </span>
          ))}
        </nav>
        <p className="absolute left-1/2 -translate-x-1/2 truncate max-w-[50%] text-gray-400 hidden sm:block">
          {activeFileName ? `${activeFileName} — ${gitState.repoFolder} — ` : ""}
          Visual Studio Code
        </p>
        <div className="ml-auto flex items-center gap-4 text-gray-400 shrink-0" aria-label="Botões da janela (não fazem parte da simulação)" title="Botões da janela — não fazem parte da simulação">
          <span className="cursor-default">—</span>
          <span className="cursor-default text-[10px]">▢</span>
          <span className="cursor-default">✕</span>
        </div>
      </div>

      {/* CORPO PRINCIPAL DO VS CODE */}
      <div className="flex-1 flex overflow-hidden">
        {/* BARRA LATERAL DE ATIVIDADES (ACTIVITY BAR) */}
        <div className="w-12 bg-[#333333] flex flex-col items-center py-2 justify-between border-r border-[#252526] z-10 shrink-0">
          <div className="flex flex-col items-center space-y-4 w-full">
            {/* Alternar painel lateral — só no mobile; em desktop some (md:hidden). */}
            <button
              type="button"
              onClick={() => setIsSidebarVisible((v) => !v)}
              aria-label={isSidebarVisible ? "Ocultar painel lateral" : "Mostrar painel lateral"}
              aria-expanded={isSidebarVisible}
              title="Alternar painel lateral"
              className="p-2 rounded hover:text-white transition cursor-pointer text-gray-400 md:hidden"
            >
              <PanelLeft className="w-5 h-5" />
            </button>

            <button
              onClick={() => {
                setActiveSidebar("explorer");
                setIsSidebarVisible(true);
              }}
              aria-label="Explorer"
              aria-pressed={activeSidebar === "explorer"}
              className={`p-2 rounded hover:text-white transition cursor-pointer relative ${
                activeSidebar === "explorer"
                  ? "text-white border-l-2 border-white"
                  : "text-gray-400"
              }`}
              title="Explorer"
            >
              <Files className="w-5 h-5" />
            </button>

            <button
              onClick={() => {
                setActiveSidebar("git");
                setIsSidebarVisible(true);
              }}
              aria-label="Source Control (Git)"
              aria-pressed={activeSidebar === "git"}
              className={`p-2 rounded hover:text-white transition cursor-pointer relative ${
                activeSidebar === "git"
                  ? "text-white border-l-2 border-white"
                  : "text-gray-400"
              }`}
              title="Source Control (Git)"
            >
              <GitBranch className="w-5 h-5" />
              {gitState.modifiedFiles.size > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-blue-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">
                  {gitState.modifiedFiles.size}
                </span>
              )}
            </button>

            {/* ÍCONES DA ACTIVITY BAR SEM AÇÃO (mesmo padrão de Contas e
                Configurações abaixo): existem no VS Code de verdade, mas
                não fazem parte da simulação. */}
            <span
              title="Search — não disponível na simulação"
              aria-label="Search — não disponível na simulação"
              className="p-2 rounded opacity-60"
            >
              <Search className="w-5 h-5" />
            </span>
            <span
              title="Run and Debug — não disponível na simulação"
              aria-label="Run and Debug — não disponível na simulação"
              className="p-2 rounded opacity-60"
            >
              <Play className="w-5 h-5" />
            </span>
            <span
              title="Extensions — não disponível na simulação"
              aria-label="Extensions — não disponível na simulação"
              className="p-2 rounded opacity-60"
            >
              <Blocks className="w-5 h-5" />
            </span>
          </div>

          {/* ÍCONES DE BASE DA ACTIVITY BAR (CONTAS & CONFIGURAÇÕES) — indicadores
              sem ação: não fazem parte da simulação, por isso não são botões. */}
          <div className="flex flex-col items-center space-y-3 pb-1 text-gray-400">
            {/* Reiniciar a tarefa do PRÓPRIO aluno (sem senha de professor):
                abre o diálogo de confirmação; só confirmação apaga. */}
            <button
              type="button"
              onClick={() => setRestartConfirmOpen(true)}
              aria-label="Reiniciar tarefa"
              title="Reiniciar tarefa (só os seus dados)"
              className="p-2 rounded hover:text-red-400 hover:bg-white/10 transition cursor-pointer"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
            <span
              title="Contas / Perfil — não disponível na simulação"
              aria-label="Contas / Perfil — não disponível na simulação"
              className="p-2 rounded opacity-60"
            >
              <User className="w-5 h-5" />
            </span>
            <span
              title="Configurações — não disponível na simulação"
              aria-label="Configurações — não disponível na simulação"
              className="p-2 rounded opacity-60"
            >
              <Settings className="w-5 h-5" />
            </span>
          </div>
        </div>

        {/* PAINEL LATERAL (SIDEBAR EXPLORER / SOURCE CONTROL) */}
        <div
          className={`w-64 bg-[#252526] border-r border-[#191919] flex-col text-xs shrink-0 ${
            isSidebarVisible ? "flex" : "hidden"
          } md:flex`}
        >
          {activeSidebar === "explorer" ? (
            <div className="flex flex-col h-full">
              <div className="px-4 py-2 font-bold uppercase tracking-wider text-gray-400 border-b border-[#1f1f1f] flex items-center justify-between">
                <span>Explorer</span>
                <button
                  type="button"
                  onClick={() => setIsSidebarVisible(false)}
                  aria-label="Ocultar painel lateral"
                  title="Ocultar painel lateral"
                  className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer md:hidden"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* OPEN EDITORS, como no VS Code de verdade */}
              {openFiles.length > 0 && (
                <div className="px-2 pt-2 pb-1 border-b border-[#1f1f1f]">
                  <p className="px-2 py-1 font-bold uppercase tracking-wider text-gray-400">
                    Open Editors
                  </p>
                  {openFiles.map((f) => {
                    const fileName = f.replace(`${gitState.repoFolder}/`, "");
                    const Icon = fileIcon(fileName);
                    const isActive = activeFile === f;
                    return (
                      // Linha = contêiner + botão de ativar + botão de
                      // fechar separados (botão dentro de botão seria HTML
                      // inválido). O × aqui substitui o × das guias
                      // removidas do cabeçalho do editor.
                      <div
                        key={f}
                        className={`group flex w-full items-center gap-1 py-1 px-2 rounded ${
                          isActive ? "bg-[#37373d] text-white" : "hover:bg-[#2a2d2e] text-gray-300"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => activateFile(f)}
                          aria-label={`Ativar arquivo ${fileName}`}
                          className="flex flex-1 min-w-0 items-center gap-2 cursor-pointer text-left"
                        >
                          <Icon className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          <span className="truncate">{fileName}</span>
                          {f in unsavedEdits && (
                            <span className="w-2 h-2 rounded-full bg-white ml-auto shrink-0" title="Não salvo" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleCloseFile(f, e)}
                          aria-label={`Fechar arquivo ${fileName}`}
                          title={`Fechar arquivo ${fileName}`}
                          className="hover:text-red-400 p-0.5 rounded cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="p-2 space-y-1 overflow-y-auto flex-1">
                {!gitState.isRepoCloned ? (
                  <div className="p-3 text-gray-400 text-xs bg-[#1e1e1e] rounded border border-[#333333] space-y-2">
                    <p className="font-semibold text-amber-400 flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5" />
                      Nenhum repositório aberto
                    </p>
                    <p className="text-[11px] text-gray-400">
                      Clone o repositório da turma no terminal abaixo — veja o passo no Guia da
                      atividade{activityMode !== "unaided" ? " ou revele aqui:" : "."}
                    </p>
                    {/* P3: no modo "Sem receita" este reveal é SUPRIMIDO, não
                        contado — o comando nunca é exibido aqui, então a
                        nota sem receita não depende de rastrear este botão
                        (só reveals de tipDetail do terminal contam). */}
                    {activityMode !== "unaided" &&
                      (revealCloneHint ? (
                        <code className="block bg-[#2d2d2d] p-1.5 rounded text-blue-300 font-mono text-[10px] break-all">
                          git clone {repository.cloneUrl}
                        </code>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setRevealCloneHint(true)}
                          className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 underline underline-offset-2 cursor-pointer"
                        >
                          Revelar comando de clone
                        </button>
                      ))}
                  </div>
                ) : (
                  <div>
                    {/* PASTA DO REPOSITÓRIO */}
                    <button
                      type="button"
                      onClick={() => setIsRepoFolderOpen(!isRepoFolderOpen)}
                      aria-expanded={isRepoFolderOpen}
                      aria-label={`Pasta ${gitState.repoFolder}`}
                      className="flex w-full items-center gap-1 py-1 px-1.5 hover:bg-[#2a2d2e] rounded cursor-pointer font-semibold text-gray-200 text-left"
                    >
                      {isRepoFolderOpen ? (
                        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                      )}
                      <Folder className="w-4 h-4 text-blue-400 fill-blue-400/20" />
                      <span>{gitState.repoFolder}</span>
                    </button>

                    {/* ARQUIVOS DENTRO DA PASTA */}
                    {isRepoFolderOpen && (
                      <div className="pl-5 space-y-0.5 mt-0.5">
                        {Object.keys(gitState.files).map((fullPath) => {
                          const fileName = fullPath.replace(`${gitState.repoFolder}/`, "");
                          const Icon = fileIcon(fileName);
                          const isModifiedFile = gitState.modifiedFiles.has(fileName);
                          const isStagedFile = gitState.stagedFiles.has(fileName);
                          const isActive = activeFile === fullPath;

                          return (
                            <div
                              key={fullPath}
                              className={`group flex w-full items-center justify-between py-1 px-2 rounded transition ${
                                isActive
                                  ? "bg-[#37373d] text-white"
                                  : "hover:bg-[#2a2d2e] text-gray-300"
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => handleOpenFile(fullPath)}
                                aria-label={`Abrir arquivo ${fileName}`}
                                className="flex flex-1 min-w-0 items-center gap-2 cursor-pointer text-left"
                              >
                                <Icon className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                <span className="truncate">{fileName}</span>
                              </button>

                              <div className="flex items-center gap-1 shrink-0">
                                {isModifiedFile && (
                                  <span
                                    title="Modificado (Changes not staged)"
                                    className="text-[10px] font-bold text-amber-400 px-1"
                                  >
                                    M
                                  </span>
                                )}
                                {isStagedFile && (
                                  <span
                                    title="Preparado para commit (Staged)"
                                    className="text-[10px] font-bold text-emerald-400 px-1"
                                  >
                                    A
                                  </span>
                                )}
                                {confirmDeletePath === fullPath ? (
                                  <span className="flex items-center gap-1">
                                    <span className="text-[10px] text-red-300">Excluir?</span>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteFile(fullPath)}
                                      aria-label={`Confirmar exclusão de ${fileName}`}
                                      title={`Confirmar exclusão de ${fileName}`}
                                      className="text-[10px] font-bold text-red-300 hover:text-red-200 px-1 rounded cursor-pointer"
                                    >
                                      Sim
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeletePath(null)}
                                      aria-label={`Cancelar exclusão de ${fileName}`}
                                      title="Cancelar exclusão"
                                      className="text-[10px] text-gray-400 hover:text-white px-1 rounded cursor-pointer"
                                    >
                                      Não
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteFile(fullPath)}
                                    aria-label={`Excluir arquivo ${fileName}`}
                                    title={`Excluir arquivo ${fileName}`}
                                    className="hover:text-red-400 p-0.5 rounded cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* SOURCE CONTROL */
            <div className="flex flex-col h-full p-3 text-xs">
              <div className="font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center justify-between">
                <span>Source Control: Git</span>
                <button
                  type="button"
                  onClick={() => setIsSidebarVisible(false)}
                  aria-label="Ocultar painel lateral"
                  title="Ocultar painel lateral"
                  className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer md:hidden normal-case tracking-normal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-1.5 mb-3 text-gray-300 normal-case tracking-normal">
                <GitBranch className="w-3.5 h-3.5 text-gray-400" />
                <span className="font-semibold">{gitState.head || "main"}</span>
                <span className="text-gray-500">
                  • {gitState.stagedFiles.size + gitState.modifiedFiles.size + [...gitState.deletedFiles].filter((f) => !gitState.stagedFiles.has(f)).length} alteraç{gitState.stagedFiles.size + gitState.modifiedFiles.size + [...gitState.deletedFiles].filter((f) => !gitState.stagedFiles.has(f)).length === 1 ? "ão" : "ões"}
                </span>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="text-gray-400 font-semibold mb-1 flex items-center justify-between">
                    <span>Staged Changes</span>
                    <span className="bg-[#333333] px-1.5 rounded text-[10px]">
                      {gitState.stagedFiles.size}
                    </span>
                  </div>
                  {gitState.stagedFiles.size === 0 ? (
                    <p className="text-gray-500 italic text-[11px]">Nenhum arquivo staged</p>
                  ) : (
                    Array.from(gitState.stagedFiles).map((f) => {
                      const Icon = fileIcon(f);
                      const isDeleted = gitState.deletedFiles.has(f);
                      return (
                        <div key={f} className={`${isDeleted ? "text-red-400" : "text-emerald-400"} flex items-center gap-1.5 py-0.5`}>
                          <Icon className="w-3.5 h-3.5" />
                          <span>{f}</span>
                          <span className={`text-[10px] ${isDeleted ? "bg-red-950 text-red-300" : "bg-emerald-950 text-emerald-300"} px-1 rounded ml-auto`}>
                            {isDeleted ? "Excluído" : "Staged"}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                <div>
                  <div className="text-gray-400 font-semibold mb-1 flex items-center justify-between">
                    <span>Changes (Modificados)</span>
                    <span className="bg-[#333333] px-1.5 rounded text-[10px]">
                      {gitState.modifiedFiles.size + [...gitState.deletedFiles].filter((f) => !gitState.stagedFiles.has(f)).length}
                    </span>
                  </div>
                  {gitState.modifiedFiles.size === 0 &&
                  [...gitState.deletedFiles].filter((f) => !gitState.stagedFiles.has(f)).length === 0 ? (
                    <p className="text-gray-500 italic text-[11px]">Nenhuma alteração pendente</p>
                  ) : (
                    <>
                      {Array.from(gitState.modifiedFiles).map((f) => {
                        const Icon = fileIcon(f);
                        return (
                          <div key={f} className="text-amber-400 flex items-center gap-1.5 py-0.5">
                            <Icon className="w-3.5 h-3.5" />
                            <span>{f}</span>
                            <span className="text-[10px] bg-amber-950 text-amber-300 px-1 rounded ml-auto">
                              Modificado
                            </span>
                          </div>
                        );
                      })}
                      {[...gitState.deletedFiles]
                        .filter((f) => !gitState.stagedFiles.has(f))
                        .map((f) => {
                          const Icon = fileIcon(f);
                          return (
                            <div key={f} className="text-red-400 flex items-center gap-1.5 py-0.5">
                              <Icon className="w-3.5 h-3.5" />
                              <span>{f}</span>
                              <span className="text-[10px] bg-red-950 text-red-300 px-1 rounded ml-auto">
                                Excluído
                              </span>
                            </div>
                          );
                        })}
                    </>
                  )}
                </div>

                {/* P3: caixa inteira suprimida no modo "Sem receita"
                    (mesma decisão do reveal de clone: suprimir, não contar). */}
                {activityMode !== "unaided" && (
                  <div className="p-2.5 bg-[#1e1e1e] rounded border border-[#333333] text-[11px] text-gray-300">
                    <p className="font-semibold text-blue-400 mb-1">💡 Comandos Rápidos:</p>
                    {revealQuickCommands ? (
                      <>
                        <code>git add .</code>
                        <br />
                        <code>git commit -m &quot;mensagem&quot;</code>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setRevealQuickCommands(true)}
                        className="font-semibold text-blue-400 hover:text-blue-300 underline underline-offset-2 cursor-pointer"
                      >
                        Revelar comandos rápidos
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ÁREA DO EDITOR DE CÓDIGO */}
        <div className="flex-1 flex flex-col bg-[#1e1e1e] overflow-hidden">
          {/* CABEÇALHO DO EDITOR (sem guias): breadcrumb + seletor compacto
              de arquivo + indicador de salvo + botão Salvar, numa única
              linha. As guias foram removidas porque, somadas ao guia aberto
              e ao terminal fixo, espremiam o editor até ~24px de altura em
              telas baixas (1024×600) — o aluno não conseguia nem clicar
              no textarea. Trocar de arquivo continua possível aqui e pela
              sidebar (Explorer → pasta, ou "Open Editors"); fechar arquivo
              continua possível pela lista "Open Editors" da sidebar. */}
          {activeFile && (
            <div className="flex items-center gap-2 px-4 py-1.5 text-[11px] text-gray-500 bg-[#1e1e1e] border-b border-[#2d2d2d] shrink-0">
              <span className="shrink-0">{gitState.repoFolder}</span>
              <ChevronRight className="w-3 h-3 shrink-0" />
              <label className="sr-only" htmlFor="editor-file-select">
                Arquivo aberto
              </label>
              <select
                id="editor-file-select"
                value={activeFile}
                onChange={(e) => activateFile(e.target.value)}
                className="bg-[#252526] border border-[#333] rounded px-2 py-1 text-gray-200 text-xs outline-none cursor-pointer min-w-0 flex-1 sm:flex-none sm:min-w-40"
              >
                {openFiles.map((f) => {
                  const fileName = f.replace(`${gitState.repoFolder}/`, "");
                  return (
                    <option key={f} value={f}>
                      {fileName}
                      {f in unsavedEdits ? " •" : ""}
                    </option>
                  );
                })}
              </select>

              {/* INDICADOR DE SALVO / NÃO SALVO (sem autosave) E BOTÃO SALVAR */}
              <div className="ml-auto flex items-center gap-2.5 shrink-0">
                <div
                  className="flex items-center gap-1.5 text-[11px] text-gray-400 bg-[#1e1e1e] border border-[#30363d] px-2.5 py-0.5 rounded-full"
                  title={
                    isModified
                      ? "Arquivo com alterações não salvas — salve com Ctrl+S ou no botão Salvar para o Git enxergá-las"
                      : "Arquivo salvo — o Git já enxerga este conteúdo"
                  }
                >
                  <Cloud className={`w-3.5 h-3.5 ${isModified ? "text-amber-400" : "text-emerald-400"}`} />
                  <span className={isModified ? "text-amber-300 font-medium" : "text-emerald-400 font-medium"}>
                    {isModified ? "Não salvo" : "Salvo"}
                  </span>
                </div>

                {saveSuccessMsg && (
                  <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-semibold animate-pulse">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {saveSuccessMsg}
                  </span>
                )}
                <button
                  onClick={handleSaveFile}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow transition cursor-pointer active:scale-[0.98]"
                  title="Salvar manualmente agora (Ctrl+S)"
                >
                  <Save className="w-3 h-3" />
                  <span>Salvar</span>
                </button>
              </div>
            </div>
          )}

          {/* ÁREA DE TEXTO / LINHAS */}
          {activeFile ? (
            <div className="flex-1 flex overflow-hidden font-mono text-xs sm:text-sm">
              {/* NÚMEROS DE LINHA (a linha do cursor destaca, como no VS Code) */}
              <div className="w-12 bg-[#1e1e1e] text-gray-600 select-none text-right pr-3 pt-3 border-r border-[#2d2d2d] leading-6" style={{ fontFamily: "Consolas, 'Courier New', monospace" }}>
                {editorContent.split("\n").map((_, i) => (
                  <div
                    key={i}
                    className={i + 1 === cursorLine ? "text-gray-200 font-bold" : undefined}
                  >
                    {i + 1}
                  </div>
                ))}
              </div>

              {/* TEXTAREA DO EDITOR */}
              <textarea
                ref={editorRef}
                value={editorContent}
                onChange={(e) => {
                  setEditorContent(e.target.value);
                  setIsModified(true);
                  if (activeFile) {
                    setUnsavedEdits((prev) => ({ ...prev, [activeFile]: e.target.value }));
                  }
                }}
                onSelect={updateCursor}
                onKeyUp={updateCursor}
                onClick={updateCursor}
                placeholder="Digite seu código ou altere o arquivo aqui..."
                className="flex-1 p-3 bg-[#1e1e1e] text-gray-200 outline-none resize-none leading-6 selection:bg-blue-600/40 select-text"
                style={{ fontFamily: "Consolas, 'Courier New', monospace" }}
                spellCheck={false}
              />
            </div>
          ) : (
            /* TELA INICIAL QUANDO NÃO HÁ ARQUIVO ABERTO */
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-gray-400">
              <div className="w-20 h-20 rounded-2xl bg-[#252526] flex items-center justify-center text-blue-400 mb-5 shadow-lg border border-[#333333]">
                <FileCode className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-light text-gray-100 mb-1">
                Welcome
              </h3>
              <p className="text-xs text-gray-500 mb-5">
                VS Code Simulado — Editor de Código
              </p>
              <p className="text-xs max-w-md text-gray-400 mb-4 leading-relaxed">
                Clone o repositório no terminal abaixo e abra o arquivo{" "}
                <span className="text-blue-400 font-mono">chamada.txt</span> pelo explorador à
                esquerda para adicionar o seu nome.
              </p>
              <div className="flex items-center gap-2 text-xs bg-[#252526] px-3 py-1.5 rounded-lg border border-[#333333] text-gray-300">
                <span>Atalho de teclado para salvar:</span>
                <kbd className="px-2 py-0.5 bg-[#1e1e1e] rounded border border-[#444] text-[11px] font-mono">
                  Ctrl + S
                </kbd>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* GUIA DA ATIVIDADE (frente UI/UX) — micro-explicações antes de cada
          passo; comando exato só sob "Revelar comando". No modo "Sem
          receita" não há comando revelável: só objetivo + conceito. */}
      <div className="bg-[#252526] border-t border-[#191919] text-xs shrink-0">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2">
          <span className="font-bold text-white">
            Guia: {ACTIVITY_MODES[activityMode].label}
          </span>
          <label className="sr-only" htmlFor="activity-mode-select">
            Modo da atividade
          </label>
          <select
            id="activity-mode-select"
            value={activityMode}
            onChange={(e) => changeActivityMode(e.target.value as ActivityMode)}
            className="bg-[#1e1e1e] border border-[#333] rounded px-2 py-1 text-gray-200 outline-none cursor-pointer"
          >
            {(Object.keys(ACTIVITY_MODES) as ActivityMode[]).map((key) => (
              <option key={key} value={key}>
                {ACTIVITY_MODES[key].label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setGuideOpen((v) => !v)}
            aria-expanded={guideOpen}
            className="px-2 py-1 rounded bg-[#333] hover:bg-[#3d3d3d] text-gray-200 font-semibold cursor-pointer"
          >
            {guideOpen ? "Ocultar guia" : "Mostrar guia"}
          </button>
          <button
            type="button"
            onClick={() => setGlossaryOpen(true)}
            className="px-2 py-1 rounded bg-[#333] hover:bg-[#3d3d3d] text-blue-300 font-semibold cursor-pointer"
          >
            📖 Glossário
          </button>
          <span className="text-gray-400">
            {activityMode === "unaided"
              ? "Sem receita: nenhum comando pronto aqui. Se travar, leia a pista da dica no terminal."
              : "O comando exato só aparece se você clicar em “Revelar comando”."}
          </span>
          <span
            className={`ml-auto px-2 py-0.5 rounded-full border font-semibold ${
              isModified
                ? "bg-amber-950 text-amber-300 border-amber-800"
                : "bg-emerald-950 text-emerald-300 border-emerald-800"
            }`}
            title={
              isModified
                ? "Arquivo com alterações não salvas — salve com Ctrl+S ou no botão Salvar para o Git enxergá-las"
                : "Arquivo salvo — o Git já enxerga este conteúdo"
            }
          >
            {activeFile ? (isModified ? "● Não salvo — salve com Ctrl+S" : "✓ Salvo") : "Nenhum arquivo aberto"}
          </span>
        </div>

        {guideOpen && (
          <div className="px-4 pb-3 max-h-40 overflow-y-auto">
            <ol className="space-y-2.5">
              {guideSteps.map((step) => {
                const done = guideDone[step.id];
                const revealed = revealedGuideSteps.has(step.id);
                return (
                  <li
                    key={step.id}
                    className="bg-[#1e1e1e] border border-[#333] rounded-lg p-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{step.title}</span>
                      {done === true && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-semibold">
                          Concluído
                        </span>
                      )}
                    </div>
                    <p className="text-gray-400 leading-relaxed mt-1">
                      <span className="text-amber-300 font-semibold">💡 Conceito: </span>
                      {step.concept}
                    </p>
                    <p className="text-gray-300 leading-relaxed mt-1">{step.goal}</p>
                    {step.revealCommand &&
                      (revealed ? (
                        <div className="mt-1.5">
                          <code className="block bg-[#2d2d2d] p-1.5 rounded text-blue-300 font-mono break-all">
                            {step.revealCommand}
                          </code>
                          {step.revealNote && (
                            <p className="text-gray-400 mt-1">{step.revealNote}</p>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setRevealedGuideSteps((prev) => new Set(prev).add(step.id))
                          }
                          className="mt-1.5 font-semibold text-blue-400 hover:text-blue-300 underline underline-offset-2 cursor-pointer"
                        >
                          Revelar comando
                        </button>
                      ))}
                    {step.id === "transfer" && (
                      <div className="mt-2 p-2 rounded bg-amber-950/40 border border-amber-600/40 text-amber-200 leading-relaxed">
                        <p className="font-semibold">
                          ⚠️ SIMULAÇÃO — não é o GitHub de verdade. No GitHub de verdade, o push
                          pede login; aqui a credencial é simulada e descartada. Nunca digite sua
                          senha real.
                        </p>
                        {gitState.transferMode ? (
                          <p className="mt-1">
                            Passo “Git de verdade” ativado: registre nome e e-mail e faça o push —
                            o terminal vai pedir a credencial simulada. O valor digitado será
                            descartado e nunca enviado, salvo ou verificado de verdade.
                          </p>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setGitState((prev) => ({ ...prev, transferMode: true }))
                            }
                            className="mt-1.5 px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold cursor-pointer"
                          >
                            Ativar passo “Git de verdade”
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>

      {/* BANNER DE CONFLITO (frente UI/UX) — aparece sozinho quando o motor
          marca arquivos em conflito; guia a resolução sem entregar o comando
          sem um clique. */}
      {gitState.conflictedFiles.size > 0 && (
        <div
          role="alert"
          className="bg-red-950/60 border-t border-red-800 text-red-100 text-xs px-4 py-2.5 shrink-0"
        >
          <p className="font-bold">
            ⚠️ Conflito! O pull trouxe uma versão diferente da sua para{" "}
            {Array.from(gitState.conflictedFiles).join(", ")}.
          </p>
          <p className="text-red-200 leading-relaxed mt-0.5">
            Abra o arquivo no editor, apague os marcadores{" "}
            <code className="font-mono">&lt;&lt;&lt;&lt;&lt;&lt;&lt; HEAD</code>,{" "}
            <code className="font-mono">=======</code> e{" "}
            <code className="font-mono">&gt;&gt;&gt;&gt;&gt;&gt;&gt;</code> deixando só o conteúdo
            certo, salve com Ctrl+S e prepare o arquivo resolvido. O conflito só termina quando o
            arquivo resolvido for preparado e commitado — o commit fica bloqueado até lá.
          </p>
          {/* P3: suprimido no modo "Sem receita" (mesma decisão dos demais
              reveals fora do terminal: suprimir, não contar). O banner
              continua orientando sem o comando exato. */}
          {activityMode !== "unaided" &&
            (revealConflictCommand ? (
              <code className="block mt-1.5 bg-[#2d2d2d] p-1.5 rounded text-blue-300 font-mono break-all">
                git add {Array.from(gitState.conflictedFiles)[0]}
              </code>
            ) : (
              <button
                type="button"
                onClick={() => setRevealConflictCommand(true)}
                className="mt-1 font-semibold text-blue-300 hover:text-blue-200 underline underline-offset-2 cursor-pointer"
              >
                Revelar comando para preparar o arquivo resolvido
              </button>
            ))}
        </div>
      )}

      {/* PAINEL INFERIOR: TERMINAL INTEGRADO DO VS CODE — altura reduzida
          (h-56/sm:h-64, era h-64/sm:h-72): o terminal fixo alto era um
          dos fatores que espremiam o editor em telas baixas. */}
      <div className="h-56 sm:h-64 bg-[#181818] border-t border-[#333333] flex flex-col">
        {/* CABEÇALHO DO TERMINAL */}
        <div className="flex items-center justify-between px-4 py-1.5 bg-[#1f1f1f] border-b border-[#2d2d2d] text-xs">
          <div className="flex items-center gap-4">
            <span className="font-semibold text-white border-b-2 border-blue-500 pb-0.5 flex items-center gap-1.5">
              <TerminalIcon className="w-3.5 h-3.5 text-blue-400" />
              TERMINAL
            </span>
            <span className="text-gray-500">OUTPUT</span>
            <span className="text-gray-500">PROBLEMS</span>
            <span className="text-gray-500" title="Debug Console — não disponível na simulação">DEBUG CONSOLE</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setTerminalHistory([])}
              className="text-gray-400 hover:text-red-400 flex items-center gap-1 text-[11px] cursor-pointer"
              title="Limpar terminal"
            >
              <Trash2 className="w-3 h-3" />
              <span>Limpar</span>
            </button>
            <div className="text-[11px] text-gray-400 bg-[#252526] px-2 py-0.5 rounded border border-[#333]">
              bash
            </div>
          </div>
        </div>

        {/* CORPO DO TERMINAL COM HISTÓRICO */}
        <div
          ref={terminalBodyRef}
          onClick={() => inputRef.current?.focus()}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickToBottomRef.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="flex-1 p-3 overflow-y-auto font-mono text-xs sm:text-[13px] leading-relaxed cursor-text select-text"
        >
          {terminalHistory.map((item, index) => (
            <div key={index} className="mb-2">
              {item.command && (
                <div className="flex items-center gap-2 text-gray-300">
                  {renderPrompt(item.prompt)}
                  <span className="text-white">{item.command}</span>
                </div>
              )}

              {item.output && (
                <pre
                  className={`mt-0.5 whitespace-pre-wrap ${
                    item.isError ? "text-red-400" : "text-gray-300"
                  }`}
                >
                  {renderAnsi(item.output)}
                </pre>
              )}

              {/* DICA PEDAGÓGICA EM 2 NÍVEIS: pista primeiro; o comando
                  exato só aparece sob ação do aluno ("Revelar comando"). */}
              {item.tipDetail ? (
                <div className="mt-2 mb-2 p-2.5 rounded-lg bg-amber-950/40 border border-amber-600/40 text-amber-200 text-xs">
                  <p className="font-sans font-medium">💡 {item.tipDetail.pista}</p>
                  {item.tipDetail.comando &&
                    (revealedTipIndexes.has(index) ? (
                      <code className="block mt-1.5 bg-[#2d2d2d] p-1.5 rounded text-blue-300 font-mono break-all">
                        {item.tipDetail.comando}
                      </code>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setRevealedTipIndexes((prev) => new Set(prev).add(index))
                        }
                        className="mt-1.5 underline underline-offset-2 hover:text-amber-100 cursor-pointer font-sans"
                      >
                        Revelar comando
                      </button>
                    ))}
                </div>
              ) : (
                // Modo "Sem receita": a dica legada (string) pode conter o
                // comando exato, então ela é suprimida — só a pista em 2
                // níveis (tipDetail) aparece, com o comando sob pedido.
                activityMode !== "unaided" &&
                item.tip && (
                  <div className="mt-2 mb-2 p-2.5 rounded-lg bg-amber-950/40 border border-amber-600/40 text-amber-200 text-xs">
                    <pre className="whitespace-pre-wrap font-sans font-medium">{item.tip}</pre>
                  </div>
                )
              )}
            </div>
          ))}

          {/* LINHA DE INPUT ATUAL */}
          <form onSubmit={handleCommandSubmit} className="flex items-center gap-2 mt-1">
            <span className="shrink-0">{renderPrompt(promptString)}</span>
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                aria-label="Terminal — digite um comando git"
                value={currentInput}
                onChange={(e) => setCurrentInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full bg-transparent text-white outline-none font-mono text-xs sm:text-[13px] select-text"
                autoFocus
                spellCheck={false}
                autoComplete="off"
              />
              {/* Cursor em bloco, como num terminal de verdade, quando a
                  linha está vazia (o caret nativo fica escondido atrás
                  dele; ao digitar, o bloco some e o caret assume). */}
              {currentInput === "" && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-0 top-1/2 h-[18px] w-[9px] -translate-y-1/2 bg-white/80 animate-pulse"
                />
              )}
            </div>
          </form>
          <div ref={terminalEndRef} />
        </div>
      </div>

      {/* STATUS BAR INFERIOR ASSINATURA VS CODE (#007acc) */}
      <div className="h-6 bg-[#007acc] text-white flex items-center justify-between px-3 text-[11px] font-sans select-none shrink-0 z-20">
        <div className="flex items-center gap-3">
          <span
            className="flex items-center gap-1 px-1.5 py-0.5 rounded"
            title={`Branch atual: ${gitState.head || "main"}`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span className="font-semibold">{gitState.head || "main"}</span>
          </span>

          <span
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-white/95"
            title="Sincronização de Commits"
          >
            <RefreshCw className="w-3 h-3" />
            <span>0↓ {gitState.localCommits.length > gitState.remoteRepo.commits.length ? "1↑" : "0↑"}</span>
          </span>

          <span
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-white/90"
            title={isModified ? "Arquivo com alterações não salvas" : "Arquivo salvo"}
          >
            <Cloud className={`w-3 h-3 ${isModified ? "text-amber-300" : "text-emerald-300"}`} />
            <span className={`text-[10px] font-medium hidden sm:inline ${isModified ? "text-amber-300" : "text-emerald-300"}`}>
              {isModified ? "Não salvo" : "Salvo"}
            </span>
          </span>

          <span className="flex items-center gap-1.5 text-white/90 px-1.5 py-0.5 rounded">
            <span className="flex items-center gap-0.5">
              <span className="text-[10px]">⊗</span> 0
            </span>
            <span className="flex items-center gap-0.5">
              <span className="text-[10px]">⚠</span> 0
            </span>
          </span>
        </div>

        <div className="flex items-center gap-3 text-white/95 text-[11px]">
          <span className="px-1.5 py-0.5 rounded transition hidden sm:inline">
            Ln {cursorLine}, Col {cursorCol}
          </span>
          <span className="px-1.5 py-0.5 rounded transition hidden sm:inline">
            Spaces: 2
          </span>
          <span className="px-1.5 py-0.5 rounded transition">
            UTF-8
          </span>
          <span className="px-1.5 py-0.5 rounded transition hidden md:inline">
            LF
          </span>
          <span className="px-1.5 py-0.5 rounded transition font-medium">
            {activeFile ? (activeFile.endsWith(".txt") ? "Plain Text" : "Markdown") : "Plain Text"}
          </span>
          <span
            className="p-1 rounded opacity-70"
            title="Notificações — não disponível na simulação"
            aria-label="Notificações — não disponível na simulação"
          >
            <Bell className="w-3 h-3" />
          </span>
        </div>
      </div>

      {/* MODAL ANIMADO DE CONCLUSÃO DA TAREFA */}
      <TaskCompletionModal
        student={student}
        isOpen={showCompletionModal}
        onClose={() => setShowCompletionModal(false)}
      />
      <GlossaryModal isOpen={glossaryOpen} onClose={() => setGlossaryOpen(false)} />

      {/* DIÁLOGO DE CONFIRMAÇÃO DO REINICIAR — só o botão "Reiniciar tudo"
          apaga; "Cancelar" fecha sem tocar em nada. */}
      {restartConfirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="restart-confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setRestartConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-[#252526] border border-[#333] p-5 text-sm text-gray-200 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="restart-confirm-title" className="text-base font-bold text-white mb-2">
              Reiniciar a tarefa?
            </h2>
            <p className="text-gray-300 leading-relaxed">
              Isso apaga arquivos, commits e o terminal e volta o GitHub simulado ao inicial
              — tem certeza? Seus dados da tarefa (arquivos, commits, progresso) serão
              apagados e você volta ao início, pronto para refazer do zero. Os dados dos
              colegas não são tocados.
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setRestartConfirmOpen(false)}
                aria-label="Cancelar reinício"
                className="px-4 py-2 rounded-lg bg-[#333] hover:bg-[#3d3d3d] text-white font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleRestartStudent}
                aria-label="Reiniciar tudo"
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold cursor-pointer"
              >
                Reiniciar tudo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
