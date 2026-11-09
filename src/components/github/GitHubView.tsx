"use client";

import React, { useEffect, useState } from "react";
import { Repository } from "@/lib/types";
import { ActivityMode, getStoredActivityMode } from "@/lib/activity";
import {
  GitFork,
  Star,
  Eye,
  GitBranch,
  FolderGit2,
  Copy,
  Check,
  FileText,
  Clock,
  ExternalLink,
  BookOpen,
  Code2,
  CircleDot,
  GitPullRequest,
  Search,
  Bell,
  ChevronDown,
} from "lucide-react";

/** Tempo relativo estilo GitHub ("há 2 horas", "há 3 dias"). */
function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "agora mesmo";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} ${hours === 1 ? "hora" : "horas"}`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days} ${days === 1 ? "dia" : "dias"}`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

/** Tamanho em bytes formatado (B/KB), derivado do conteúdo real. */
function formatBytes(content: string): string {
  const bytes = new TextEncoder().encode(content).length;
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/** Linguagem por extensão, no padrão da barra "Languages" do GitHub. */
function languageOf(filename: string): { label: string; color: string } {
  if (filename.endsWith(".md")) return { label: "Markdown", color: "bg-[#083fa1]" };
  if (filename.endsWith(".txt")) return { label: "Texto", color: "bg-[#6b7280]" };
  const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".") + 1) : "";
  return { label: ext ? ext.toUpperCase() : "Outros", color: "bg-[#8b949e]" };
}

/** URL SSH derivada da URL HTTPS (mesmo host, dono e repositório). */
function sshCloneUrl(cloneUrl: string): string {
  const match = cloneUrl.match(/^https?:\/\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (!match) return cloneUrl;
  return `git@${match[1]}:${match[2]}.git`;
}

/** Mini-renderizador de Markdown (títulos, listas, negrito, código) sem
 *  dependência nova e sem innerHTML — o README do repositório é curto e
 *  o GitHub de verdade renderiza README, não mostra o fonte. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={`${keyPrefix}-${i}`}
          className="bg-[#21262d] border border-[#30363d] rounded px-1 py-0.5 font-mono text-[12px] text-gray-200"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={`${keyPrefix}-${i}`}>{part}</React.Fragment>;
  });
}

function renderMarkdown(content: string): React.ReactNode {
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let listItems: string[] = [];
  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="list-disc pl-6 space-y-1 my-2">
          {listItems.map((item, i) => (
            <li key={i}>{renderInline(item, `li-${blocks.length}-${i}`)}</li>
          ))}
        </ul>
      );
      listItems = [];
    }
  };
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      listItems.push(trimmed.slice(2));
      return;
    }
    flushList();
    if (trimmed.startsWith("### ")) {
      blocks.push(
        <h3 key={idx} className="text-base font-bold text-white mt-4 mb-1">
          {renderInline(trimmed.slice(4), `h3-${idx}`)}
        </h3>
      );
    } else if (trimmed.startsWith("## ")) {
      blocks.push(
        <h2 key={idx} className="text-lg font-bold text-white mt-4 mb-1">
          {renderInline(trimmed.slice(3), `h2-${idx}`)}
        </h2>
      );
    } else if (trimmed.startsWith("# ")) {
      blocks.push(
        <h1 key={idx} className="text-xl font-bold text-white mt-2 mb-2 pb-2 border-b border-[#30363d]">
          {renderInline(trimmed.slice(2), `h1-${idx}`)}
        </h1>
      );
    } else if (trimmed.startsWith("> ")) {
      blocks.push(
        <blockquote key={idx} className="border-l-4 border-[#30363d] pl-3 text-gray-400 my-2">
          {renderInline(trimmed.slice(2), `q-${idx}`)}
        </blockquote>
      );
    } else if (trimmed === "") {
      blocks.push(<div key={idx} className="h-2" />);
    } else {
      blocks.push(
        <p key={idx} className="my-1">
          {renderInline(trimmed, `p-${idx}`)}
        </p>
      );
    }
  });
  flushList();
  return <>{blocks}</>;
}

interface Props {
  repository: Repository;
  /** Turma dona desta lista — exibida como selo, nunca como seletor. */
  turma?: string;
}

export const GitHubView: React.FC<Props> = ({ repository, turma }) => {
  const [activeTab, setActiveTab] = useState<"code" | "commits">("code");
  const [selectedFile, setSelectedFile] = useState<string>("chamada.txt");
  const [showCloneDropdown, setShowCloneDropdown] = useState(false);
  const [revealCloneCommand, setRevealCloneCommand] = useState(false);
  // Modo da atividade (mesmo padrão do VSCodeView: leitura pós-montagem
  // para não quebrar a hidratação). P3: no modo "Sem receita" o botão
  // "Revelar comando de clone" é SUPRIMIDO, não contado — suprimir é
  // mais robusto que contar, porque o comando nunca chega a ser exibido
  // e a nota sem receita não depende de rastrear este reveal.
  const [activityMode, setActivityMode] = useState<ActivityMode>("guided");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActivityMode(getStoredActivityMode());
  }, []);
  const [copied, setCopied] = useState(false);
  const [fileCopied, setFileCopied] = useState(false);
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  const [cloneTab, setCloneTab] = useState<"https" | "ssh">("https");
  const [sshCopied, setSshCopied] = useState(false);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [readmeView, setReadmeView] = useState<"preview" | "raw">("preview");

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const handleCopySsh = () => {
    navigator.clipboard.writeText(sshCloneUrl(repository.cloneUrl));
    setSshCopied(true);
    setTimeout(() => setSshCopied(false), 2000);
  };

  const handleCopyClone = () => {
    navigator.clipboard.writeText(repository.cloneUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyFile = (content: string) => {
    navigator.clipboard.writeText(content);
    setFileCopied(true);
    setTimeout(() => setFileCopied(false), 2000);
  };

  const fileEntries = Object.entries(repository.files);
  const latestCommit = repository.commits[0];

  // Barra "Languages" do GitHub, derivada do conteúdo real: bytes por
  // extensão (nenhum número inventado — só o que o repositório tem).
  const languageStats = (() => {
    const totals = new Map<string, { label: string; color: string; bytes: number }>();
    let totalBytes = 0;
    for (const [name, content] of fileEntries) {
      const bytes = new TextEncoder().encode(content).length;
      totalBytes += bytes;
      const meta = languageOf(name);
      const prev = totals.get(meta.label);
      totals.set(meta.label, {
        label: meta.label,
        color: meta.color,
        bytes: (prev?.bytes ?? 0) + bytes,
      });
    }
    if (totalBytes === 0) return [];
    return [...totals.values()].map((l) => ({
      ...l,
      pct: (l.bytes / totalBytes) * 100,
    }));
  })();

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#0d1117] text-[#c9d1d9] pb-16">
      {/* BARRA GLOBAL ESTILO github.com (header preto, busca, navegação) */}
      <div className="bg-[#010409] border-b border-[#30363d]">
        <div className="max-w-7xl mx-auto px-4 h-12 flex items-center gap-4">
          <span title="GitHub — simulado" className="shrink-0 text-white" aria-label="GitHub">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
              <circle cx="16" cy="17" r="11" />
              <path d="M9 8 L6 3 L12 5 Z M23 8 L26 3 L20 5 Z" />
            </svg>
          </span>
          <label className="hidden md:flex items-center gap-2 flex-1 max-w-md bg-[#0d1117] border border-[#30363d] rounded-md px-2.5 py-1 text-xs text-gray-400">
            <Search className="w-3.5 h-3.5 shrink-0" />
            <input
              type="text"
              readOnly
              placeholder="Search or jump to…"
              aria-label="Busca do GitHub (não faz parte da simulação)"
              title="Busca — não faz parte da simulação"
              className="bg-transparent outline-none w-full placeholder:text-gray-500"
            />
            <kbd className="shrink-0 text-[10px] border border-[#30363d] rounded px-1 text-gray-500">/</kbd>
          </label>
          <nav className="hidden sm:flex items-center gap-4 text-sm font-semibold text-gray-200">
            <span title="Pull requests — fora do escopo da simulação" className="hover:text-white cursor-default">Pull requests</span>
            <span title="Issues — fora do escopo da simulação" className="hover:text-white cursor-default">Issues</span>
            <span title="Codespaces — fora do escopo da simulação" className="hover:text-white cursor-default">Codespaces</span>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span title="Notificações — não disponível na simulação" aria-label="Notificações — não disponível na simulação" className="text-gray-300 opacity-70">
              <Bell className="w-4 h-4" />
            </span>
            <span
              title="Perfil — não disponível na simulação"
              aria-label="Perfil — não disponível na simulação"
              className="w-6 h-6 rounded-full bg-[#30363d] border border-[#484f58] shrink-0"
            />
          </div>
        </div>
      </div>

      {/* CABEÇALHO DO REPOSITÓRIO ESTILO GITHUB */}
      <div className="bg-[#161b22] border-b border-[#30363d] pt-6 pb-0">
        <div className="max-w-7xl mx-auto px-4">
          {/* TOPO: NOME DO REPO & STATS */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2 text-lg">
              <FolderGit2 className="w-5 h-5 text-gray-400" />
              <span className="text-blue-400">
                {repository.owner}
              </span>
              <span className="text-gray-500">/</span>
              <span className="font-bold text-white">
                {repository.name}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full border border-[#30363d] text-gray-400 font-medium">
                Public
              </span>
              {turma && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-950 text-blue-300 border border-blue-800 font-medium">
                  Turma {turma}
                </span>
              )}
            </div>

            {/* BOTÕES ESTILO GITHUB (WATCH, FORK, STAR) */}
            <div className="flex items-center gap-2 text-xs font-semibold">
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#21262d] border border-[#30363d] text-gray-400" title="Watch — não faz parte da simulação">
                <Eye className="w-3.5 h-3.5" />
                Watch
                <span className="px-1.5 py-0.2 bg-[#30363d] rounded-full text-[10px]">12</span>
              </span>
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#21262d] border border-[#30363d] text-gray-400" title="Fork — não faz parte da simulação">
                <GitFork className="w-3.5 h-3.5" />
                Fork
                <span className="px-1.5 py-0.2 bg-[#30363d] rounded-full text-[10px]">4</span>
              </span>
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#21262d] border border-[#30363d] text-gray-400" title="Star — não faz parte da simulação">
                <Star className="w-3.5 h-3.5 text-yellow-400" />
                Star
                <span className="px-1.5 py-0.2 bg-[#30363d] rounded-full text-[10px]">28</span>
              </span>
            </div>
          </div>

          <p className="text-sm text-gray-400 mb-6">
            {repository.description}
          </p>

          {/* ABAS ESTILO GITHUB (CODE, ISSUES, PULL REQUESTS, COMMITS) */}
          <div className="flex items-center gap-1 sm:gap-4 overflow-x-auto border-b border-transparent">
            <button
              onClick={() => setActiveTab("code")}
              className={`flex items-center gap-2 pb-3 px-2 text-sm font-medium border-b-2 transition cursor-pointer shrink-0 ${
                activeTab === "code"
                  ? "border-[#f78166] text-white"
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              <Code2 className="w-4 h-4" />
              Code
            </button>

            <span
              className="flex items-center gap-1.5 pb-3 px-2 text-sm font-medium border-b-2 border-transparent text-gray-500 shrink-0"
              title="Issues — fora do escopo da simulação (foco no fluxo Git CLI)"
            >
              <CircleDot className="w-4 h-4" />
              Issues
              <span className="px-1.5 py-0.2 bg-[#30363d] rounded-full text-[10px] text-gray-300">0</span>
            </span>

            <span
              className="flex items-center gap-1.5 pb-3 px-2 text-sm font-medium border-b-2 border-transparent text-gray-500 shrink-0"
              title="Pull requests — fora do escopo da simulação (foco no fluxo Git CLI)"
            >
              <GitPullRequest className="w-4 h-4" />
              Pull requests
              <span className="px-1.5 py-0.2 bg-[#30363d] rounded-full text-[10px] text-gray-300">0</span>
            </span>

            <button
              onClick={() => setActiveTab("commits")}
              className={`flex items-center gap-2 pb-3 px-2 text-sm font-medium border-b-2 transition cursor-pointer shrink-0 ${
                activeTab === "commits"
                  ? "border-[#f78166] text-white"
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              <Clock className="w-4 h-4" />
              Commits
              <span className="px-2 py-0.5 rounded-full bg-[#30363d] text-xs font-semibold text-gray-300">
                {repository.commits.length}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* CONTEÚDO DA PÁGINA */}
      <div className="max-w-7xl mx-auto px-4 mt-6">
        {activeTab === "code" ? (
          <div className="flex gap-6 items-start">
            <div className="flex-1 min-w-0">
            {/* BARRA DE AÇÕES (BRANCH & BOTÃO VERDE CLONAR) */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowBranchDropdown(!showBranchDropdown)}
                    aria-expanded={showBranchDropdown}
                    aria-label="Selecionar branch"
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#21262d] border border-[#30363d] text-sm text-gray-200 font-medium hover:bg-[#30363d] transition cursor-pointer"
                  >
                    <GitBranch className="w-4 h-4 text-gray-400" />
                    <span>{repository.defaultBranch}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                  {showBranchDropdown && (
                    <>
                      <button
                        type="button"
                        aria-label="Fechar seletor de branches"
                        onClick={() => setShowBranchDropdown(false)}
                        className="fixed inset-0 z-30 cursor-default"
                      />
                      <div className="absolute left-0 mt-2 w-72 rounded-xl bg-[#161b22] border border-[#30363d] shadow-2xl p-2 z-40">
                        <p className="px-2 py-1.5 text-xs font-semibold text-gray-400">
                          Branches
                        </p>
                        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-[#1f242c] text-sm text-white">
                          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>{repository.defaultBranch}</span>
                          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-[#21262d] border border-[#30363d] text-gray-400">
                            atual
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#21262d] border border-[#30363d] text-gray-400">
                            padrão
                          </span>
                        </div>
                        <p className="px-2 py-2 text-[11px] text-gray-500 leading-relaxed">
                          Branches criadas no VS Code aparecem aqui após o push.
                        </p>
                      </div>
                    </>
                  )}
                </div>
                <div className="text-xs text-gray-400 hidden sm:flex items-center gap-1.5">
                  <span className="font-semibold text-white">1</span> branch
                  <span className="text-gray-600">•</span>
                  <span className="font-semibold text-white">0</span> tags
                </div>
              </div>

              {/* BOTÃO VERDE CLONAR COM DROPDOWN */}
              <div className="relative">
                <button
                  onClick={() => setShowCloneDropdown(!showCloneDropdown)}
                  aria-expanded={showCloneDropdown}
                  aria-label="Mostrar opções de clone"
                  className="flex items-center gap-2 px-4 py-1.5 rounded-md bg-[#238636] hover:bg-[#2ea043] text-white text-sm font-semibold shadow transition cursor-pointer"
                >
                  <Code2 className="w-4 h-4" />
                  <span>&lt;&gt; Code</span>
                </button>

                {showCloneDropdown && (
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-[#161b22] border border-[#30363d] shadow-2xl p-4 z-30">
                    <div className="flex items-center justify-between border-b border-[#30363d] pb-2 mb-3">
                      <div className="flex items-center gap-2">
                        <FolderGit2 className="w-4 h-4 text-blue-400" />
                        <span className="text-sm font-bold text-white">Clone</span>
                      </div>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                        Pronto para copiar
                      </span>
                    </div>

                    <div className="flex items-center gap-1 mb-3 text-xs font-semibold" role="tablist" aria-label="Método de clone">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={cloneTab === "https"}
                        onClick={() => setCloneTab("https")}
                        className={`px-3 py-1.5 rounded-md cursor-pointer transition ${
                          cloneTab === "https" ? "bg-[#21262d] text-white border border-[#30363d]" : "text-gray-400 hover:text-gray-200"
                        }`}
                      >
                        HTTPS
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={cloneTab === "ssh"}
                        onClick={() => setCloneTab("ssh")}
                        className={`px-3 py-1.5 rounded-md cursor-pointer transition ${
                          cloneTab === "ssh" ? "bg-[#21262d] text-white border border-[#30363d]" : "text-gray-400 hover:text-gray-200"
                        }`}
                      >
                        SSH
                      </button>
                    </div>

                    <p className="text-xs text-gray-300 mb-2">
                      Use esta URL no terminal do VS Code com o comando git clone:
                    </p>

                    <div className="flex items-center bg-[#0d1117] border border-[#30363d] rounded-lg p-1.5 mb-3">
                      <input
                        type="text"
                        readOnly
                        value={cloneTab === "https" ? repository.cloneUrl : sshCloneUrl(repository.cloneUrl)}
                        aria-label={`URL de clone via ${cloneTab.toUpperCase()}`}
                        className="bg-transparent text-xs text-gray-200 px-2 py-1 w-full focus:outline-none font-mono selection:bg-blue-600"
                      />
                      <button
                        onClick={cloneTab === "https" ? handleCopyClone : handleCopySsh}
                        className="p-1.5 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded-md text-gray-200 transition cursor-pointer flex items-center gap-1 text-xs shrink-0"
                        title="Copiar URL"
                      >
                        {(cloneTab === "https" ? copied : sshCopied) ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-400" />
                            <span className="text-emerald-400 font-bold">Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            <span>Copiar</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="bg-[#0d1117] p-2.5 rounded-lg border border-[#21262d] text-[11px] text-gray-300 space-y-1">
                      <p className="font-semibold text-amber-300 flex items-center gap-1">
                        💡 Passo seguinte no VS Code:
                      </p>
                      <p>
                        No terminal do VS Code, clone este repositório usando a URL copiada acima.
                      </p>
                      {/* P3: suprimido no modo "Sem receita" (ver acima). */}
                      {activityMode !== "unaided" &&
                        (revealCloneCommand ? (
                          <code className="block bg-[#161b22] p-1.5 rounded text-emerald-400 font-mono text-xs">
                            git clone {repository.cloneUrl}
                          </code>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setRevealCloneCommand(true)}
                            className="font-semibold text-blue-400 hover:text-blue-300 underline underline-offset-2 cursor-pointer"
                          >
                            Revelar comando de clone
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* TABELA DE ARQUIVOS */}
            <div className="rounded-xl border border-[#30363d] bg-[#161b22] overflow-hidden mb-6">
              {/* LINHA DO ÚLTIMO COMMIT */}
              {latestCommit && (
                <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-[#161b22] border-b border-[#30363d] text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-blue-600/30 border border-blue-500/40 text-blue-300 flex items-center justify-center font-bold text-[10px]">
                      {latestCommit.author.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-semibold text-white">{latestCommit.author}</span>
                    <span className="text-gray-400 truncate max-w-xs sm:max-w-md">
                      {latestCommit.message}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-400 text-[11px]">
                    <span className="font-mono">{latestCommit.hash}</span>
                    <span>{formatRelativeTime(latestCommit.timestamp)}</span>
                    <span className="hidden sm:inline text-gray-500">
                      {repository.commits.length} {repository.commits.length === 1 ? "commit" : "commits"}
                    </span>
                  </div>
                </div>
              )}

              {/* LISTA DE ARQUIVOS */}
              <div className="divide-y divide-[#21262d] text-xs">
                {fileEntries.map(([filename]) => {
                  const isSelected = selectedFile === filename;
                  return (
                    <button
                      type="button"
                      key={filename}
                      onClick={() => setSelectedFile(filename)}
                      aria-label={`Ver arquivo ${filename}`}
                      aria-pressed={isSelected}
                      className={`flex w-full items-center justify-between p-3 hover:bg-[#1f242c] cursor-pointer transition text-left ${
                        isSelected ? "bg-[#1f242c]/70" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2.5 text-gray-200">
                        <FileText className="w-4 h-4 text-gray-400" />
                        <span className={`hover:text-blue-400 ${isSelected ? "text-blue-400 font-semibold" : ""}`}>
                          {filename}
                        </span>
                      </div>
                      <div className="text-gray-400 text-xs">
                        {filename === "chamada.txt" ? "Lista de chamada da turma" : "Sobre o repositório"}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="hidden sm:inline text-gray-500 text-[11px] font-mono">
                          {(repository.files[filename] || "").split("\n").length} linhas
                        </span>
                        <div className="text-gray-500 text-[11px]">
                          {formatRelativeTime(repository.updatedAt)}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* VISUALIZADOR DE ARQUIVO DEDICADO QUANDO SELECIONADO (EX: chamada.txt) */}
            {selectedFile !== "README.md" && (
              <div className="rounded-xl border border-[#30363d] bg-[#161b22] overflow-hidden mb-6 shadow-xl">
                <div className="flex flex-wrap items-center justify-between px-4 py-3 bg-[#1c2128] border-b border-[#30363d] gap-2">
                  <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-white">
                    <span className="text-gray-400 font-normal">{repository.name} /</span>
                    <FileText className="w-4 h-4 text-blue-400" />
                    <span>{selectedFile}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-950 text-blue-300 border border-blue-800 font-mono">
                      {repository.files[selectedFile]?.split("\n").length || 0} linhas
                    </span>
                    {selectedFile === "chamada.txt" && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 hidden md:inline">
                        Editável no VS Code
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() => handleCopyFile(repository.files[selectedFile] || "")}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-gray-300 transition cursor-pointer active:scale-[0.98]"
                      title="Copiar conteúdo bruto"
                    >
                      {fileCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400 text-[11px]">Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span className="text-[11px]">Copy raw</span>
                        </>
                      )}
                    </button>
                    <span
                      className="px-2.5 py-1 text-gray-500 text-[11px]"
                      title="Raw — não faz parte da simulação (use “Copy raw” para copiar o conteúdo)"
                    >
                      Raw
                    </span>
                    <span
                      className="px-2.5 py-1 text-gray-500 text-[11px]"
                      title="Blame — não faz parte da simulação"
                    >
                      Blame
                    </span>
                  </div>
                </div>

                <div className="bg-[#0d1117] overflow-x-auto">
                  <div className="flex font-mono text-xs sm:text-sm leading-relaxed min-w-max">
                    <div className="select-none text-right pr-3 pl-4 py-4 text-gray-600 border-r border-[#21262d]">
                      {(repository.files[selectedFile] || "").split("\n").map((_, i) => (
                        <div key={i}>{i + 1}</div>
                      ))}
                    </div>
                    <pre className="py-4 pl-4 pr-4 text-gray-200 whitespace-pre-wrap selection:bg-blue-600">
                      {repository.files[selectedFile]}
                    </pre>
                  </div>
                </div>
              </div>
            )}

            {/* SEÇÃO OFICIAL FIXA DO README.md (PADRÃO GITHUB REAL) */}
            <div className="rounded-xl border border-[#30363d] bg-[#161b22] overflow-hidden shadow-xl mb-6">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-[#1c2128] border-b border-[#30363d]">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-white">
                  <BookOpen className="w-4 h-4 text-gray-400" />
                  <span>README.md</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  {repository.files["README.md"] && (
                    <>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#21262d] border border-[#30363d] text-gray-300">
                        {repository.files["README.md"].split("\n").length} linhas
                      </span>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#21262d] border border-[#30363d] text-gray-300">
                        {formatBytes(repository.files["README.md"])}
                      </span>
                    </>
                  )}
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#21262d] border border-[#30363d] text-gray-300">
                    Markdown
                  </span>
                  <div className="flex items-center rounded-md border border-[#30363d] overflow-hidden" role="tablist" aria-label="Visualização do README">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={readmeView === "preview"}
                      onClick={() => setReadmeView("preview")}
                      className={`px-2.5 py-1 text-[11px] font-semibold cursor-pointer transition ${
                        readmeView === "preview" ? "bg-[#21262d] text-white" : "text-gray-400 hover:text-gray-200"
                      }`}
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={readmeView === "raw"}
                      onClick={() => setReadmeView("raw")}
                      className={`px-2.5 py-1 text-[11px] font-semibold cursor-pointer transition ${
                        readmeView === "raw" ? "bg-[#21262d] text-white" : "text-gray-400 hover:text-gray-200"
                      }`}
                    >
                      Raw
                    </button>
                  </div>
                </div>
              </div>

              {readmeView === "preview" ? (
                <div className="p-6 bg-[#0d1117] text-xs sm:text-sm text-gray-300 leading-relaxed selection:bg-blue-600">
                  {repository.files["README.md"]
                    ? renderMarkdown(repository.files["README.md"])
                    : "Repositório sem README"}
                </div>
              ) : (
                <pre className="p-6 bg-[#0d1117] text-xs sm:text-sm text-gray-300 leading-relaxed whitespace-pre-wrap font-mono selection:bg-blue-600">
                  {repository.files["README.md"] ?? "Repositório sem README"}
                </pre>
              )}
            </div>
            </div>

            {/* SIDEBAR "ABOUT" ESTILO GITHUB (só em telas largas) */}
            <aside className="hidden lg:block w-80 shrink-0">
              <h3 className="font-bold text-white text-sm mb-2">About</h3>
              <p className="text-xs text-gray-400 leading-relaxed mb-4">
                {repository.description}
              </p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-[#30363d] bg-[#161b22] py-2">
                  <div className="text-sm font-bold text-white">{repository.commits.length}</div>
                  <div className="text-[10px] text-gray-500">commits</div>
                </div>
                <div className="rounded-lg border border-[#30363d] bg-[#161b22] py-2">
                  <div className="text-sm font-bold text-white">{fileEntries.length}</div>
                  <div className="text-[10px] text-gray-500">arquivos</div>
                </div>
                <div className="rounded-lg border border-[#30363d] bg-[#161b22] py-2">
                  <div className="text-sm font-bold text-white">1</div>
                  <div className="text-[10px] text-gray-500">branch</div>
                </div>
              </div>
              {languageStats.length > 0 && (
                <div className="mt-4">
                  <h4 className="font-bold text-white text-sm mb-2">Languages</h4>
                  <div className="flex h-2 overflow-hidden rounded-full mb-2">
                    {languageStats.map((l) => (
                      <span
                        key={l.label}
                        className={l.color}
                        style={{ width: `${l.pct}%` }}
                        title={`${l.label} ${l.pct.toFixed(1)}%`}
                      />
                    ))}
                  </div>
                  <ul className="space-y-1">
                    {languageStats.map((l) => (
                      <li key={l.label} className="flex items-center gap-2 text-xs text-gray-400">
                        <span className={`w-2.5 h-2.5 rounded-full ${l.color}`} />
                        <span>{l.label}</span>
                        <span className="ml-auto text-gray-500">{l.pct.toFixed(1)}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </aside>
          </div>
        ) : (
          /* ABA DE COMMITS */
          <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-6">
            <div className="flex items-center justify-between mb-4 border-b border-[#30363d] pb-3">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-400" />
                Histórico de Commits ({repository.commits.length})
              </h3>
              <p className="text-xs text-gray-400">
                Atualizado instantaneamente a cada git push
              </p>
            </div>

            <div className="space-y-3">
              {repository.commits.map((commit, idx) => (
                <div
                  key={commit.id || idx}
                  className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-lg bg-[#0d1117] border border-[#21262d] hover:border-[#388bfd]/50 transition"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 flex items-center justify-center font-bold text-xs mt-0.5">
                      {commit.author.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-semibold text-white text-sm">
                        {commit.message}
                      </div>
                      <div className="text-xs text-gray-400 flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-blue-400 font-medium">{commit.author}</span>
                        <span>•</span>
                        <span className="text-purple-400">{commit.authorTurma}</span>
                        <span>•</span>
                        <span>{formatRelativeTime(commit.timestamp)}</span>
                        {commit.filesChanged && commit.filesChanged.length > 0 && (
                          <>
                            <span>•</span>
                            <span>
                              {commit.filesChanged.length}{" "}
                              {commit.filesChanged.length === 1 ? "arquivo alterado" : "arquivos alterados"}
                            </span>
                          </>
                        )}
                      </div>
                      {commit.filesChanged && commit.filesChanged.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {commit.filesChanged.map((f) => (
                            <span
                              key={f}
                              className="px-1.5 py-0.5 rounded bg-[#21262d] border border-[#30363d] font-mono text-[10px] text-gray-300"
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded bg-[#161b22] border border-[#30363d] font-mono text-xs text-blue-400 font-semibold">
                      {commit.hash}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyHash(commit.hash)}
                      aria-label={`Copiar hash ${commit.hash}`}
                      title="Copiar hash do commit"
                      className="p-1.5 rounded bg-[#161b22] hover:bg-[#30363d] border border-[#30363d] text-gray-300 transition cursor-pointer"
                    >
                      {copiedHash === commit.hash ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
