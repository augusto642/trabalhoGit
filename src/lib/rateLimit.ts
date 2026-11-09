/**
 * Rate limit em memória, SÓ onde a tarefa de segurança o pede: tentativas
 * de verificação da senha do professor e podas (pruneStudent) — nunca um
 * limite global sobre os 50 alunos (o fluxo normal da aula não passa por
 * aqui).
 *
 * Limitação honesta: o estado vive na memória do processo. Na Vercel
 * serverless cada instância tem seu próprio contador e um cold start o
 * zera — o limite atrasa e trava o abuso contra UMA instância, não é
 * uma barreira global. O fechamento total exigiria um contador no banco
 * (Redis), que depende da decisão/provisionamento do banco — ver o
 * relatório da correção. Em modo memória (produção atual, 1 processo
 * por instância) o limite vale dentro da instância que atendeu.
 *
 * Atenção NAT da escola: todos os alunos atrás do mesmo IP compartilham
 * o contador. Por isso os limites são generosos e o bloqueio é curto
 * (60 s), e o verify prefere ATRASO progressivo a bloqueio: 5 falhas
 * seguidas passam a custar 1,5 s cada, o que torna a força bruta online
 * impraticável sem travar a sala por um erro de digitação.
 */

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

interface FailureRecord {
  /** Instantes (ms) das falhas dentro da janela. */
  failures: number[];
  /** Até quando (ms) o IP está bloqueado; 0 = sem bloqueio. */
  blockedUntil: number;
}

const verifyFailures = new Map<string, FailureRecord>();
const pruneHits = new Map<string, number[]>();

const VERIFY_WINDOW_MS = 10 * 60 * 1000; // 10 min
const VERIFY_BLOCK_AFTER = 20; // falhas na janela -> bloqueio
const VERIFY_BLOCK_MS = 60 * 1000; // 60 s
const VERIFY_DELAY_AFTER = 5; // falhas -> atraso por tentativa
export const VERIFY_DELAY_MS = 1500;

const PRUNE_WINDOW_MS = 60 * 1000; // 1 min
const PRUNE_MAX = 30; // podas por IP por minuto (Reiniciar legítimo é raro)

function pruneOld(record: FailureRecord, now: number): void {
  record.failures = record.failures.filter((t) => now - t < VERIFY_WINDOW_MS);
}

export function verifyBlocked(ip: string, nowMs: number = Date.now()): boolean {
  const record = verifyFailures.get(ip);
  if (!record) return false;
  if (record.blockedUntil > nowMs) return true;
  pruneOld(record, nowMs);
  return false;
}

/** Atraso (ms) a aplicar antes de responder uma tentativa falha. */
export function verifyFailureDelayMs(ip: string, nowMs: number = Date.now()): number {
  const record = verifyFailures.get(ip);
  if (!record) return 0;
  pruneOld(record, nowMs);
  return record.failures.length >= VERIFY_DELAY_AFTER ? VERIFY_DELAY_MS : 0;
}

export function recordVerifyFailure(ip: string, nowMs: number = Date.now()): void {
  let record = verifyFailures.get(ip);
  if (!record) {
    record = { failures: [], blockedUntil: 0 };
    verifyFailures.set(ip, record);
  }
  pruneOld(record, nowMs);
  record.failures.push(nowMs);
  if (record.failures.length >= VERIFY_BLOCK_AFTER) {
    record.blockedUntil = nowMs + VERIFY_BLOCK_MS;
    record.failures = [];
  }
}

export function recordVerifySuccess(ip: string): void {
  verifyFailures.delete(ip);
}

/** Podas (pruneStudent) por IP: true = dentro do limite, false = 429. */
export function pruneAllowed(ip: string, nowMs: number = Date.now()): boolean {
  const hits = (pruneHits.get(ip) ?? []).filter((t) => nowMs - t < PRUNE_WINDOW_MS);
  if (hits.length >= PRUNE_MAX) {
    pruneHits.set(ip, hits);
    return false;
  }
  hits.push(nowMs);
  pruneHits.set(ip, hits);
  return true;
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
