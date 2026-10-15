"use client";

import React from "react";
import { useGitSim } from "@/context/GitSimContext";
import { VSCodeView } from "@/components/vscode/VSCodeView";
import { User, LogIn } from "lucide-react";

export default function VSCodePage() {
  const {
    currentStudent,
    repository,
    updateStudent,
    updateRepository,
    openIdModal,
  } = useGitSim();

  if (!currentStudent) {
    return (
      <div className="h-[calc(100vh-4rem)] flex flex-col items-center justify-center p-6 bg-[#1e1e1e] text-center text-white">
        <div className="w-16 h-16 rounded-2xl bg-[#252526] border border-[#333] flex items-center justify-center text-blue-400 mb-4 shadow-xl">
          <User className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold mb-2">Identificação Necessária</h2>
        <p className="text-sm text-gray-400 max-w-md mb-6">
          Para que o terminal grave seu histórico de comandos e avalie sua tarefa, por favor identifique seu Nome Completo e Turma.
        </p>
        <button
          onClick={openIdModal}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold text-sm shadow-lg shadow-blue-600/30 transition cursor-pointer"
        >
          <LogIn className="w-4 h-4" />
          Informar Nome e Turma
        </button>
      </div>
    );
  }

  return (
    <VSCodeView
      student={currentStudent}
      repository={repository}
      onStudentUpdate={updateStudent}
      onRepoUpdate={updateRepository}
    />
  );
}
