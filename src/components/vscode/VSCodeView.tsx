"use client";

import React, { useState, useEffect, useRef } from "react";
import { Student, Repository, CommandLog, Commit } from "@/lib/types";
import {
  GitEngineState,
  createInitialGitState,
  executeTerminalCommand,
} from "@/lib/gitEngine";
import { addCommandLog, saveStudent, pushCommitToRepo } from "@/lib/storage";
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
  X,
  ChevronRight,
  ChevronDown,
  Trash2,
  Sparkles,
  Info,
  User,
  Settings,
  RefreshCw,
  Bell,
  Cloud,
} from "lucide-react";
import { TaskCompletionModal } from "../TaskCompletionModal";

interface Props {
  student: Student;
  repository: Repository;
  onStudentUpdate: (updated: Student) => void;
  onRepoUpdate: (updated: Repository) => void;
}

interface TerminalHistoryItem {
  prompt: string;
  command: string;
  output: string;
  isError: boolean;
  tip?: string;
}

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
  const [isAutoSaving, setIsAutoSaving] = useState<boolean>(false);
  const [showCompletionModal, setShowCompletionModal] = useState<boolean>(false);

  // Terminal
  const [terminalHistory, setTerminalHistory] = useState<TerminalHistoryItem[]>([
    {
      prompt: "aluno@gitsim:~$",
      command: "",
      output: `Bem-vindo ao terminal do VS Code simulado! 🚀\nClone o repositório da turma digitando:\n  git clone ${repository.cloneUrl}\n\nDigite 'help' para ver os comandos disponíveis.`,
      isError: false,
    },
  ]);
  const [currentInput, setCurrentInput] = useState("");
  const [commandHistoryList, setCommandHistoryList] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Sidebar do VS Code
  const [activeSidebar, setActiveSidebar] = useState<"explorer" | "git">("explorer");
  const [isRepoFolderOpen, setIsRepoFolderOpen] = useState(true);

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Rola o terminal para o fim quando novo comando é executado
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
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

  // Restaura sessão anterior do aluno do localStorage se existir
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const savedKey = `gitsim_state_${student.id}`;
        const savedRaw = localStorage.getItem(savedKey);
        if (savedRaw) {
          const parsed = JSON.parse(savedRaw);
          if (parsed.isRepoCloned) {
            setGitState((prev) => ({
              ...prev,
              ...parsed,
              stagedFiles: new Set(parsed.stagedFiles || []),
              untrackedFiles: new Set(parsed.untrackedFiles || []),
              modifiedFiles: new Set(parsed.modifiedFiles || []),
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
        };
        localStorage.setItem(savedKey, JSON.stringify(serialized));
      } catch {
        // fallback
      }
    }
  }, [gitState, student.id]);

  // Auto-Save com debounce de 800ms: salva automaticamente no Git virtual
  useEffect(() => {
    if (!activeFile) return;

    const timer = setTimeout(() => {
      const currentStored = gitState.files[activeFile];
      if (editorContent !== currentStored) {
        setIsAutoSaving(true);
        const updatedFiles = { ...gitState.files, [activeFile]: editorContent };
        const cleanFileName = activeFile.replace(`${gitState.repoFolder}/`, "");
        const originalRepoContent = gitState.remoteRepo.files[cleanFileName] || "";
        const hasChanged = editorContent !== originalRepoContent;

        const modified = new Set(gitState.modifiedFiles);
        if (hasChanged) {
          modified.add(cleanFileName);
        } else {
          modified.delete(cleanFileName);
        }

        setGitState((prev) => ({
          ...prev,
          files: updatedFiles,
          modifiedFiles: modified,
        }));
        setIsModified(false);

        // Se assinou o nome em chamada.txt, computa a tarefa
        if (cleanFileName === "chamada.txt") {
          const lower = editorContent.toLowerCase();
          const studentFirst = student.name.toLowerCase().split(" ")[0];
          if (lower.includes(studentFirst) && !student.hasEdited) {
            const updatedStudent: Student = {
              ...student,
              hasEdited: true,
              score: Math.max(student.score, 50),
              lastActive: new Date().toISOString(),
            };
            onStudentUpdate(updatedStudent);
            saveStudent(updatedStudent);
          }
        }

        setTimeout(() => setIsAutoSaving(false), 500);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [editorContent, activeFile]);

  // Se o aluno clica em um arquivo para abrir no editor
  const handleOpenFile = (filePath: string) => {
    if (!openFiles.includes(filePath)) {
      setOpenFiles((prev) => [...prev, filePath]);
    }
    setActiveFile(filePath);
    setEditorContent(gitState.files[filePath] || "");
    setIsModified(false);
  };

  const handleCloseFile = (filePath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const remaining = openFiles.filter((f) => f !== filePath);
    setOpenFiles(remaining);
    if (activeFile === filePath) {
      if (remaining.length > 0) {
        const next = remaining[remaining.length - 1];
        setActiveFile(next);
        setEditorContent(gitState.files[next] || "");
      } else {
        setActiveFile(null);
        setEditorContent("");
      }
    }
  };

  // Salvar arquivo no editor
  const handleSaveFile = () => {
    if (!activeFile) return;

    const updatedFiles = { ...gitState.files, [activeFile]: editorContent };
    const cleanFileName = activeFile.replace(`${gitState.repoFolder}/`, "");

    // Verifica se houve alteração em relação ao arquivo original
    const originalContent = gitState.remoteRepo.files[cleanFileName] || "";
    const hasChanged = editorContent !== originalContent;

    const modified = new Set(gitState.modifiedFiles);
    if (hasChanged) {
      modified.add(cleanFileName);
    } else {
      modified.delete(cleanFileName);
    }

    setGitState((prev) => ({
      ...prev,
      files: updatedFiles,
      modifiedFiles: modified,
    }));

    setIsModified(false);
    setSaveSuccessMsg("Arquivo salvo com sucesso!");
    setTimeout(() => setSaveSuccessMsg(""), 2500);

    // Se o arquivo salvo for a chamada e o aluno tiver escrito o próprio nome
    if (cleanFileName === "chamada.txt") {
      const lower = editorContent.toLowerCase();
      const studentFirst = student.name.toLowerCase().split(" ")[0];
      if (lower.includes(studentFirst) && !student.hasEdited) {
        const updatedStudent: Student = {
          ...student,
          hasEdited: true,
          score: Math.max(student.score, 50),
          lastActive: new Date().toISOString(),
        };
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

    // Atualiza histórico do shell (seta para cima/baixo)
    setCommandHistoryList((prev) => [...prev, cmd]);
    setHistoryIndex(-1);

    const promptText =
      gitState.currentDir === "~"
        ? "aluno@gitsim:~$"
        : `aluno@gitsim:~/${gitState.repoFolder} (${gitState.head || "main"})$`;

    const result = executeTerminalCommand(cmd, gitState);

    // Trata comando clear
    if (result.output === "\x1b[CLEAR]") {
      setTerminalHistory([]);
      setCurrentInput("");
      setGitState(result.newState);
      return;
    }

    // Registra item no terminal
    setTerminalHistory((prev) => [
      ...prev,
      {
        prompt: promptText,
        command: cmd,
        output: result.output,
        isError: result.isError,
        tip: result.tip,
      },
    ]);

    // Atualiza estado do Git
    setGitState(result.newState);

    // Se clonou, abre a pasta e abre o arquivo no editor automaticamente para ajudar o aluno
    if (result.stepCompleted === "clone") {
      const fileToOpen = `${result.newState.repoFolder}/chamada.txt`;
      if (!openFiles.includes(fileToOpen)) {
        setOpenFiles([fileToOpen]);
        setActiveFile(fileToOpen);
        setEditorContent(result.newState.files[fileToOpen] || "");
      }
      const updatedStudent: Student = {
        ...student,
        hasCloned: true,
        score: Math.max(student.score, 25),
        totalCommands: student.totalCommands + 1,
        errorCommands: result.isError ? student.errorCommands + 1 : student.errorCommands,
        lastActive: new Date().toISOString(),
      };
      onStudentUpdate(updatedStudent);
      saveStudent(updatedStudent);
    } else {
      // Atualiza contadores gerais do aluno
      const updatedStudent: Student = {
        ...student,
        totalCommands: student.totalCommands + 1,
        errorCommands: result.isError ? student.errorCommands + 1 : student.errorCommands,
        lastActive: new Date().toISOString(),
      };

      if (result.stepCompleted === "commit") {
        updatedStudent.hasCommitted = true;
        updatedStudent.score = Math.max(student.score, 75);
      }

      if (result.stepCompleted === "push" && result.pushedCommit) {
        updatedStudent.hasPushed = true;
        updatedStudent.score = 100;

        // Dispara confetes de comemoração e abre o card animado de conclusão!
        confetti({
          particleCount: 120,
          spread: 70,
          origin: { y: 0.6 },
        });
        setShowCompletionModal(true);

        // Atualiza repositório remoto central
        const cleanFiles: Record<string, string> = {};
        for (const [k, v] of Object.entries(result.newState.files)) {
          cleanFiles[k.replace(`${result.newState.repoFolder}/`, "")] = v;
        }

        const newRepo = pushCommitToRepo(result.pushedCommit, cleanFiles);
        onRepoUpdate(newRepo);

        // Sincroniza push com o backend / banco serverless
        fetch("/api/git/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            commit: result.pushedCommit,
            updatedFiles: cleanFiles,
            studentId: student.id,
          }),
        }).catch((err) => console.warn("[VSCode] Erro sync push:", err));
      }

      onStudentUpdate(updatedStudent);
      saveStudent(updatedStudent);

      // Sincroniza progresso do aluno com o backend
      fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedStudent),
      }).catch((err) => console.warn("[VSCode] Erro sync student:", err));
    }

    // Registra log para o professor
    const logItem: CommandLog = {
      id: `log-${Date.now()}`,
      studentId: student.id,
      studentName: student.name,
      turma: student.turma,
      command: cmd,
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

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-[#1e1e1e] text-[#cccccc] select-none">
      {/* CORPO PRINCIPAL DO VS CODE */}
      <div className="flex-1 flex overflow-hidden">
        {/* BARRA LATERAL DE ATIVIDADES (ACTIVITY BAR) */}
        <div className="w-12 bg-[#333333] flex flex-col items-center py-2 justify-between border-r border-[#252526] z-10 shrink-0">
          <div className="flex flex-col items-center space-y-4 w-full">
            <button
              onClick={() => setActiveSidebar("explorer")}
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
              onClick={() => setActiveSidebar("git")}
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
          </div>

          {/* ÍCONES DE BASE DA ACTIVITY BAR (CONTAS & CONFIGURAÇÕES) */}
          <div className="flex flex-col items-center space-y-3 pb-1 text-gray-400">
            <button
              type="button"
              title="Contas / Perfil"
              className="p-2 rounded hover:text-white hover:bg-white/10 transition cursor-pointer"
            >
              <User className="w-5 h-5" />
            </button>
            <button
              type="button"
              title="Configurações (Settings)"
              className="p-2 rounded hover:text-white hover:bg-white/10 transition cursor-pointer"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* PAINEL LATERAL (SIDEBAR EXPLORER / SOURCE CONTROL) */}
        <div className="w-64 bg-[#252526] border-r border-[#191919] flex flex-col text-xs">
          {activeSidebar === "explorer" ? (
            <div className="flex flex-col h-full">
              <div className="px-4 py-2 font-bold uppercase tracking-wider text-gray-400 border-b border-[#1f1f1f] flex items-center justify-between">
                <span>Explorer</span>
              </div>

              <div className="p-2 space-y-1 overflow-y-auto flex-1">
                {!gitState.isRepoCloned ? (
                  <div className="p-3 text-gray-400 text-xs bg-[#1e1e1e] rounded border border-[#333333] space-y-2">
                    <p className="font-semibold text-amber-400 flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5" />
                      Nenhum repositório aberto
                    </p>
                    <p className="text-[11px] text-gray-400">
                      Clone o repositório da turma digitando no terminal abaixo:
                    </p>
                    <code className="block bg-[#2d2d2d] p-1.5 rounded text-blue-300 font-mono text-[10px] break-all">
                      git clone {repository.cloneUrl}
                    </code>
                  </div>
                ) : (
                  <div>
                    {/* PASTA DO REPOSITÓRIO */}
                    <div
                      onClick={() => setIsRepoFolderOpen(!isRepoFolderOpen)}
                      className="flex items-center gap-1 py-1 px-1.5 hover:bg-[#2a2d2e] rounded cursor-pointer font-semibold text-gray-200"
                    >
                      {isRepoFolderOpen ? (
                        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                      )}
                      <Folder className="w-4 h-4 text-blue-400 fill-blue-400/20" />
                      <span>{gitState.repoFolder}</span>
                    </div>

                    {/* ARQUIVOS DENTRO DA PASTA */}
                    {isRepoFolderOpen && (
                      <div className="pl-5 space-y-0.5 mt-0.5">
                        {Object.keys(gitState.files).map((fullPath) => {
                          const fileName = fullPath.replace(`${gitState.repoFolder}/`, "");
                          const isModifiedFile = gitState.modifiedFiles.has(fileName);
                          const isStagedFile = gitState.stagedFiles.has(fileName);
                          const isActive = activeFile === fullPath;

                          return (
                            <div
                              key={fullPath}
                              onClick={() => handleOpenFile(fullPath)}
                              className={`flex items-center justify-between py-1 px-2 rounded cursor-pointer transition ${
                                isActive
                                  ? "bg-[#37373d] text-white"
                                  : "hover:bg-[#2a2d2e] text-gray-300"
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <FileCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                <span className="truncate">{fileName}</span>
                              </div>

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
              <div className="font-bold uppercase tracking-wider text-gray-400 mb-3">
                Source Control: Git
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
                    Array.from(gitState.stagedFiles).map((f) => (
                      <div key={f} className="text-emerald-400 flex items-center gap-1.5 py-0.5">
                        <FileCode className="w-3.5 h-3.5" />
                        <span>{f}</span>
                        <span className="text-[10px] bg-emerald-950 text-emerald-300 px-1 rounded ml-auto">
                          Staged
                        </span>
                      </div>
                    ))
                  )}
                </div>

                <div>
                  <div className="text-gray-400 font-semibold mb-1 flex items-center justify-between">
                    <span>Changes (Modificados)</span>
                    <span className="bg-[#333333] px-1.5 rounded text-[10px]">
                      {gitState.modifiedFiles.size}
                    </span>
                  </div>
                  {gitState.modifiedFiles.size === 0 ? (
                    <p className="text-gray-500 italic text-[11px]">Nenhuma alteração pendente</p>
                  ) : (
                    Array.from(gitState.modifiedFiles).map((f) => (
                      <div key={f} className="text-amber-400 flex items-center gap-1.5 py-0.5">
                        <FileCode className="w-3.5 h-3.5" />
                        <span>{f}</span>
                        <span className="text-[10px] bg-amber-950 text-amber-300 px-1 rounded ml-auto">
                          Modificado
                        </span>
                      </div>
                    ))
                  )}
                </div>

                <div className="p-2.5 bg-[#1e1e1e] rounded border border-[#333333] text-[11px] text-gray-300">
                  <p className="font-semibold text-blue-400 mb-1">💡 Comandos Rápidos:</p>
                  <code>git add .</code>
                  <br />
                  <code>git commit -m &quot;mensagem&quot;</code>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ÁREA DO EDITOR DE CÓDIGO */}
        <div className="flex-1 flex flex-col bg-[#1e1e1e] overflow-hidden">
          {/* ABAS DO EDITOR */}
          <div className="flex items-center bg-[#252526] border-b border-[#191919] overflow-x-auto h-9">
            {openFiles.length === 0 ? (
              <div className="px-4 text-xs text-gray-500 italic">
                Nenhum arquivo aberto no editor
              </div>
            ) : (
              openFiles.map((f) => {
                const fileName = f.replace(`${gitState.repoFolder}/`, "");
                const isActive = activeFile === f;

                return (
                  <div
                    key={f}
                    onClick={() => {
                      setActiveFile(f);
                      setEditorContent(gitState.files[f] || "");
                      setIsModified(false);
                    }}
                    className={`flex items-center gap-2 px-3 py-1.5 text-xs border-r border-[#191919] cursor-pointer ${
                      isActive
                        ? "bg-[#1e1e1e] text-white border-t-2 border-t-blue-500"
                        : "bg-[#2d2d2d] text-gray-400 hover:bg-[#252526]"
                    }`}
                  >
                    <FileCode className="w-3.5 h-3.5 text-blue-400" />
                    <span>{fileName}</span>
                    {isModified && isActive && (
                      <span className="w-2 h-2 rounded-full bg-white ml-1" title="Não salvo" />
                    )}
                    <button
                      onClick={(e) => handleCloseFile(f, e)}
                      className="hover:text-red-400 p-0.5 rounded cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })
            )}

            {/* INDICADOR DE AUTO-SAVE E BOTÃO SALVAR */}
            {activeFile && (
              <div className="ml-auto pr-3 flex items-center gap-2.5">
                <div
                  className="flex items-center gap-1.5 text-[11px] text-gray-400 bg-[#1e1e1e] border border-[#30363d] px-2.5 py-0.5 rounded-full"
                  title="Salvamento Automático contínuo ativo: você nunca perde seu trabalho"
                >
                  <Cloud className={`w-3.5 h-3.5 ${isAutoSaving ? "text-amber-400 animate-pulse" : "text-emerald-400"}`} />
                  <span className={isAutoSaving ? "text-amber-300 font-medium" : "text-emerald-400 font-medium"}>
                    {isAutoSaving ? "Salvando..." : "Auto Save: Ativado"}
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
            )}
          </div>

          {/* ÁREA DE TEXTO / LINHAS */}
          {activeFile ? (
            <div className="flex-1 flex overflow-hidden font-mono text-xs sm:text-sm">
              {/* NÚMEROS DE LINHA */}
              <div className="w-12 bg-[#1e1e1e] text-gray-600 select-none text-right pr-3 pt-3 border-r border-[#2d2d2d] leading-6">
                {editorContent.split("\n").map((_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>

              {/* TEXTAREA DO EDITOR */}
              <textarea
                value={editorContent}
                onChange={(e) => {
                  setEditorContent(e.target.value);
                  setIsModified(true);
                }}
                placeholder="Digite seu código ou altere o arquivo aqui..."
                className="flex-1 p-3 bg-[#1e1e1e] text-gray-200 outline-none resize-none leading-6 font-mono selection:bg-blue-600/40"
                spellCheck={false}
              />
            </div>
          ) : (
            /* TELA INICIAL QUANDO NÃO HÁ ARQUIVO ABERTO */
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-gray-400">
              <div className="w-16 h-16 rounded-2xl bg-[#252526] flex items-center justify-center text-blue-400 mb-4 shadow-lg border border-[#333333]">
                <FileCode className="w-8 h-8" />
              </div>
              <h3 className="text-base font-semibold text-gray-200 mb-1">
                VS Code Simulado - Editor de Código
              </h3>
              <p className="text-xs max-w-md text-gray-400 mb-4">
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

      {/* PAINEL INFERIOR: TERMINAL INTEGRADO DO VS CODE */}
      <div className="h-64 sm:h-72 bg-[#181818] border-t border-[#333333] flex flex-col">
        {/* CABEÇALHO DO TERMINAL */}
        <div className="flex items-center justify-between px-4 py-1.5 bg-[#1f1f1f] border-b border-[#2d2d2d] text-xs">
          <div className="flex items-center gap-4">
            <span className="font-semibold text-white border-b-2 border-blue-500 pb-0.5 flex items-center gap-1.5">
              <TerminalIcon className="w-3.5 h-3.5 text-blue-400" />
              TERMINAL
            </span>
            <span className="text-gray-500 hover:text-gray-300 cursor-pointer">OUTPUT</span>
            <span className="text-gray-500 hover:text-gray-300 cursor-pointer">PROBLEMS</span>
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
          onClick={() => inputRef.current?.focus()}
          className="flex-1 p-3 overflow-y-auto font-mono text-xs sm:text-[13px] leading-relaxed cursor-text"
        >
          {terminalHistory.map((item, index) => (
            <div key={index} className="mb-2">
              {item.command && (
                <div className="flex items-center gap-2 text-gray-300">
                  <span className="text-emerald-400 font-semibold">{item.prompt}</span>
                  <span className="text-white">{item.command}</span>
                </div>
              )}

              {item.output && (
                <pre
                  className={`mt-0.5 whitespace-pre-wrap ${
                    item.isError ? "text-red-400" : "text-gray-300"
                  }`}
                >
                  {item.output}
                </pre>
              )}

              {/* DICA PEDAGÓGICA INTELIGENTE DESTACADA */}
              {item.tip && (
                <div className="mt-2 mb-2 p-2.5 rounded-lg bg-amber-950/40 border border-amber-600/40 text-amber-200 text-xs">
                  <pre className="whitespace-pre-wrap font-sans font-medium">{item.tip}</pre>
                </div>
              )}
            </div>
          ))}

          {/* LINHA DE INPUT ATUAL */}
          <form onSubmit={handleCommandSubmit} className="flex items-center gap-2 mt-1">
            <span className="text-emerald-400 font-semibold shrink-0">{promptString}</span>
            <input
              ref={inputRef}
              type="text"
              value={currentInput}
              onChange={(e) => setCurrentInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent text-white outline-none font-mono text-xs sm:text-[13px]"
              autoFocus
              spellCheck={false}
              autoComplete="off"
            />
          </form>
          <div ref={terminalEndRef} />
        </div>
      </div>

      {/* STATUS BAR INFERIOR ASSINATURA VS CODE (#007acc) */}
      <div className="h-6 bg-[#007acc] text-white flex items-center justify-between px-3 text-[11px] font-sans select-none shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-1 hover:bg-white/20 px-1.5 py-0.5 rounded cursor-pointer transition active:scale-[0.98]"
            title={`Branch atual: ${gitState.head || "main"}`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span className="font-semibold">{gitState.head || "main"}*</span>
          </div>

          <div
            className="flex items-center gap-1 hover:bg-white/20 px-1.5 py-0.5 rounded cursor-pointer transition text-white/95 active:scale-[0.98]"
            title="Sincronização de Commits"
          >
            <RefreshCw className="w-3 h-3" />
            <span>0↓ {gitState.localCommits.length > gitState.remoteRepo.commits.length ? "1↑" : "0↑"}</span>
          </div>

          <div
            className="flex items-center gap-1 hover:bg-white/20 px-1.5 py-0.5 rounded cursor-pointer transition text-white/90"
            title="Salvamento Automático Ativo no Editor"
          >
            <Cloud className="w-3 h-3 text-emerald-300" />
            <span className="text-[10px] text-emerald-300 font-medium hidden sm:inline">Auto Save</span>
          </div>

          <div className="flex items-center gap-1.5 text-white/90 hover:bg-white/20 px-1.5 py-0.5 rounded cursor-pointer transition">
            <span className="flex items-center gap-0.5">
              <span className="text-[10px]">⊗</span> 0
            </span>
            <span className="flex items-center gap-0.5">
              <span className="text-[10px]">⚠</span> 0
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-white/95 text-[11px]">
          <span className="hover:bg-white/20 px-1.5 py-0.5 rounded cursor-pointer transition hidden sm:inline">
            Ln 35, Col 1
          </span>
          <span className="hover:bg-white/20 px-1.5 py-0.5 rounded cursor-pointer transition hidden sm:inline">
            Spaces: 2
          </span>
          <span className="hover:bg-white/20 px-1.5 py-0.5 rounded cursor-pointer transition">
            UTF-8
          </span>
          <span className="hover:bg-white/20 px-1.5 py-0.5 rounded cursor-pointer transition hidden md:inline">
            LF
          </span>
          <span className="hover:bg-white/20 px-1.5 py-0.5 rounded cursor-pointer transition font-medium">
            {activeFile ? (activeFile.endsWith(".txt") ? "Plain Text" : "Markdown") : "Plain Text"}
          </span>
          <button
            type="button"
            className="hover:bg-white/20 p-1 rounded cursor-pointer transition active:scale-[0.95]"
            title="Notificações"
          >
            <Bell className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* MODAL ANIMADO DE CONCLUSÃO DA TAREFA */}
      <TaskCompletionModal
        student={student}
        isOpen={showCompletionModal}
        onClose={() => setShowCompletionModal(false)}
      />
    </div>
  );
};
