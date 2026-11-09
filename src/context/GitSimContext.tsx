"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { Student, Repository, CommandLog } from "@/lib/types";
import { INITIAL_REPOSITORIES, Turma, isKnownTurma } from "@/lib/initialData";
import { partitionLegacyRepository } from "@/lib/partitionChamada";
import { getTeacherToken } from "@/lib/teacherUnlock";
import {
  getStoredRepositories,
  saveRepository,
  getStoredStudents,
  saveStudent,
  getStoredLogs,
  getLegacyLines,
  saveLegacyLines,
  getCurrentStudent,
  setCurrentStudent,
  resetAllData,
} from "@/lib/storage";

/** Resultado do reset, para o chamador reagir a falhas de auth sem adivinhar. */
export interface ResetResult {
  ok: boolean;
  /** Servidor respondeu 401: senha ausente ou incorreta — nada foi apagado. */
  unauthorized: boolean;
  /** Servidor respondeu 503: escrita indisponível (senha não configurada). */
  unavailable: boolean;
  /** Qualquer outra falha (500, rede, etc.) — nada foi apagado (S4). */
  failed: boolean;
  /** Usuário cancelou a confirmação — nada foi feito. */
  cancelled: boolean;
}

/**
 * Opções do reset: a senha do professor, quando digitada no painel, vem
 * SÓ em memória nesta chamada (nunca persistida — S5 removeu a senha do
 * sessionStorage; o token do desbloqueio já basta no caminho normal).
 */
export interface ResetOptions {
  teacherPassword?: string;
}

interface GitSimContextType {
  /** Um repositório por turma — a lista de chamada nunca cruza turmas. */
  repositories: Record<Turma, Repository>;
  /**
   * Repositório resolvido: o da turma do aluno identificado, ou o da 201
   * quando ninguém está identificado (padrão de leitura; o fluxo do
   * aluno sempre passa por um aluno identificado).
   */
  repository: Repository;
  repositoryForTurma: (turma: string) => Repository;
  /** Linhas da chamada antiga sem turma reconhecível — só o professor as vê. */
  legacyLines: string[];
  students: Student[];
  logs: CommandLog[];
  currentStudent: Student | null;
  isIdModalOpen: boolean;
  openIdModal: () => void;
  closeIdModal: () => void;
  handleSaveStudent: (student: Student) => void;
  /**
   * Sair / trocar de aluno: encerra só a sessão do aluno atual e
   * reabre a identificação. Não apaga repositórios, alunos, logs nem
   * notas, e não toca no fluxo do professor.
   */
  signOutStudent: () => void;
  handleResetData: (opts?: ResetOptions) => Promise<ResetResult>;
  updateRepository: (newRepo: Repository, opts?: { pruneStudent?: string; pruneStudentId?: string }) => void;
  updateStudent: (student: Student) => void;
}

const GitSimContext = createContext<GitSimContextType | undefined>(undefined);

export const GitSimProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [repositories, setRepositories] = useState<Record<Turma, Repository>>(INITIAL_REPOSITORIES);
  const [legacyLines, setLegacyLines] = useState<string[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [logs, setLogs] = useState<CommandLog[]>([]);
  const [currentStudent, setStudentState] = useState<Student | null>(null);
  const [isIdModalOpen, setIsIdModalOpen] = useState(false);

  const repositoryForTurma = (turma: string): Repository =>
    isKnownTurma(turma) ? repositories[turma] : repositories["201"];
  const repository = currentStudent
    ? repositoryForTurma(currentStudent.turma)
    : repositories["201"];

  // Inicializa dados do localStorage e sincroniza com a API / banco serverless no cliente
  useEffect(() => {
    // Inicializa dados persistidos locais após montagem
    queueMicrotask(() => {
      setRepositories(getStoredRepositories());
      setLegacyLines(getLegacyLines());
      setStudents(getStoredStudents());
      setLogs(getStoredLogs());
      const saved = getCurrentStudent();
      if (saved) {
        setStudentState(saved);
        // Re-registra o aluno salvo no servidor (upsert com o mesmo nome
        // e turma — 409 se o id já existir com outro nome/turma, ignorado
        // aqui). Sem isso, um reinício do servidor (modo memória) deixava
        // o aluno "órfão": os logs dele passariam a ser rejeitados (a
        // trava anti-personificação exige registro) e os pushes dele
        // perderiam o crédito. O registro no login já faz isso no fluxo
        // normal; este é o caminho do reload.
        fetch("/api/students", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(saved),
        }).catch(() => undefined);
      } else {
        setIsIdModalOpen(true); // Se não tiver aluno cadastrado, abre modal
      }
    });

    // Carrega dados compartilhados da API (Vercel / Turso DB), por perfil
    // (S3, 30/10/2026): o mapa das duas turmas, a lista de alunos, os logs
    // e os legados são dados de professor — só são buscados com o token
    // do desbloqueio. O aluno busca SÓ o repositório da própria turma
    // (GET /api/repository?turma=, aberto por desenho — sem conta de
    // aluno não há como autenticar o fluxo dele). Sem aluno identificado
    // e sem token, nada é buscado (o modal de identificação está aberto).
    // Limpeza S5: remove eventual senha antiga persistida em sessionStorage
    // por versões anteriores (a senha nunca mais é guardada no cliente).
    try {
      window.sessionStorage.removeItem("gitsim_teacher_password");
    } catch {
      // Sem sessionStorage, nada a limpar.
    }

    const fetchApiData = async () => {
      try {
        const teacherToken = getTeacherToken();
        const identified = getCurrentStudent();
        if (teacherToken) {
          const headers = { "x-teacher-token": teacherToken };
          const [repoRes, studentsRes, logsRes, legacyRes] = await Promise.allSettled([
            fetch("/api/repository", { headers }).then((r) => r.json()),
            fetch("/api/students", { headers }).then((r) => r.json()),
            fetch("/api/logs", { headers }).then((r) => r.json()),
            fetch("/api/legacy", { headers }).then((r) => r.json()),
          ]);

          if (repoRes.status === "fulfilled") {
            const data = repoRes.value;
            if (data?.repositories?.["201"] && data?.repositories?.["202"]) {
              setRepositories(data.repositories);
              saveRepository(data.repositories["201"]);
              saveRepository(data.repositories["202"]);
            } else if (data?.id) {
              // Servidor ainda no formato antigo (único): particiona no
              // cliente, persiste por turma e envia as linhas legadas.
              const { repositories: migrated, legacyLines: migratedLegacy } =
                partitionLegacyRepository(data);
              setRepositories(migrated);
              saveRepository(migrated["201"]);
              saveRepository(migrated["202"]);
              saveLegacyLines(migratedLegacy);
              setLegacyLines(migratedLegacy);
              fetch("/api/legacy", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...headers },
                body: JSON.stringify(migratedLegacy),
              }).catch(() => undefined);
            }
          }
          if (studentsRes.status === "fulfilled" && Array.isArray(studentsRes.value)) {
            setStudents(studentsRes.value);
          }
          if (logsRes.status === "fulfilled" && Array.isArray(logsRes.value)) {
            setLogs(logsRes.value);
          }
          if (legacyRes.status === "fulfilled" && Array.isArray(legacyRes.value?.lines)) {
            setLegacyLines(legacyRes.value.lines);
            saveLegacyLines(legacyRes.value.lines);
          }
          return;
        }

        if (identified && isKnownTurma(identified.turma)) {
          const repoRes = await fetch(`/api/repository?turma=${identified.turma}`).then((r) =>
            r.json()
          ).catch(() => null);
          if (repoRes?.id) {
            const turma = identified.turma;
            setRepositories((prev) => ({ ...prev, [turma]: repoRes }));
            saveRepository(repoRes);
          }
        }
      } catch (err) {
        console.warn("[GitSimContext] API offline ou sem conexão, usando dados locais:", err);
      }
    };

    fetchApiData();
    const interval = setInterval(fetchApiData, 4000);
    // Desbloqueio do professor nesta aba: busca os dados dele na hora.
    const onTeacherUnlock = () => {
      void fetchApiData();
    };
    window.addEventListener("gitsim-teacher-unlock", onTeacherUnlock);

    // Ouvintes de eventos customizados
    const onRepoUpdate = (e: Event) => {
      const detail = (e as CustomEvent<Repository>).detail;
      if (!detail) return;
      // Atualiza só a turma do repositório recebido — nunca as duas.
      setRepositories((prev) => {
        const turma = isKnownTurma(detail.turma) ? detail.turma : null;
        if (!turma) return prev;
        return { ...prev, [turma]: detail };
      });
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
      window.removeEventListener("gitsim-teacher-unlock", onTeacherUnlock);
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

  /**
   * Sair / trocar de aluno: encerra SÓ a sessão do aluno atual —
   * limpa o aluno corrente (localStorage + estado React; o ouvinte de
   * "gitsim-student-session" ignora detail nulo, por isso o
   * setStudentState(null) direto) — e reabre a identificação, para
   * outro aluno entrar na mesma máquina. Não apaga repositórios, a
   * lista de alunos, os logs nem a nota de ninguém, e não toca no
   * fluxo do professor (cadeado, senha, reset). O próximo aluno
   * identificado ganha id novo e progresso zerado: o modal só
   * preserva id/progresso quando há aluno corrente — aqui não há.
   */
  const signOutStudent = () => {
    setCurrentStudent(null);
    setStudentState(null);
    setIsIdModalOpen(true);
  };

  const handleResetData = async (opts?: ResetOptions): Promise<ResetResult> => {
    if (!confirm("Tem certeza que deseja resetar a atividade e todos os dados da turma?")) {
      return { ok: false, unauthorized: false, unavailable: false, failed: false, cancelled: true };
    }

    // Camada central de escrita do reset. Desbloqueio ÚNICO: com o painel
    // desbloqueado, envia o header x-teacher-token (token de sessão
    // stateless, guardado só nesta aba) e o reset funciona SEM redigitar
    // a senha. A senha digitada no painel (fallback, ex.: token expirado)
    // vem SÓ em memória nesta chamada (opts.teacherPassword) — nunca
    // persistida no cliente (S5). O servidor aceita QUALQUER UMA das
    // duas credenciais válidas.
    //
    // S4 — só sucesso REAL do servidor limpa o local: qualquer status
    // diferente de ok (401, 503, 500, …) ou qualquer exceção de rede
    // retorna falha SEM wipe local e SEM alert de sucesso. O comportamento
    // anterior (catch que só logava e seguia para o wipe + "Ambiente
    // restaurado!") mentia sobre o reset quando o servidor falhava.
    // Exceção consciente: fora de produção sem TEACHER_PASSWORD o
    // servidor libera o reset (contrato antigo, mantido) — nesse caso a
    // resposta é ok e o wipe acontece, como antes.
    try {
      const teacherToken = getTeacherToken();
      const headers: Record<string, string> = {};
      if (teacherToken) headers["x-teacher-token"] = teacherToken;
      if (opts?.teacherPassword) headers["x-teacher-password"] = opts.teacherPassword;
      const res = await fetch("/api/reset", {
        method: "POST",
        headers: Object.keys(headers).length > 0 ? headers : undefined,
      });
      if (res.status === 401) {
        return { ok: false, unauthorized: true, unavailable: false, failed: false, cancelled: false };
      }
      if (res.status === 503) {
        return { ok: false, unauthorized: false, unavailable: true, failed: false, cancelled: false };
      }
      if (!res.ok) {
        console.warn("[GitSimContext] Reset recusado pelo servidor:", res.status);
        return { ok: false, unauthorized: false, unavailable: false, failed: true, cancelled: false };
      }
    } catch (err) {
      console.warn("[GitSimContext] Erro ao resetar dados na API — nada foi apagado:", err);
      return { ok: false, unauthorized: false, unavailable: false, failed: true, cancelled: false };
    }

    // Reset GLOBAL: apaga as duas turmas, as linhas legadas, os alunos e
    // os logs. Reset por turma é um passo futuro, não desta mudança.
    // O servidor já tirou o snapshot pré-reset (recuperável via painel).
    resetAllData();
    setRepositories(INITIAL_REPOSITORIES);
    setLegacyLines([]);
    setStudents([]);
    setLogs([]);

    alert("Ambiente restaurado para os dados iniciais!");
    return { ok: true, unauthorized: false, unavailable: false, failed: false, cancelled: false };
  };

  // Sincronização do repositório com o servidor (POST /api/repository).
  // O servidor MESCLA o snapshot (D-NOVO-1: nunca apaga commit/linha
  // alheia) — exceto quando opts.pruneStudent vem (fluxo Reiniciar),
  // caso em que o servidor poda só aquele aluno DEPOIS do merge, e só
  // se opts.pruneStudentId for o id registrado daquele aluno (S1) ou a
  // requisição trouxer token do professor. Uma poda recusada (403) NÃO
  // desfaz o estado local aqui — mas o próximo poll da turma restaura
  // o estado do servidor, então a recusa aparece (não é sucesso
  // silencioso); o warning abaixo registra o motivo no console.
  const updateRepository = (newRepo: Repository, opts?: { pruneStudent?: string; pruneStudentId?: string }) => {
    saveRepository(newRepo);
    setRepositories((prev) => {
      const turma = isKnownTurma(newRepo.turma) ? newRepo.turma : null;
      if (!turma) return prev;
      return { ...prev, [turma]: newRepo };
    });

    const teacherToken = getTeacherToken();
    fetch("/api/repository", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(teacherToken ? { "x-teacher-token": teacherToken } : {}),
      },
      body: JSON.stringify(
        opts?.pruneStudent
          ? { ...newRepo, pruneStudent: opts.pruneStudent, pruneStudentId: opts.pruneStudentId }
          : newRepo
      ),
    })
      .then(async (res) => {
        if (!res.ok) {
          console.warn(
            "[GitSimContext] Sincronização do repositório recusada:",
            res.status,
            await res.json().catch(() => null),
          );
        }
      })
      .catch((err) => console.warn("[GitSimContext] Erro ao sincronizar repositório na API:", err));
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
        repositories,
        repository,
        repositoryForTurma,
        legacyLines,
        students,
        logs,
        currentStudent,
        isIdModalOpen,
        openIdModal,
        closeIdModal,
        handleSaveStudent,
        signOutStudent,
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
