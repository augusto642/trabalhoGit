"use client";

import React, { useState } from "react";
import { Student } from "@/lib/types";
import { buildIdentifiedStudent } from "@/lib/studentIdentity";
import { User, GraduationCap, ArrowRight, BookOpen } from "lucide-react";
import { useModalAccessibility } from "./useModalAccessibility";

// Turmas válidas do projeto. O valor salvo é sempre "201" ou "202".
const VALID_CLASSES = ["201", "202"] as const;

function isValidClass(value: string | undefined): value is (typeof VALID_CLASSES)[number] {
  return value === "201" || value === "202";
}

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
  // Turma salva antiga (diferente de 201/202) volta vazia: o aluno escolhe de novo.
  const storedTurma = currentStudent?.turma;
  const [turma, setTurma] = useState<string>(isValidClass(storedTurma) ? storedTurma : "");
  const [error, setError] = useState("");
  // Hook antes do early return: Escape, foco inicial e retorno de foco.
  const dialogRef = useModalAccessibility(isOpen, onClose);

  // O modal fica montado mesmo fechado (retorna null), então o useState
  // inicial só roda na primeira montagem. Ao abrir, ressincroniza com o
  // aluno atual — sem isso, um aluno retornado com turma antiga veria o
  // valor antigo no campo em vez de escolher de novo. Ajuste durante o
  // render (padrão recomendado pelo React para "ajustar estado quando uma
  // prop muda"): o React re-renderiza antes de pintar, sem efeito.
  const [prevOpen, setPrevOpen] = useState(false);
  if (isOpen && !prevOpen) {
    setPrevOpen(true);
    setName(currentStudent?.name || "");
    const stored = currentStudent?.turma;
    setTurma(isValidClass(stored) ? stored : "");
    setError("");
  } else if (!isOpen && prevOpen) {
    setPrevOpen(false);
  }

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const fullName = name.trim().replace(/\s+/g, " ");
    if (fullName.split(" ").length < 2) {
      setError("Por favor, digite seu nome completo (nome e sobrenome).");
      return;
    }
    if (!isValidClass(turma)) {
      setError("Por favor, escolha sua turma: 201 ou 202.");
      return;
    }

    // F1: a montagem do registro vive em buildIdentifiedStudent
    // (src/lib/studentIdentity.ts) — re-identificar o MESMO aluno
    // preserva domínio, diagnósticos e flags da Aula 2; aluno
    // diferente ganha registro novo e zerado.
    const student: Student = buildIdentifiedStudent(currentStudent, name, turma);

    onSave(student);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-identification-title"
        className="w-full max-w-md rounded-2xl bg-[#161b22] border border-[#30363d] p-6 shadow-2xl text-white"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h2 id="student-identification-title" className="text-xl font-bold text-gray-100">Bem-vindo ao GitEdu!</h2>
            <p className="text-sm text-gray-400">Simulador prático de Git, GitHub e VS Code</p>
          </div>
        </div>

        <p className="text-sm text-gray-300 mb-6 bg-[#0d1117] p-3 rounded-lg border border-[#21262d]">
          Para registrar sua presença na chamada e permitir ao professor acompanhar seu desempenho e logs de comandos, informe seus dados:
        </p>

        {error && (
          <div role="alert" className="mb-4 p-3 bg-red-950/60 border border-red-800 text-red-200 text-xs rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="student-name" className="block text-xs font-semibold text-gray-300 mb-1 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-blue-400" />
              Nome Completo
            </label>
            <input
              id="student-name"
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

          <fieldset>
            <legend className="block text-xs font-semibold text-gray-300 mb-1.5 flex items-center gap-1.5">
              <GraduationCap className="w-3.5 h-3.5 text-purple-400" />
              Turma
            </legend>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Turma">
              {VALID_CLASSES.map((option) => {
                const selected = turma === option;
                return (
                  <label
                    key={option}
                    htmlFor={`student-turma-${option}`}
                    className={`flex items-center justify-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm font-semibold cursor-pointer transition ${
                      selected
                        ? "bg-purple-600/20 border-purple-500 text-white"
                        : "bg-[#0d1117] border-[#30363d] text-gray-300 hover:border-purple-500/60"
                    }`}
                  >
                    <input
                      id={`student-turma-${option}`}
                      type="radio"
                      name="student-turma"
                      value={option}
                      checked={selected}
                      onChange={() => {
                        setTurma(option);
                        setError("");
                      }}
                      className="accent-purple-500"
                    />
                    {option}
                  </label>
                );
              })}
            </div>
          </fieldset>

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
