"use client";

import React from "react";
import Link from "next/link";
import { useGitSim } from "@/context/GitSimContext";
import {
  GitBranch,
  Terminal,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Code2,
  FolderGit2,
  BookOpen,
  Sparkles,
  Laptop,
  Check,
} from "lucide-react";

export default function HomePage() {
  const { currentStudent, openIdModal, repository } = useGitSim();

  const steps = [
    {
      num: "01",
      title: "Copiar o Link no GitHub",
      desc: "Acesse a aba do GitHub simulado, clique no botão verde '<> Code' e copie a URL do repositório da turma.",
      command: `https://gitsim.edu/${repository.owner}/${repository.name}.git`,
      link: "/github",
      buttonText: "Ver Repositório",
      done: currentStudent?.hasCloned,
    },
    {
      num: "02",
      title: "Clonar no Terminal do VS Code",
      desc: "Abra a aba do VS Code e execute o comando de clone no terminal integrado.",
      command: `git clone ${repository.cloneUrl}`,
      link: "/vscode",
      buttonText: "Abrir Terminal",
      done: currentStudent?.hasCloned,
    },
    {
      num: "03",
      title: "Adicionar seu Nome na Chamada",
      desc: "Entre na pasta com 'cd chamada-turma-a', abra o arquivo 'chamada.txt' no editor à esquerda, insira seu nome completo e salve.",
      command: `cd ${repository.name}`,
      link: "/vscode",
      buttonText: "Abrir Editor",
      done: currentStudent?.hasEdited,
    },
    {
      num: "04",
      title: "Commit & Push para o GitHub",
      desc: "Prepare o arquivo com 'git add .', registre seu commit e envie para o GitHub com 'git push origin main' (execute passo a passo ou encadeados com '&&').",
      command: `git add . && git commit -m "Presente: Seu Nome" && git push`,
      link: "/vscode",
      buttonText: "Finalizar Tarefa",
      done: currentStudent?.hasPushed,
    },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#0d1117] text-[#c9d1d9] pb-20">
      {/* HERO BANNER */}
      <div className="relative overflow-hidden bg-gradient-to-b from-[#161b22] to-[#0d1117] border-b border-[#30363d] pt-12 pb-16 px-4">
        <div className="max-w-5xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            Simulador Educacional de Git, GitHub e VS Code
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight leading-tight">
            Aprenda Git & GitHub na Prática <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-blue-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent">
              sem complicação e 100% no navegador
            </span>
          </h1>

          <p className="max-w-2xl mx-auto text-sm sm:text-base text-gray-400 leading-relaxed">
            Ambiente interativo com a interface autêntica do GitHub, o editor VS Code com terminal
            integrado e dicas didáticas inteligentes. Suas ações e comandos são avaliados pelo professor em tempo real.
          </p>

          <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
            {!currentStudent ? (
              <button
                onClick={openIdModal}
                className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-xl shadow-blue-600/30 flex items-center gap-2 transition cursor-pointer"
              >
                Começar Identificando Meu Nome
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  href="/github"
                  className="px-5 py-2.5 rounded-xl bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-white font-semibold text-sm flex items-center gap-2 transition"
                >
                  <FolderGit2 className="w-4 h-4 text-blue-400" />
                  Ir para o GitHub
                </Link>
                <Link
                  href="/vscode"
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm shadow-lg shadow-blue-600/30 flex items-center gap-2 transition"
                >
                  <Terminal className="w-4 h-4" />
                  Abrir VS Code & Terminal
                </Link>
              </div>
            )}

            <Link
              href="/professor"
              className="px-5 py-2.5 rounded-xl bg-[#161b22] hover:bg-[#21262d] border border-[#30363d] text-gray-300 font-semibold text-sm flex items-center gap-2 transition"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Painel do Professor
            </Link>
          </div>
        </div>
      </div>

      {/* GUIA PASSO A PASSO DA ATIVIDADE */}
      <div className="max-w-6xl mx-auto px-4 mt-12">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold text-white mb-2">
            Roteiro da Aula Prática: Lista de Presença
          </h2>
          <p className="text-xs sm:text-sm text-gray-400">
            Siga as 4 etapas abaixo para completar a tarefa e receber nota máxima na avaliação do professor:
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {steps.map((st) => (
            <div
              key={st.num}
              className={`rounded-2xl p-6 border transition relative ${
                st.done
                  ? "bg-[#161b22] border-emerald-500/50 shadow-lg shadow-emerald-950/30"
                  : "bg-[#161b22] border-[#30363d] hover:border-[#484f58]"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <span className="font-mono text-2xl font-black text-blue-500/40">
                  {st.num}
                </span>
                {st.done ? (
                  <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 font-semibold">
                    <Check className="w-3.5 h-3.5" />
                    Concluído
                  </span>
                ) : (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-[#21262d] text-gray-400 border border-[#30363d]">
                    Pendente
                  </span>
                )}
              </div>

              <h3 className="text-base font-bold text-white mb-1.5">{st.title}</h3>
              <p className="text-xs text-gray-400 leading-relaxed mb-4">{st.desc}</p>

              <div className="p-2.5 bg-[#0d1117] rounded-lg border border-[#30363d] mb-4">
                <div className="text-[10px] text-gray-500 uppercase font-mono mb-1">
                  Comando de Exemplo:
                </div>
                <code className="text-xs font-mono text-emerald-400 break-all select-all">
                  {st.command}
                </code>
              </div>

              <Link
                href={st.link}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300 transition"
              >
                <span>{st.buttonText}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
