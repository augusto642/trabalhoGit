"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import confetti from "canvas-confetti";
import { Student } from "@/lib/types";
import {
  Trophy,
  Sparkles,
  CheckCircle2,
  FolderGit2,
  ShieldCheck,
  ArrowRight,
  X,
  Star,
  Check,
} from "lucide-react";

interface Props {
  student: Student;
  isOpen: boolean;
  onClose: () => void;
}

export const TaskCompletionModal: React.FC<Props> = ({
  student,
  isOpen,
  onClose,
}) => {
  useEffect(() => {
    if (isOpen) {
      // Disparo comemorativo de confetes em duas rajadas
      confetti({
        particleCount: 100,
        spread: 80,
        origin: { y: 0.5, x: 0.3 },
      });
      setTimeout(() => {
        confetti({
          particleCount: 100,
          spread: 80,
          origin: { y: 0.5, x: 0.7 },
        });
      }, 250);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl bg-[#161b22] border border-[#30363d] shadow-[0_0_50px_-10px_rgba(59,130,246,0.3)] overflow-hidden transition-all transform scale-100 p-6 sm:p-8 text-center text-[#c9d1d9]">
        {/* BOTÃO FECHAR */}
        <button
          onClick={onClose}
          type="button"
          className="absolute top-4 right-4 p-2 rounded-lg text-gray-400 hover:text-white hover:bg-[#21262d] transition cursor-pointer"
          title="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        {/* EFEITO DE TROFÉU ILUMINADO */}
        <div className="relative mx-auto mb-4 w-20 h-20 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-yellow-500/30 to-amber-400/10 blur-xl animate-pulse" />
          <div className="relative w-16 h-16 rounded-full bg-gradient-to-b from-amber-400 to-yellow-600 p-0.5 shadow-lg shadow-yellow-500/20">
            <div className="w-full h-full rounded-full bg-[#161b22] flex items-center justify-center text-yellow-400">
              <Trophy className="w-8 h-8 animate-bounce duration-1000" />
            </div>
          </div>
          <Sparkles className="w-5 h-5 text-yellow-300 absolute -top-1 -right-1 animate-spin duration-3000" />
          <Star className="w-4 h-4 text-amber-400 absolute bottom-1 -left-1 fill-amber-400" />
        </div>

        {/* CABEÇALHO COMEMORATIVO */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold mb-2">
          <Check className="w-3.5 h-3.5" />
          Missão Prática Concluída!
        </div>

        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Parabéns, {student.name}! 🎉
        </h2>

        <p className="text-xs sm:text-sm text-gray-400 mt-2 max-w-sm mx-auto leading-relaxed">
          Você completou com sucesso todos os passos da aula prática e sua presença já está registrada no repositório oficial da turma!
        </p>

        {/* CARD DE PONTUAÇÃO & NOTA MÁXIMA */}
        <div className="my-5 p-4 rounded-xl bg-gradient-to-r from-blue-950/40 via-[#1c2128] to-emerald-950/40 border border-[#30363d] flex items-center justify-between">
          <div className="text-left">
            <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 block">
              Desempenho da Atividade
            </span>
            <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1 mt-0.5">
              <Sparkles className="w-3.5 h-3.5" /> Nota Máxima Atingida
            </span>
          </div>

          <div className="text-right">
            <span className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">
              100
            </span>
            <span className="text-xs text-gray-400 font-bold"> / 100 pts</span>
          </div>
        </div>

        {/* CHECKLIST DAS 4 CONQUISTAS */}
        <div className="space-y-2 text-left text-xs mb-6 bg-[#0d1117] p-3.5 rounded-xl border border-[#21262d]">
          <div className="flex items-center gap-2 text-gray-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Repositório clonado com sucesso no terminal</span>
          </div>
          <div className="flex items-center gap-2 text-gray-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Nome completo assinado em <code className="text-amber-300 font-mono">chamada.txt</code></span>
          </div>
          <div className="flex items-center gap-2 text-gray-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Snapshot local gravado com mensagem semântica</span>
          </div>
          <div className="flex items-center gap-2 text-gray-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Commits enviados e sincronizados na nuvem (GitHub)</span>
          </div>
        </div>

        {/* BOTÕES DE AÇÃO */}
        <div className="space-y-2.5">
          <Link
            href="/github"
            onClick={onClose}
            className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 transition cursor-pointer active:scale-[0.98]"
          >
            <FolderGit2 className="w-4 h-4" />
            Ver minha presença no GitHub
            <ArrowRight className="w-4 h-4 ml-auto" />
          </Link>

          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/professor"
              onClick={onClose}
              className="py-2.5 px-3 rounded-xl bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-gray-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-[0.98]"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Painel do Professor
            </Link>

            <button
              onClick={onClose}
              type="button"
              className="py-2.5 px-3 rounded-xl bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-gray-300 font-semibold text-xs transition cursor-pointer active:scale-[0.98]"
            >
              Ficar no VS Code
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
