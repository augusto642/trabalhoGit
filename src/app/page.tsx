"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useGitSim } from "@/context/GitSimContext";
import { GlossaryModal } from "@/components/GlossaryModal";
import { Terminal, ArrowRight, FolderGit2, User } from "lucide-react";

export default function HomePage() {
  const { currentStudent, openIdModal } = useGitSim();
  const [glossaryOpen, setGlossaryOpen] = useState(false);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#0d1117] text-[#c9d1d9]">
      <main className="max-w-2xl mx-auto px-4">
        <header className="pt-12 sm:pt-16 pb-10 sm:pb-12 border-b border-[#30363d]">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight text-white">
            Projeto: Lista de Presença no GitHub
          </h1>

          <p className="mt-5 text-[15px] sm:text-base leading-relaxed text-gray-400">
            <strong className="text-white">Objetivo:</strong> registrar sua presença na chamada
            da turma usando o fluxo real de Git: trazer o repositório, assinar a chamada, registrar
            e enviar. No fim, seu nome completo aparece na lista do repositório da turma.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            {!currentStudent ? (
              <button
                onClick={openIdModal}
                className="w-full sm:w-auto justify-center px-7 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm flex items-center gap-2 transition cursor-pointer shadow-lg shadow-blue-600/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                Identificar-se
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <>
                <Link
                  href="/github"
                  className="w-full sm:w-auto justify-center px-5 py-3 rounded-xl bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-white font-semibold text-sm flex items-center gap-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  <FolderGit2 className="w-4 h-4 text-blue-400" />
                  Ir para o GitHub
                </Link>
                <Link
                  href="/vscode"
                  className="w-full sm:w-auto justify-center px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm flex items-center gap-2 transition shadow-lg shadow-blue-600/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  <Terminal className="w-4 h-4" />
                  Abrir VS Code & Terminal
                </Link>
              </>
            )}
          </div>

          {currentStudent && (
            <p className="mt-5 flex items-center gap-2 text-xs text-gray-500">
              <User className="w-3.5 h-3.5 text-gray-500" aria-hidden="true" />
              <span>
                {currentStudent.name} · Turma {currentStudent.turma}
              </span>
            </p>
          )}
        </header>

        <h2 className="mt-10 text-lg font-bold text-white">Como resolver</h2>
        <ol className="mt-3 space-y-3 text-sm leading-relaxed list-decimal list-inside">
          <li>
            <strong className="text-white">Traga o repositório para o seu computador</strong> —
            copie o link no GitHub simulado e clone no terminal do VS Code, para trabalhar
            localmente.
          </li>
          <li>
            <strong className="text-white">Assine a chamada</strong> — entre na pasta do projeto,
            abra o <code>chamada.txt</code>, escreva uma linha nova com seu nome completo e sua
            turma, e salve (sem salvar, o Git não enxerga a mudança).
          </li>
          <li>
            <strong className="text-white">Confira, prepare e registre</strong> — veja o que
            mudou, prepare o arquivo e registre um commit com uma mensagem que diga o que você
            fez.
          </li>
          <li>
            <strong className="text-white">Envie para o repositório da turma</strong> — faça o
            push e confira seu nome na aba GitHub.
          </li>
        </ol>

        <h2 className="mt-10 text-lg font-bold text-white">Como saber que terminou</h2>
        <p className="mt-3 text-sm leading-relaxed">
          Seu nome completo aparece na <code>chamada.txt</code> do repositório da turma, na aba
          GitHub, depois do push.
        </p>

        <h2 className="mt-10 text-lg font-bold text-white">Se travar</h2>
        <p className="mt-3 text-sm leading-relaxed">
          Leia a saída do terminal antes de repetir o comando — ela diz o que faltou. Se ainda
          travar, peça a pista da dica antes de pedir o comando pronto.
        </p>

        <section className="mt-10 pt-6 border-t border-[#30363d]">
          <h2 className="text-lg font-bold text-white">Variante — projeto com branch e conflito</h2>
          <ol className="mt-3 space-y-3 text-sm leading-relaxed list-decimal list-inside">
            <li>
              Crie uma branch com o nome da sua tarefa e trabalhe nela (editar, salvar,
              registrar).
            </li>
            <li>
              Traga as novidades com pull — se um colega mudou a mesma linha, resolva o conflito
              editando os marcadores e registre a resolução.
            </li>
            <li>Envie com push.</li>
          </ol>
        </section>
      </main>

      {/* Sem link para o Painel do Professor no rodapé: o único acesso é o
          cadeado discreto no canto da página (TeacherLockButton). */}
      <footer className="max-w-2xl mx-auto px-4 pb-10 pt-6 border-t border-[#30363d] flex flex-wrap gap-4">
        <button
          type="button"
          onClick={() => setGlossaryOpen(true)}
          className="text-xs text-gray-500 hover:text-gray-300 transition cursor-pointer"
        >
          Glossário do Git
        </button>
      </footer>

      <GlossaryModal isOpen={glossaryOpen} onClose={() => setGlossaryOpen(false)} />
    </div>
  );
}
