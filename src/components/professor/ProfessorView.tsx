"use client";

import React, { useState } from "react";
import { Student, CommandLog, Repository } from "@/lib/types";
import {
  Users,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Terminal,
  ShieldCheck,
  Search,
  RotateCcw,
  Clock,
  Award,
  ChevronRight,
  Printer,
  X,
  Code2,
  FolderGit2,
} from "lucide-react";

interface Props {
  students: Student[];
  logs: CommandLog[];
  repository: Repository;
  onResetClass: () => void;
  onUpdateRepo: (repo: Repository) => void;
}

export const ProfessorView: React.FC<Props> = ({
  students,
  logs,
  repository,
  onResetClass,
  onUpdateRepo,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStudentForLogs, setSelectedStudentForLogs] = useState<Student | null>(null);
  const [filterTurma, setFilterTurma] = useState<string>("todas");

  // Métricas agregadas
  const totalStudents = students.length;
  const clonedCount = students.filter((s) => s.hasCloned).length;
  const editedCount = students.filter((s) => s.hasEdited).length;
  const committedCount = students.filter((s) => s.hasCommitted).length;
  const pushedCount = students.filter((s) => s.hasPushed).length;
  const averageScore =
    totalStudents > 0
      ? Math.round(students.reduce((acc, s) => acc + s.score, 0) / totalStudents)
      : 0;

  // Lista de turmas disponíveis para filtro
  const turmas = Array.from(new Set(students.map((s) => s.turma)));

  // Alunos filtrados por busca e turma
  const filteredStudents = students.filter((student) => {
    const matchesSearch =
      student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.turma.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTurma = filterTurma === "todas" || student.turma === filterTurma;
    return matchesSearch && matchesTurma;
  });

  // Logs do aluno selecionado
  const studentLogs = selectedStudentForLogs
    ? logs.filter((l) => l.studentId === selectedStudentForLogs.id)
    : [];

  // Exportar dados para CSV
  const handleExportCSV = () => {
    if (students.length === 0) {
      alert("Nenhum aluno registrado para exportar.");
      return;
    }

    const headers = "Nome,Turma,Nota,Clonou,Editou,Commitou,DeuPush,TotalComandos,ComandosComErro,UltimaAtividade\n";
    const rows = students
      .map(
        (s) =>
          `"${s.name}","${s.turma}",${s.score},${s.hasCloned ? "SIM" : "NÃO"},${
            s.hasEdited ? "SIM" : "NÃO"
          },${s.hasCommitted ? "SIM" : "NÃO"},${s.hasPushed ? "SIM" : "NÃO"},${s.totalCommands},${
            s.errorCommands
          },"${new Date(s.lastActive).toLocaleString("pt-BR")}"`
      )
      .join("\n");

    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `relatorio_gitedu_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#0d1117] text-[#c9d1d9] p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* CABEÇALHO DO PAINEL DO PROFESSOR */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-[#161b22] border border-[#30363d] p-6 rounded-2xl shadow-xl">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h1 className="text-xl font-bold text-white">Painel de Avaliação do Professor</h1>
            </div>
            <p className="text-xs sm:text-sm text-gray-400">
              Acompanhamento em tempo real, verificação de comandos no terminal e relatório de desempenho.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[11px] font-medium text-emerald-400">
                Sincronização Ativa em Tempo Real (Atualiza a cada 4s)
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-xs font-semibold text-gray-200 transition cursor-pointer"
            >
              <Printer className="w-4 h-4 text-gray-300" />
              Imprimir Relatório
            </button>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold shadow transition cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Exportar CSV
            </button>
            <button
              onClick={onResetClass}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-950/60 hover:bg-red-900 border border-red-800 text-red-200 text-xs font-semibold transition cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Resetar Turma
            </button>
          </div>
        </div>

        {/* INFORMAÇÕES DO REPOSITÓRIO ATIVO */}
        <div className="bg-[#161b22] border border-[#30363d] p-5 rounded-2xl flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-orange-600/20 text-orange-400 border border-orange-500/30">
              <FolderGit2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Repositório Ativo da Aula:</span>
                <span className="font-mono text-sm font-bold text-white">
                  {repository.owner} / {repository.name}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                URL de Clone para os alunos:{" "}
                <span className="font-mono text-blue-400">{repository.cloneUrl}</span>
              </p>
            </div>
          </div>
          <div className="text-xs px-3 py-1.5 rounded-lg bg-[#21262d] border border-[#30363d] text-gray-300 flex items-center gap-2">
            <Code2 className="w-4 h-4 text-emerald-400" />
            <span>Commits Recebidos: <strong>{repository.commits.length}</strong></span>
          </div>
        </div>

        {/* CARDS DE MÉTRICAS */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <div className="bg-[#161b22] border border-[#30363d] p-4 rounded-xl">
            <div className="text-xs text-gray-400 flex items-center justify-between mb-1">
              <span>Alunos Conectados</span>
              <Users className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-bold text-white">{totalStudents}</div>
            <div className="text-[11px] text-gray-500 mt-1">Participantes da sessão</div>
          </div>

          <div className="bg-[#161b22] border border-[#30363d] p-4 rounded-xl">
            <div className="text-xs text-gray-400 flex items-center justify-between mb-1">
              <span>1. Clonaram Repo</span>
              <span className="text-emerald-400 font-mono text-xs">git clone</span>
            </div>
            <div className="text-2xl font-bold text-emerald-400">{clonedCount}</div>
            <div className="text-[11px] text-gray-400 mt-1">
              {totalStudents > 0 ? Math.round((clonedCount / totalStudents) * 100) : 0}% da turma
            </div>
          </div>

          <div className="bg-[#161b22] border border-[#30363d] p-4 rounded-xl">
            <div className="text-xs text-gray-400 flex items-center justify-between mb-1">
              <span>2. Editaram Chamada</span>
              <span className="text-blue-400 font-mono text-xs">chamada.txt</span>
            </div>
            <div className="text-2xl font-bold text-blue-400">{editedCount}</div>
            <div className="text-[11px] text-gray-400 mt-1">
              {totalStudents > 0 ? Math.round((editedCount / totalStudents) * 100) : 0}% da turma
            </div>
          </div>

          <div className="bg-[#161b22] border border-[#30363d] p-4 rounded-xl">
            <div className="text-xs text-gray-400 flex items-center justify-between mb-1">
              <span>3. Fizeram Commit</span>
              <span className="text-purple-400 font-mono text-xs">git commit</span>
            </div>
            <div className="text-2xl font-bold text-purple-400">{committedCount}</div>
            <div className="text-[11px] text-gray-400 mt-1">
              {totalStudents > 0 ? Math.round((committedCount / totalStudents) * 100) : 0}% da turma
            </div>
          </div>

          <div className="bg-[#161b22] border border-[#30363d] p-4 rounded-xl">
            <div className="text-xs text-gray-400 flex items-center justify-between mb-1">
              <span>4. Push Enviado (100%)</span>
              <span className="text-yellow-400 font-mono text-xs">git push</span>
            </div>
            <div className="text-2xl font-bold text-yellow-400">{pushedCount}</div>
            <div className="text-[11px] text-gray-400 mt-1">
              {totalStudents > 0 ? Math.round((pushedCount / totalStudents) * 100) : 0}% concluídos
            </div>
          </div>
        </div>

        {/* TABELA DE ALUNOS COM BARRA DE FILTRO E BUSCA */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 bg-[#1c2128] border-b border-[#30363d] flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-bold text-white">
                Desempenho Individual dos Estudantes ({filteredStudents.length})
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* FILTRO POR TURMA */}
              {turmas.length > 0 && (
                <select
                  value={filterTurma}
                  onChange={(e) => setFilterTurma(e.target.value)}
                  className="bg-[#0d1117] border border-[#30363d] text-xs text-gray-300 rounded-lg px-2.5 py-1.5 outline-none"
                >
                  <option value="todas">Todas as Turmas</option>
                  {turmas.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              )}

              {/* CAMPO DE BUSCA */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Buscar aluno ou turma..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-[#0d1117] border border-[#30363d] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-gray-500 outline-none focus:border-blue-500 w-48 sm:w-64"
                />
              </div>
            </div>
          </div>

          {filteredStudents.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">Nenhum estudante registrado ainda.</p>
              <p className="text-xs text-gray-500 mt-1">
                Quando os alunos entrarem e digitarem o nome completo e turma, eles aparecerão aqui automaticamente.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#12161d] text-gray-400 uppercase font-semibold text-[11px] border-b border-[#30363d]">
                  <tr>
                    <th className="py-3 px-4">Estudante</th>
                    <th className="py-3 px-3">Turma</th>
                    <th className="py-3 px-3 text-center">Progresso (4 Etapas)</th>
                    <th className="py-3 px-3 text-center">Nota</th>
                    <th className="py-3 px-3 text-center">Comandos (Erros)</th>
                    <th className="py-3 px-3">Última Atividade</th>
                    <th className="py-3 px-4 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#21262d]">
                  {filteredStudents.map((st) => (
                    <tr key={st.id} className="hover:bg-[#1f242c] transition">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-blue-600/20 border border-blue-500/30 text-blue-400 flex items-center justify-center font-bold text-xs">
                            {st.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-white">{st.name}</div>
                            <div className="text-[10px] text-gray-500">ID: {st.id.slice(-6)}</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-3 text-gray-300 font-medium">{st.turma}</td>

                      {/* 4 ETAPAS COM BADGES */}
                      <td className="py-3.5 px-3">
                        <div className="flex items-center justify-center gap-1 font-mono text-[10px]">
                          <span
                            title="1. git clone"
                            className={`px-1.5 py-0.5 rounded ${
                              st.hasCloned
                                ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                                : "bg-gray-800/60 text-gray-500"
                            }`}
                          >
                            Clone
                          </span>
                          <span
                            title="2. Edição de chamada.txt"
                            className={`px-1.5 py-0.5 rounded ${
                              st.hasEdited
                                ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                                : "bg-gray-800/60 text-gray-500"
                            }`}
                          >
                            Edit
                          </span>
                          <span
                            title="3. git commit"
                            className={`px-1.5 py-0.5 rounded ${
                              st.hasCommitted
                                ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                                : "bg-gray-800/60 text-gray-500"
                            }`}
                          >
                            Commit
                          </span>
                          <span
                            title="4. git push"
                            className={`px-1.5 py-0.5 rounded ${
                              st.hasPushed
                                ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                                : "bg-gray-800/60 text-gray-500"
                            }`}
                          >
                            Push
                          </span>
                        </div>
                      </td>

                      {/* NOTA */}
                      <td className="py-3.5 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            st.score === 100
                              ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                              : st.score >= 50
                              ? "bg-amber-950 text-amber-300 border border-amber-800"
                              : "bg-gray-800 text-gray-400"
                          }`}
                        >
                          {st.score} / 100
                        </span>
                      </td>

                      {/* TOTAL DE COMANDOS E TAXA DE ERROS */}
                      <td className="py-3.5 px-3 text-center">
                        <span className="font-semibold text-white">{st.totalCommands}</span>
                        {st.errorCommands > 0 ? (
                          <span className="text-red-400 ml-1.5 text-[11px]">
                            ({st.errorCommands} erros)
                          </span>
                        ) : (
                          <span className="text-emerald-400 ml-1.5 text-[11px]">
                            (0 erros)
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-3 text-gray-400 text-[11px]">
                        {new Date(st.lastActive).toLocaleTimeString("pt-BR")}
                      </td>

                      {/* BOTÃO VER LOGS DO ALUNO */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => setSelectedStudentForLogs(st)}
                          className="flex items-center gap-1.5 ml-auto px-2.5 py-1 rounded-md bg-[#21262d] hover:bg-blue-600 hover:text-white border border-[#30363d] text-blue-400 font-semibold transition cursor-pointer"
                        >
                          <Terminal className="w-3.5 h-3.5" />
                          <span>Ver Logs</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* MODAL INSPETOR DE LOGS DE COMANDOS DO ALUNO */}
      {selectedStudentForLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-3xl max-h-[85vh] rounded-2xl bg-[#161b22] border border-[#30363d] shadow-2xl flex flex-col text-white overflow-hidden">
            {/* CABEÇALHO DO MODAL */}
            <div className="p-4 bg-[#1c2128] border-b border-[#30363d] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
                  <Terminal className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">
                    Histórico de Terminal: {selectedStudentForLogs.name}
                  </h3>
                  <p className="text-xs text-gray-400">
                    Turma: {selectedStudentForLogs.turma} • Total de Comandos:{" "}
                    {studentLogs.length} • Erros: {selectedStudentForLogs.errorCommands}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedStudentForLogs(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#30363d] transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* LISTA DE COMANDOS EXECUTADOS PELO ALUNO */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs">
              {studentLogs.length === 0 ? (
                <div className="text-center py-12 text-gray-500 font-sans">
                  Nenhum comando registrado para este estudante ainda.
                </div>
              ) : (
                studentLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`p-3 rounded-xl border ${
                      log.isError
                        ? "bg-red-950/20 border-red-800/40 text-red-200"
                        : "bg-[#0d1117] border-[#21262d] text-gray-200"
                    }`}
                  >
                    {/* LINHA DO COMANDO E TIMESTAMP */}
                    <div className="flex items-center justify-between border-b border-[#21262d] pb-1.5 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-400 font-bold">$</span>
                        <span className="font-bold text-white text-sm">{log.command}</span>
                        {log.isError ? (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-red-900/60 text-red-300 border border-red-700">
                            ERRO
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                            SUCESSO
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-500 font-sans">
                        {new Date(log.timestamp).toLocaleTimeString("pt-BR")}
                      </span>
                    </div>

                    {/* SAÍDA RETORNADA AO ALUNO */}
                    {log.output && (
                      <pre className="text-xs whitespace-pre-wrap text-gray-300 mt-1 leading-relaxed">
                        {log.output}
                      </pre>
                    )}

                    {/* DICA PEDAGÓGICA QUE O SISTEMA FORNECEU AO ALUNO */}
                    {log.tip && (
                      <div className="mt-2 p-2 bg-amber-950/40 border border-amber-600/30 text-amber-200 text-[11px] rounded font-sans">
                        <span className="font-semibold">Dica exibida ao aluno:</span> {log.tip}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* RODAPÉ DO MODAL */}
            <div className="p-3 bg-[#1c2128] border-t border-[#30363d] flex justify-end">
              <button
                onClick={() => setSelectedStudentForLogs(null)}
                className="px-4 py-1.5 rounded-lg bg-[#30363d] hover:bg-[#3f4752] text-white text-xs font-semibold transition cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
