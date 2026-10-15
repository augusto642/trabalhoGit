"use client";

import React, { useState } from "react";
import { Repository } from "@/lib/types";
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
  Users,
  ChevronDown,
  CircleDot,
  GitPullRequest,
} from "lucide-react";

interface Props {
  repository: Repository;
}

export const GitHubView: React.FC<Props> = ({ repository }) => {
  const [activeTab, setActiveTab] = useState<"code" | "commits">("code");
  const [selectedFile, setSelectedFile] = useState<string>("chamada.txt");
  const [showCloneDropdown, setShowCloneDropdown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fileCopied, setFileCopied] = useState(false);

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

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#0d1117] text-[#c9d1d9] pb-16">
      {/* CABEÇALHO DO REPOSITÓRIO ESTILO GITHUB */}
      <div className="bg-[#161b22] border-b border-[#30363d] pt-6 pb-0">
        <div className="max-w-7xl mx-auto px-4">
          {/* TOPO: NOME DO REPO & STATS */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2 text-lg">
              <FolderGit2 className="w-5 h-5 text-gray-400" />
              <span className="text-blue-400 hover:underline cursor-pointer">
                {repository.owner}
              </span>
              <span className="text-gray-500">/</span>
              <span className="font-bold text-white hover:underline cursor-pointer">
                {repository.name}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full border border-[#30363d] text-gray-400 font-medium">
                Public
              </span>
            </div>

            {/* BOTÕES ESTILO GITHUB (WATCH, FORK, STAR) */}
            <div className="flex items-center gap-2 text-xs font-semibold">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#21262d] border border-[#30363d] text-gray-300 hover:bg-[#30363d] transition">
                <Eye className="w-3.5 h-3.5" />
                Watch
                <span className="px-1.5 py-0.2 bg-[#30363d] rounded-full text-[10px]">12</span>
              </button>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#21262d] border border-[#30363d] text-gray-300 hover:bg-[#30363d] transition">
                <GitFork className="w-3.5 h-3.5" />
                Fork
                <span className="px-1.5 py-0.2 bg-[#30363d] rounded-full text-[10px]">4</span>
              </button>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#21262d] border border-[#30363d] text-gray-300 hover:bg-[#30363d] transition">
                <Star className="w-3.5 h-3.5 text-yellow-400" />
                Star
                <span className="px-1.5 py-0.2 bg-[#30363d] rounded-full text-[10px]">28</span>
              </button>
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

            <button
              type="button"
              className="flex items-center gap-1.5 pb-3 px-2 text-sm font-medium border-b-2 border-transparent text-gray-400 hover:text-gray-200 cursor-pointer shrink-0"
              title="Issues (Simulação focada no fluxo Git CLI)"
            >
              <CircleDot className="w-4 h-4" />
              Issues
              <span className="px-1.5 py-0.2 bg-[#30363d] rounded-full text-[10px] text-gray-300">0</span>
            </button>

            <button
              type="button"
              className="flex items-center gap-1.5 pb-3 px-2 text-sm font-medium border-b-2 border-transparent text-gray-400 hover:text-gray-200 cursor-pointer shrink-0"
              title="Pull requests (Simulação focada no fluxo Git CLI)"
            >
              <GitPullRequest className="w-4 h-4" />
              Pull requests
              <span className="px-1.5 py-0.2 bg-[#30363d] rounded-full text-[10px] text-gray-300">0</span>
            </button>

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
          <div>
            {/* BARRA DE AÇÕES (BRANCH & BOTÃO VERDE CLONAR) */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-sm text-gray-200 font-medium transition cursor-pointer active:scale-[0.98]"
                >
                  <GitBranch className="w-4 h-4 text-gray-400" />
                  <span>{repository.defaultBranch}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400 ml-0.5" />
                </button>
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
                        <span className="text-sm font-bold text-white">Clone via HTTPS</span>
                      </div>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                        Pronto para copiar
                      </span>
                    </div>

                    <p className="text-xs text-gray-300 mb-2">
                      Use esta URL no terminal do VS Code com o comando git clone:
                    </p>

                    <div className="flex items-center bg-[#0d1117] border border-[#30363d] rounded-lg p-1.5 mb-3">
                      <input
                        type="text"
                        readOnly
                        value={repository.cloneUrl}
                        className="bg-transparent text-xs text-gray-200 px-2 py-1 w-full focus:outline-none font-mono selection:bg-blue-600"
                      />
                      <button
                        onClick={handleCopyClone}
                        className="p-1.5 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded-md text-gray-200 transition cursor-pointer flex items-center gap-1 text-xs shrink-0"
                        title="Copiar URL"
                      >
                        {copied ? (
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
                      <code className="block bg-[#161b22] p-1.5 rounded text-emerald-400 font-mono text-xs">
                        git clone {repository.cloneUrl}
                      </code>
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
                  <div className="flex items-center gap-3 text-gray-400 font-mono text-[11px]">
                    <span className="hover:text-blue-400 cursor-pointer">
                      {latestCommit.hash}
                    </span>
                    <span>{new Date(latestCommit.timestamp).toLocaleTimeString("pt-BR")}</span>
                  </div>
                </div>
              )}

              {/* LISTA DE ARQUIVOS */}
              <div className="divide-y divide-[#21262d] text-xs">
                {fileEntries.map(([filename]) => {
                  const isSelected = selectedFile === filename;
                  return (
                    <div
                      key={filename}
                      onClick={() => setSelectedFile(filename)}
                      className={`flex items-center justify-between p-3 hover:bg-[#1f242c] cursor-pointer transition ${
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
                        {filename === "chamada.txt" ? "Lista de chamada da turma" : "Instruções do exercício"}
                      </div>
                      <div className="text-gray-500 text-[11px]">
                        {new Date(repository.updatedAt).toLocaleTimeString("pt-BR")}
                      </div>
                    </div>
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
                    <button
                      type="button"
                      className="px-2.5 py-1 rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-gray-300 text-[11px] transition cursor-pointer active:scale-[0.98]"
                    >
                      Raw
                    </button>
                    <button
                      type="button"
                      className="px-2.5 py-1 rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-gray-300 text-[11px] transition cursor-pointer active:scale-[0.98]"
                    >
                      Blame
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-[#0d1117] overflow-x-auto">
                  <pre className="font-mono text-xs sm:text-sm text-gray-200 leading-relaxed whitespace-pre-wrap selection:bg-blue-600">
                    {repository.files[selectedFile]}
                  </pre>
                </div>
              </div>
            )}

            {/* SEÇÃO OFICIAL FIXA DO README.md (PADRÃO GITHUB REAL) */}
            <div className="rounded-xl border border-[#30363d] bg-[#161b22] overflow-hidden shadow-xl mb-6">
              <div className="flex items-center justify-between px-4 py-2.5 bg-[#1c2128] border-b border-[#30363d]">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-white">
                  <BookOpen className="w-4 h-4 text-gray-400" />
                  <span>README.md</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#21262d] border border-[#30363d] text-gray-300">
                    Markdown
                  </span>
                </div>
              </div>

              <div className="p-6 bg-[#0d1117]">
                <pre className="font-sans text-xs sm:text-sm text-gray-300 leading-relaxed whitespace-pre-wrap bg-transparent border-0 p-0 selection:bg-blue-600">
                  {repository.files["README.md"] || "Repositório sem README"}
                </pre>
              </div>
            </div>
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
                      <div className="text-xs text-gray-400 flex items-center gap-2 mt-0.5">
                        <span className="text-blue-400 font-medium">{commit.author}</span>
                        <span>•</span>
                        <span className="text-purple-400">{commit.authorTurma}</span>
                        <span>•</span>
                        <span>{new Date(commit.timestamp).toLocaleString("pt-BR")}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded bg-[#161b22] border border-[#30363d] font-mono text-xs text-blue-400 font-semibold">
                      {commit.hash}
                    </span>
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
