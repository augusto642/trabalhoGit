import { Repository, Student, CommandLog, Commit } from "./types";
import { INITIAL_REPOSITORY } from "./initialData";

const REPO_STORAGE_KEY = "gitsim_repository";
const STUDENTS_STORAGE_KEY = "gitsim_students";
const LOGS_STORAGE_KEY = "gitsim_logs";
const CURRENT_STUDENT_KEY = "gitsim_current_student";

// Memória do servidor para fallback em APIs
let serverRepository: Repository = { ...INITIAL_REPOSITORY };
let serverStudents: Student[] = [];
let serverLogs: CommandLog[] = [];

// Helper para verificar se está no browser
const isBrowser = () => typeof window !== "undefined";

export const getStoredRepository = (): Repository => {
  if (isBrowser()) {
    try {
      const data = localStorage.getItem(REPO_STORAGE_KEY);
      if (data) return JSON.parse(data);
    } catch {
      // fallback
    }
  }
  return serverRepository;
};

export const saveRepository = (repo: Repository): void => {
  serverRepository = repo;
  if (isBrowser()) {
    try {
      localStorage.setItem(REPO_STORAGE_KEY, JSON.stringify(repo));
      window.dispatchEvent(new CustomEvent("gitsim-repo-updated", { detail: repo }));
    } catch {
      // fallback
    }
  }
};

export const getStoredStudents = (): Student[] => {
  if (isBrowser()) {
    try {
      const data = localStorage.getItem(STUDENTS_STORAGE_KEY);
      if (data) return JSON.parse(data);
    } catch {
      // fallback
    }
  }
  return serverStudents;
};

export const saveStudent = (student: Student): void => {
  const students = getStoredStudents();
  const index = students.findIndex((s) => s.id === student.id);
  if (index >= 0) {
    students[index] = { ...students[index], ...student, lastActive: new Date().toISOString() };
  } else {
    students.push(student);
  }
  serverStudents = students;
  if (isBrowser()) {
    try {
      localStorage.setItem(STUDENTS_STORAGE_KEY, JSON.stringify(students));
      window.dispatchEvent(new CustomEvent("gitsim-students-updated", { detail: students }));
    } catch {
      // fallback
    }
  }
};

export const getStoredLogs = (): CommandLog[] => {
  if (isBrowser()) {
    try {
      const data = localStorage.getItem(LOGS_STORAGE_KEY);
      if (data) return JSON.parse(data);
    } catch {
      // fallback
    }
  }
  return serverLogs;
};

export const addCommandLog = (log: CommandLog): void => {
  const logs = getStoredLogs();
  logs.unshift(log); // mais recente primeiro
  serverLogs = logs;
  if (isBrowser()) {
    try {
      localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(logs.slice(0, 500))); // guarda até 500 logs
      window.dispatchEvent(new CustomEvent("gitsim-logs-updated", { detail: log }));
    } catch {
      // fallback
    }
  }
};

export const getCurrentStudent = (): Student | null => {
  if (isBrowser()) {
    try {
      const data = localStorage.getItem(CURRENT_STUDENT_KEY);
      if (data) return JSON.parse(data);
    } catch {
      // fallback
    }
  }
  return null;
};

export const setCurrentStudent = (student: Student | null): void => {
  if (isBrowser()) {
    try {
      if (student) {
        localStorage.setItem(CURRENT_STUDENT_KEY, JSON.stringify(student));
        saveStudent(student);
      } else {
        localStorage.removeItem(CURRENT_STUDENT_KEY);
      }
      window.dispatchEvent(new CustomEvent("gitsim-student-session", { detail: student }));
    } catch {
      // fallback
    }
  }
};

export const resetAllData = (): void => {
  serverRepository = { ...INITIAL_REPOSITORY };
  serverStudents = [];
  serverLogs = [];
  if (isBrowser()) {
    try {
      localStorage.setItem(REPO_STORAGE_KEY, JSON.stringify(INITIAL_REPOSITORY));
      localStorage.setItem(STUDENTS_STORAGE_KEY, JSON.stringify([]));
      localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify([]));
      window.dispatchEvent(new CustomEvent("gitsim-repo-updated", { detail: INITIAL_REPOSITORY }));
      window.dispatchEvent(new CustomEvent("gitsim-students-updated", { detail: [] }));
      window.dispatchEvent(new CustomEvent("gitsim-logs-updated", { detail: null }));
    } catch {
      // fallback
    }
  }
};

// Adiciona novo commit e atualiza o repo
export const pushCommitToRepo = (commit: Commit, updatedFiles: Record<string, string>): Repository => {
  const repo = getStoredRepository();
  const newRepo: Repository = {
    ...repo,
    files: { ...repo.files, ...updatedFiles },
    commits: [commit, ...repo.commits],
    updatedAt: new Date().toISOString(),
  };
  saveRepository(newRepo);
  return newRepo;
};
