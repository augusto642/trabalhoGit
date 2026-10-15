"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { Student, Repository, CommandLog } from "@/lib/types";
import { INITIAL_REPOSITORY } from "@/lib/initialData";
import {
  getStoredRepository,
  saveRepository,
  getStoredStudents,
  saveStudent,
  getStoredLogs,
  getCurrentStudent,
  setCurrentStudent,
  resetAllData,
} from "@/lib/storage";

interface GitSimContextType {
  repository: Repository;
  students: Student[];
  logs: CommandLog[];
  currentStudent: Student | null;
  isIdModalOpen: boolean;
  openIdModal: () => void;
  closeIdModal: () => void;
  handleSaveStudent: (student: Student) => void;
  handleResetData: () => void;
  updateRepository: (newRepo: Repository) => void;
  updateStudent: (student: Student) => void;
}

const GitSimContext = createContext<GitSimContextType | undefined>(undefined);

export const GitSimProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [repository, setRepository] = useState<Repository>(INITIAL_REPOSITORY);
  const [students, setStudents] = useState<Student[]>([]);
  const [logs, setLogs] = useState<CommandLog[]>([]);
  const [currentStudent, setStudentState] = useState<Student | null>(null);
  const [isIdModalOpen, setIsIdModalOpen] = useState(false);

  // Inicializa dados do localStorage e sincroniza com a API / banco serverless no cliente
  useEffect(() => {
    // Inicializa dados persistidos locais após montagem
    queueMicrotask(() => {
      setRepository(getStoredRepository());
      setStudents(getStoredStudents());
      setLogs(getStoredLogs());
      const saved = getCurrentStudent();
      if (saved) {
        setStudentState(saved);
      } else {
        setIsIdModalOpen(true); // Se não tiver aluno cadastrado, abre modal
      }
    });

    // Carrega dados compartilhados da API (Vercel / Turso DB)
    const fetchApiData = async () => {
      try {
        const [repoRes, studentsRes, logsRes] = await Promise.allSettled([
          fetch("/api/repository").then((r) => r.json()),
          fetch("/api/students").then((r) => r.json()),
          fetch("/api/logs").then((r) => r.json()),
        ]);

        if (repoRes.status === "fulfilled" && repoRes.value?.id) {
          setRepository(repoRes.value);
          saveRepository(repoRes.value);
        }
        if (studentsRes.status === "fulfilled" && Array.isArray(studentsRes.value)) {
          setStudents(studentsRes.value);
        }
        if (logsRes.status === "fulfilled" && Array.isArray(logsRes.value)) {
          setLogs(logsRes.value);
        }
      } catch (err) {
        console.warn("[GitSimContext] API offline ou sem conexão, usando dados locais:", err);
      }
    };

    fetchApiData();
    const interval = setInterval(fetchApiData, 4000);

    // Ouvintes de eventos customizados
    const onRepoUpdate = (e: Event) => {
      const detail = (e as CustomEvent<Repository>).detail;
      if (detail) setRepository(detail);
    };
    const onStudentsUpdate = (e: Event) => {
      const detail = (e as CustomEvent<Student[]>).detail;
      if (detail) setStudents(detail);
    };
    const onLogsUpdate = () => {
      setLogs(getStoredLogs());
    };
    const onStudentSession = (e: Event) => {
      const detail = (e as CustomEvent<Student>).detail;
      if (detail) setStudentState(detail);
    };

    window.addEventListener("gitsim-repo-updated", onRepoUpdate);
    window.addEventListener("gitsim-students-updated", onStudentsUpdate);
    window.addEventListener("gitsim-logs-updated", onLogsUpdate);
    window.addEventListener("gitsim-student-session", onStudentSession);

    return () => {
      clearInterval(interval);
      window.removeEventListener("gitsim-repo-updated", onRepoUpdate);
      window.removeEventListener("gitsim-students-updated", onStudentsUpdate);
      window.removeEventListener("gitsim-logs-updated", onLogsUpdate);
      window.removeEventListener("gitsim-student-session", onStudentSession);
    };
  }, []);

  const openIdModal = () => setIsIdModalOpen(true);
  const closeIdModal = () => setIsIdModalOpen(false);

  const handleSaveStudent = (student: Student) => {
    setCurrentStudent(student);
    setStudentState(student);
    setStudents(getStoredStudents());
    setIsIdModalOpen(false);

    fetch("/api/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(student),
    }).catch((err) => console.warn("[GitSimContext] Erro ao sincronizar aluno na API:", err));
  };

  const handleResetData = async () => {
    if (confirm("Tem certeza que deseja resetar a atividade e todos os dados da turma?")) {
      resetAllData();
      setRepository(INITIAL_REPOSITORY);
      setStudents([]);
      setLogs([]);

      try {
        await fetch("/api/reset", { method: "POST" });
      } catch (err) {
        console.warn("[GitSimContext] Erro ao resetar dados na API:", err);
      }

      alert("Ambiente restaurado para os dados iniciais!");
    }
  };

  const updateRepository = (newRepo: Repository) => {
    saveRepository(newRepo);
    setRepository(newRepo);

    fetch("/api/repository", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newRepo),
    }).catch((err) => console.warn("[GitSimContext] Erro ao sincronizar repositório na API:", err));
  };

  const updateStudent = (student: Student) => {
    saveStudent(student);
    setCurrentStudent(student);
    setStudentState(student);
    setStudents(getStoredStudents());

    fetch("/api/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(student),
    }).catch((err) => console.warn("[GitSimContext] Erro ao sincronizar aluno na API:", err));
  };

  return (
    <GitSimContext.Provider
      value={{
        repository,
        students,
        logs,
        currentStudent,
        isIdModalOpen,
        openIdModal,
        closeIdModal,
        handleSaveStudent,
        handleResetData,
        updateRepository,
        updateStudent,
      }}
    >
      {children}
    </GitSimContext.Provider>
  );
};

export const useGitSim = () => {
  const context = useContext(GitSimContext);
  if (!context) {
    throw new Error("useGitSim must be used within a GitSimProvider");
  }
  return context;
};
