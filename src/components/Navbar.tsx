"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Student } from "@/lib/types";
import {
  GitBranch,
  Terminal,
  ShieldCheck,
  User,
  CheckCircle2,
  Circle,
  HelpCircle,
  RotateCcw,
} from "lucide-react";

interface NavbarProps {
  currentStudent: Student | null;
  onOpenIdentification: () => void;
  onResetData?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentStudent,
  onOpenIdentification,
  onResetData,
}) => {
  const pathname = usePathname();

  const navLinks = [
    {
      href: "/github",
      label: "GitHub Simulado",
      icon: GitBranch,
      desc: "Repositório & Chamada",
    },
    {
      href: "/vscode",
      label: "VS Code & Terminal",
      icon: Terminal,
      desc: "Editor & Comandos Git",
    },
    {
      href: "/professor",
      label: "Painel do Professor",
      icon: ShieldCheck,
      desc: "Métricas & Logs de Comandos",
    },
  ];

  return (
    <header className="sticky top-0 z-40 w-full bg-[#161b22] border-b border-[#30363d] text-white">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        {/* LOGO & TITULO */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-orange-600 via-rose-500 to-amber-400 flex items-center justify-center text-white shadow-md shadow-orange-500/20 group-hover:scale-105 transition">
              <GitBranch className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 font-bold text-base leading-tight tracking-tight">
                <span>GitEdu</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-mono border border-blue-500/30">
                  Simulador
                </span>
              </div>
              <p className="text-[11px] text-gray-400 hidden sm:block">
                Ambiente de Aprendizagem Prática
              </p>
            </div>
          </Link>
        </div>

        {/* NAVEGAÇÃO PRINCIPAL (TABS) */}
        <nav className="flex items-center bg-[#0d1117] p-1 rounded-xl border border-[#30363d]">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href || (pathname === "/" && link.href === "/github");

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-all ${
                  isActive
                    ? "bg-[#21262d] text-white shadow-sm border border-[#388bfd]/40"
                    : "text-gray-400 hover:text-gray-200 hover:bg-[#161b22]"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-blue-400" : "text-gray-400"}`} />
                <span className="hidden sm:inline">{link.label}</span>
                <span className="sm:hidden">{link.label.split(" ")[0]}</span>
              </Link>
            );
          })}
        </nav>

        {/* STATUS DO ALUNO & METAS */}
        <div className="flex items-center gap-3">
          {currentStudent ? (
            <div className="flex items-center gap-3 bg-[#0d1117] border border-[#30363d] px-3 py-1.5 rounded-xl">
              <div className="hidden lg:flex items-center gap-2 text-xs border-r border-[#30363d] pr-3">
                <span className="text-gray-400">Progresso:</span>
                <div className="flex items-center gap-1.5 font-mono text-[11px]">
                  <span
                    title="Etapa 1: git clone"
                    className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded ${
                      currentStudent.hasCloned
                        ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                        : "bg-gray-800 text-gray-400"
                    }`}
                  >
                    {currentStudent.hasCloned ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : (
                      <Circle className="w-3 h-3" />
                    )}
                    Clone
                  </span>
                  <span
                    title="Etapa 2: Editar chamada.txt"
                    className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded ${
                      currentStudent.hasEdited
                        ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                        : "bg-gray-800 text-gray-400"
                    }`}
                  >
                    {currentStudent.hasEdited ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : (
                      <Circle className="w-3 h-3" />
                    )}
                    Edição
                  </span>
                  <span
                    title="Etapa 3: git commit"
                    className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded ${
                      currentStudent.hasCommitted
                        ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                        : "bg-gray-800 text-gray-400"
                    }`}
                  >
                    {currentStudent.hasCommitted ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : (
                      <Circle className="w-3 h-3" />
                    )}
                    Commit
                  </span>
                  <span
                    title="Etapa 4: git push"
                    className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded ${
                      currentStudent.hasPushed
                        ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                        : "bg-gray-800 text-gray-400"
                    }`}
                  >
                    {currentStudent.hasPushed ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : (
                      <Circle className="w-3 h-3" />
                    )}
                    Push
                  </span>
                </div>
              </div>

              <button
                onClick={onOpenIdentification}
                className="flex items-center gap-2 text-left hover:opacity-80 transition cursor-pointer"
                title="Clique para trocar de aluno"
              >
                <div className="w-7 h-7 rounded-full bg-blue-600/30 border border-blue-500/40 text-blue-300 flex items-center justify-center font-bold text-xs">
                  {currentStudent.name.charAt(0).toUpperCase()}
                </div>
                <div className="text-xs leading-none">
                  <div className="font-semibold text-gray-200 max-w-[110px] truncate">
                    {currentStudent.name}
                  </div>
                  <div className="text-[10px] text-gray-400 max-w-[110px] truncate">
                    {currentStudent.turma}
                  </div>
                </div>
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenIdentification}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow transition cursor-pointer"
            >
              <User className="w-3.5 h-3.5" />
              Identificar Aluno
            </button>
          )}

          {onResetData && (
            <button
              onClick={onResetData}
              title="Resetar dados para estado inicial"
              className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-950/30 rounded-lg border border-transparent hover:border-red-900/50 transition cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
