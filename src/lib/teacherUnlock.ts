/**
 * Desbloqueio do Painel do Professor — só esta aba (sessionStorage, nunca
 * localStorage, nunca cookie). O desbloqueio guarda o nome de identificação,
 * a hora e o TOKEN DE SESSÃO devolvido pelo servidor — a SENHA nunca é
 * guardada no cliente: ela é verificada uma vez no servidor
 * (POST /api/teacher/verify) e descartada.
 *
 * Desbloqueio ÚNICO: o token autoriza o reset sem redigitar a senha
 * (o reset aceita o token como alternativa ao header de senha). O campo
 * de senha do ProfessorView continua existindo como fallback (ex.:
 * token expirado). O token é stateless (HMAC + expiração — ver
 * `src/lib/auth.ts`) e some ao fechar a aba, junto com o desbloqueio.
 *
 * Atenção: isso controla o ACESSO AO PAINEL (UI) e, desde a correção de
 * 30/10/2026, o token daqui também autoriza as rotas de professor no
 * servidor (GET /api/students, /api/logs, /api/legacy, mapa das duas
 * turmas e /api/teacher/*). O repositório da própria turma do aluno
 * continua aberto (fluxo do aluno, sem conta) — ver S3 no relatório.
 */

export interface TeacherUnlock {
  /** Nome informado no cadeado — identificação, exibida no cabeçalho. */
  name: string;
  unlockedAt: string;
  /** Token de sessão (stateless) — autoriza o reset sem redigitar a senha. */
  token?: string;
}

export const TEACHER_UNLOCK_STORAGE_KEY = "gitsim_teacher_unlock";

export function getTeacherUnlock(): TeacherUnlock | null {
  try {
    const raw = window.sessionStorage.getItem(TEACHER_UNLOCK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      name?: unknown;
      unlockedAt?: unknown;
      token?: unknown;
    };
    if (typeof parsed.name !== "string" || parsed.name.trim().length === 0) return null;
    return {
      name: parsed.name,
      unlockedAt: String(parsed.unlockedAt ?? ""),
      token: typeof parsed.token === "string" ? parsed.token : undefined,
    };
  } catch {
    return null;
  }
}

/** Token do desbloqueio atual, ou "" (sem desbloqueio ou registro antigo). */
export function getTeacherToken(): string {
  return getTeacherUnlock()?.token ?? "";
}

export function setTeacherUnlock(name: string, token: string = ""): void {
  try {
    const unlock: TeacherUnlock = {
      name,
      unlockedAt: new Date().toISOString(),
      token: token || undefined,
    };
    window.sessionStorage.setItem(TEACHER_UNLOCK_STORAGE_KEY, JSON.stringify(unlock));
    // Avisa o contexto (poll) para buscar os dados de professor imediatamente,
    // sem esperar o próximo tick de 4 s — o sessionStorage não dispara
    // evento na mesma aba.
    window.dispatchEvent(new CustomEvent("gitsim-teacher-unlock"));
  } catch {
    // Sem sessionStorage, o desbloqueio vale só enquanto a página estiver
    // montada (o gate mantém o estado em memória nesta montagem).
  }
}

export function clearTeacherUnlock(): void {
  try {
    window.sessionStorage.removeItem(TEACHER_UNLOCK_STORAGE_KEY);
  } catch {
    // Sem sessionStorage, nada a limpar.
  }
}

export type TeacherVerifyStatus = "ok" | "invalid" | "unavailable" | "unreachable";

export interface TeacherVerifyResult {
  status: TeacherVerifyStatus;
  /** Token de sessão (só quando status = "ok"); nunca a senha. */
  token: string | null;
}

/**
 * Verifica a senha no servidor e devolve o token de sessão quando aceita.
 * `unavailable` = 503 (senha não configurada no servidor — nada é
 * desbloqueado); `invalid` = 401 (mensagem genérica, sem revelar qual
 * campo falhou); `unreachable` = sem resposta do servidor.
 */
export async function verifyTeacherPassword(
  password: string,
): Promise<TeacherVerifyResult> {
  try {
    const res = await fetch("/api/teacher/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      const data = (await res.json().catch(() => null)) as {
        token?: unknown;
      } | null;
      return {
        status: "ok",
        token: typeof data?.token === "string" ? data.token : null,
      };
    }
    if (res.status === 503) return { status: "unavailable", token: null };
    return { status: "invalid", token: null };
  } catch {
    return { status: "unreachable", token: null };
  }
}
