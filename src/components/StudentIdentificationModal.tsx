"use client";

import React, { useState } from "react";
import { Student } from "@/lib/types";
import { User, GraduationCap, ArrowRight, BookOpen } from "lucide-react";

interface Props {
  isOpen: boolean;
  onSave: (student: Student) => void;
  currentStudent?: Student | null;
  onClose?: () => void;
}

export const StudentIdentificationModal: React.FC<Props> = ({
  isOpen,
  onSave,
  currentStudent,
  onClose,
}) => {
  const [name, setName] = useState(currentStudent?.name || "");
  const [turma, setTurma] = useState(currentStudent?.turma || "");
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Por favor, digite seu nome completo.");
      return;
    }
    if (!turma.trim()) {
      setError("Por favor, informe sua turma (ex: Turma A, 3º Ano B, etc.).");
      return;
    }

    const student: Student = {
      id: currentStudent?.id || `student-${Date.now()}`,
      name: name.trim(),
      turma: turma.trim(),
      hasCloned: currentStudent?.hasCloned || false,
      hasEdited: currentStudent?.hasEdited || false,
      hasCommitted: currentStudent?.hasCommitted || false,
      hasPushed: currentStudent?.hasPushed || false,
      score: currentStudent?.score || 0,
      totalCommands: currentStudent?.totalCommands || 0,
      errorCommands: currentStudent?.errorCommands || 0,
      createdAt: currentStudent?.createdAt || new Date().toISOString(),
      lastActive: new Date().toISOString(),
    };

    onSave(student);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-[#161b22] border border-[#30363d] p-6 shadow-2xl text-white">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-100">Bem-vindo ao GitEdu!</h2>
            <p className="text-sm text-gray-400">Simulador prático de Git, GitHub e VS Code</p>
          </div>
        </div>

        <p className="text-sm text-gray-300 mb-6 bg-[#0d1117] p-3 rounded-lg border border-[#21262d]">
          Para registrar sua presença na chamada e permitir ao professor acompanhar seu desempenho e logs de comandos, informe seus dados:
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-950/60 border border-red-800 text-red-200 text-xs rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-blue-400" />
              Nome Completo
            </label>
            <input
              type="text"
              placeholder="Ex: Carlos Eduardo da Silva"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
              className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1 flex items-center gap-1.5">
              <GraduationCap className="w-3.5 h-3.5 text-purple-400" />
              Turma / Período
            </label>
            <input
              type="text"
              placeholder="Ex: Turma A - Engenharia de Software"
              value={turma}
              onChange={(e) => {
                setTurma(e.target.value);
                setError("");
              }}
              className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
            />
          </div>

          <div className="pt-2 flex gap-2">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="w-1/3 py-2.5 px-3 rounded-lg border border-[#30363d] text-gray-300 hover:bg-[#21262d] text-sm font-medium transition"
              >
                Cancelar
              </button>
            )}
            <button
              type="submit"
              className="flex-1 py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition cursor-pointer"
            >
              Começar Atividade
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
