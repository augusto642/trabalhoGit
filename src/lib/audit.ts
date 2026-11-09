/**
 * Auditoria gerada NO SERVIDOR, separada dos logs de comando do aluno.
 *
 * Por que separada: POST /api/logs aceita texto do cliente (mesmo com a
 * trava de personificação, o cliente escreve o que quiser) — um log
 * fabricado não pode ser a prova de quem fez o quê. Os eventos daqui
 * nascem nas rotas, a partir da ação real que o servidor executou
 * (push, prune, reset, verify), com ator/quando/o quê, e NUNCA passam
 * por entrada do cliente. Senhas e tokens nunca entram num evento.
 *
 * Sobrevivência: o Reiniciar do aluno poda o repositório e zera o
 * registro dele, mas NÃO toca esta lista; o reset global também não a
 * apaga (dbResetAll preserva a tabela/chave de auditoria de propósito)
 * — só um snapshot pré-reset é guardado à parte (ver resetSnapshot).
 * Em modo memória a auditoria morre com o processo (limitação do modo,
 * igual ao resto dos dados — ver P1); com banco ligado ela persiste na
 * tabela/chave de auditoria.
 */

import type { CommandLog, Repository, Student } from "./types";
import {
  dbAddAuditLog,
  dbGetAuditLogs,
  dbGetResetSnapshot,
  dbSaveResetSnapshot,
  isDbConnected,
} from "./db";

export type AuditAction = "push" | "prune" | "reset" | "verify-ok" | "verify-fail";

export interface AuditEvent {
  id: string;
  action: AuditAction;
  /** Quem: nome do aluno, "professor" ou "desconhecido" (verify falho). Nunca id secreto. */
  actor: string;
  turma?: string;
  /** O quê, em texto curto e sem segredos (ex.: commit id, nome podado). */
  detail: string;
  timestamp: string;
}

export interface ResetSnapshot {
  takenAt: string;
  repositories: Record<string, Repository>;
  students: Student[];
  legacyLines: string[];
  logs: CommandLog[];
}

const AUDIT_CAP = 2000;

let serverAudit: AuditEvent[] = [];
let serverSnapshot: ResetSnapshot | null = null;

export function addAuditToMemory(event: AuditEvent): void {
  serverAudit.unshift(event);
  if (serverAudit.length > AUDIT_CAP) serverAudit = serverAudit.slice(0, AUDIT_CAP);
}

export function getAuditFromMemory(limit = 500): AuditEvent[] {
  return serverAudit.slice(0, limit);
}

/**
 * Registra um evento de auditoria na memória e, com banco ligado, no
 * banco. Falha do banco aqui NÃO falha a ação do usuário (a memória
 * já registrou); o erro vai para o log do servidor — a auditoria é
 * prova, não gate. Quem precisa de garantia de auditoria precisa do
 * banco ligado (ver relatório).
 */
export async function recordAudit(event: Omit<AuditEvent, "id" | "timestamp">): Promise<AuditEvent> {
  const full: AuditEvent = {
    ...event,
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
  };
  addAuditToMemory(full);
  if (isDbConnected()) {
    try {
      await dbAddAuditLog(full);
    } catch (err) {
      console.warn("[audit] Falha ao persistir evento no banco:", err);
    }
  }
  return full;
}

export async function getAuditEvents(limit = 500): Promise<AuditEvent[]> {
  if (isDbConnected()) {
    const fromDb = await dbGetAuditLogs(limit);
    if (fromDb) return fromDb;
    // Banco configurado mas leitura falhou: o chamador decide (502) —
    // aqui devolvemos null sinalizado por exceção, não memória velha.
    throw new Error("Falha ao ler auditoria do banco");
  }
  return getAuditFromMemory(limit);
}

export async function saveResetSnapshot(snapshot: ResetSnapshot): Promise<boolean> {
  serverSnapshot = snapshot;
  if (isDbConnected()) {
    return dbSaveResetSnapshot(snapshot);
  }
  return true;
}

export async function getResetSnapshot(): Promise<ResetSnapshot | null> {
  if (isDbConnected()) {
    const fromDb = await dbGetResetSnapshot();
    if (fromDb) return fromDb;
    throw new Error("Falha ao ler snapshot do banco");
  }
  return serverSnapshot;
}
