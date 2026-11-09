import { Redis } from "@upstash/redis";
import { createClient, Client } from "@libsql/client";
import { Student, Repository, CommandLog } from "./types";
import type { AuditEvent, ResetSnapshot } from "./audit";
import {
  INITIAL_REPOSITORIES,
  Turma,
  initialRepositoryForTurma,
  isKnownTurma,
  repositoryTurmaOf,
} from "./initialData";
import { partitionLegacyRepository } from "./partitionChamada";

// --- CLIENTES DE BANCO ---
let redisClient: Redis | null = null;
let tursoClient: Client | null = null;
let isTursoInitialized = false;

// Helper para desserializar com segurança dados do Redis
function parseItem<T>(item: unknown): T {
  if (typeof item === "string") {
    try {
      return JSON.parse(item) as T;
    } catch {
      return item as T;
    }
  }
  return item as T;
}

// 1. Vercel KV / Upstash Redis (Opção de 1 clique na Vercel)
function getRedisClient(): Redis | null {
  if (redisClient) return redisClient;

  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    try {
      redisClient = new Redis({ url, token });
      return redisClient;
    } catch (err) {
      console.error("[Storage/Redis] Erro ao instanciar cliente Redis:", err);
      return null;
    }
  }
  return null;
}

// 2. Turso LibSQL (Alternativa SQL)
function getTursoClient(): Client | null {
  if (tursoClient) return tursoClient;

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (url) {
    try {
      tursoClient = createClient({
        url,
        authToken: authToken || undefined,
      });
      return tursoClient;
    } catch (err) {
      console.error("[Storage/Turso] Erro ao instanciar cliente LibSQL:", err);
      return null;
    }
  }
  return null;
}

// Inicializa tabelas no Turso se for o provedor ativo
export async function initDb(): Promise<boolean> {
  // Se estiver usando Redis, não há tabelas relacionais a criar
  if (getRedisClient()) return true;

  const db = getTursoClient();
  if (!db) return false;
  if (isTursoInitialized) return true;

  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS students (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        turma TEXT NOT NULL,
        has_cloned INTEGER DEFAULT 0,
        has_edited INTEGER DEFAULT 0,
        has_committed INTEGER DEFAULT 0,
        has_pushed INTEGER DEFAULT 0,
        score INTEGER DEFAULT 0,
        score_detail_json TEXT,
        total_commands INTEGER DEFAULT 0,
        error_commands INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        last_active TEXT NOT NULL
      );
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS repository (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        owner TEXT NOT NULL,
        description TEXT,
        default_branch TEXT,
        clone_url TEXT,
        files_json TEXT NOT NULL,
        commits_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS command_logs (
        id TEXT PRIMARY KEY,
        student_id TEXT,
        student_name TEXT,
        turma TEXT,
        command TEXT NOT NULL,
        output TEXT,
        is_error INTEGER DEFAULT 0,
        tip TEXT,
        timestamp TEXT NOT NULL
      );
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS legacy_chamada_lines (
        line TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    // Auditoria do servidor (correção de segurança, 30/10/2026): eventos
    // gerados pelas rotas, NUNCA por entrada do cliente. O reset global
    // NÃO apaga esta tabela (ver dbResetAll) — a auditoria sobrevive
    // ao reset, como o snapshot pré-reset abaixo.
    await db.execute(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        actor TEXT NOT NULL,
        turma TEXT,
        detail TEXT NOT NULL,
        timestamp TEXT NOT NULL
      );
    `);

    // Snapshot pré-reset: um único registro ('last'), sobrescrito a
    // cada reset bem-sucedido, ANTES da limpeza.
    await db.execute(`
      CREATE TABLE IF NOT EXISTS reset_snapshots (
        id TEXT PRIMARY KEY,
        snapshot_json TEXT NOT NULL,
        taken_at TEXT NOT NULL
      );
    `);

    // Migração do formato antigo (repositório único id 'repo-turma-a'):
    // particiona a chamada e os commits por turma, guarda as linhas sem
    // turma reconhecível na tabela legada (só o professor as vê) e remove
    // o registro antigo para não migrar duas vezes.
    const legacyRepo = await db.execute(
      "SELECT * FROM repository WHERE id = 'repo-turma-a'"
    );
    if (legacyRepo.rows.length > 0) {
      const row = legacyRepo.rows[0] as unknown as Record<string, unknown>;
      const oldRepo: Repository = {
        id: String(row.id),
        name: String(row.name),
        owner: String(row.owner),
        description: String(row.description),
        defaultBranch: String(row.default_branch),
        cloneUrl: String(row.clone_url),
        files: JSON.parse(String(row.files_json)),
        commits: JSON.parse(String(row.commits_json)),
        updatedAt: String(row.updated_at),
      };
      const { repositories, legacyLines, stats } = partitionLegacyRepository(oldRepo);
      for (const turma of ["201", "202"] as const) {
        const r = repositories[turma];
        await db.execute({
          sql: `INSERT INTO repository (id, name, owner, description, default_branch, clone_url, files_json, commits_json, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  files_json = excluded.files_json,
                  commits_json = excluded.commits_json,
                  updated_at = excluded.updated_at`,
          args: [
            r.id,
            r.name,
            r.owner,
            r.description,
            r.defaultBranch,
            r.cloneUrl,
            JSON.stringify(r.files),
            JSON.stringify(r.commits),
            r.updatedAt,
          ],
        });
      }
      const now = new Date().toISOString();
      for (const line of legacyLines) {
        await db.execute({
          sql: `INSERT INTO legacy_chamada_lines (line, created_at) VALUES (?, ?)`,
          args: [line, now],
        });
      }
      await db.execute("DELETE FROM repository WHERE id = 'repo-turma-a'");
      console.info("[Storage/Turso] Migração da chamada por turma concluída:", stats);
    }

    // Seed dos dois repositórios (só quando nenhum existe ainda).
    const existingRepos = await db.execute(
      "SELECT id FROM repository WHERE id IN ('repo-turma-201', 'repo-turma-202')"
    );
    if (existingRepos.rows.length === 0) {
      for (const turma of ["201", "202"] as const) {
        const seed = INITIAL_REPOSITORIES[turma];
        await db.execute({
          sql: `INSERT INTO repository (id, name, owner, description, default_branch, clone_url, files_json, commits_json, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            seed.id,
            seed.name,
            seed.owner,
            seed.description,
            seed.defaultBranch,
            seed.cloneUrl,
            JSON.stringify(seed.files),
            JSON.stringify(seed.commits),
            seed.updatedAt,
          ],
        });
      }
    }

    // Bancos criados antes da frente MOTOR + NOTA não têm a coluna dos
    // componentes da nota: tenta adicioná-la (falha silenciosa se já existe).
    try {
      await db.execute(`ALTER TABLE students ADD COLUMN score_detail_json TEXT`);
    } catch {
      // Coluna já existe ou provedor sem suporte — o mapeamento abaixo
      // trata a ausência como componentes zerados.
    }

    isTursoInitialized = true;
    return true;
  } catch (err) {
    console.error("[Storage/Turso] Erro ao inicializar tabelas:", err);
    return false;
  }
}

// Componentes da nota serializados em score_detail_json (Turso).
// Correção D1: o progresso da Aula 2 viaja no mesmo JSON (sem migração
// de schema) — sem isso, o Turso descartaria hasPulled /
// hasResolvedConflict / transferCompleted no round-trip do /api/students
// e o espelho só sobreviveria no localStorage/Redis. Aluno antigo sem
// esses campos no JSON continua válido (undefined = nunca aconteceu).
function parseScoreDetail(row: Record<string, unknown>): {
  masteredConcepts: string[];
  diagnosticCommands: string[];
  unaidedScore: number;
  hasPulled?: boolean;
  hasResolvedConflict?: boolean;
  transferCompleted?: boolean;
} {
  const fallback = { masteredConcepts: [], diagnosticCommands: [], unaidedScore: 0 };
  try {
    const raw = row.score_detail_json;
    if (typeof raw !== "string" || !raw) return fallback;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Retrocompatibilidade: registros antigos serializaram o campo
    // legado `recoveredErrorConcepts` — a união dele em
    // `masteredConcepts` preserva os conceitos já dominados.
    const mastered = [
      ...new Set([
        ...(Array.isArray(parsed.masteredConcepts)
          ? parsed.masteredConcepts.filter((v): v is string => typeof v === "string")
          : []),
        ...(Array.isArray(parsed.recoveredErrorConcepts)
          ? parsed.recoveredErrorConcepts.filter((v): v is string => typeof v === "string")
          : []),
      ]),
    ];
    return {
      masteredConcepts: mastered,
      diagnosticCommands: Array.isArray(parsed.diagnosticCommands)
        ? parsed.diagnosticCommands.filter((v): v is string => typeof v === "string")
        : [],
      unaidedScore: typeof parsed.unaidedScore === "number" ? parsed.unaidedScore : 0,
      hasPulled: typeof parsed.hasPulled === "boolean" ? parsed.hasPulled : undefined,
      hasResolvedConflict:
        typeof parsed.hasResolvedConflict === "boolean" ? parsed.hasResolvedConflict : undefined,
      transferCompleted:
        typeof parsed.transferCompleted === "boolean" ? parsed.transferCompleted : undefined,
    };
  } catch {
    return fallback;
  }
}

function stringifyScoreDetail(student: Student): string {
  return JSON.stringify({
    masteredConcepts: student.masteredConcepts ?? [],
    diagnosticCommands: student.diagnosticCommands ?? [],
    unaidedScore: student.unaidedScore ?? 0,
    hasPulled: student.hasPulled,
    hasResolvedConflict: student.hasResolvedConflict,
    transferCompleted: student.transferCompleted,
  });
}

/**
 * Retrocompatibilidade na leitura (Redis/memória): um registro antigo
 * serializado com o campo legado `recoveredErrorConcepts` ganha a união
 * dele em `masteredConcepts` e perde o campo legado — mesmo tratamento
 * do parse do Turso acima e da validação do POST (validate.ts).
 */
function normalizeLegacyMasteredConcepts(student: Student): Student {
  const legacy = (student as Student & { recoveredErrorConcepts?: unknown })
    .recoveredErrorConcepts;
  if (!Array.isArray(legacy)) return student;
  const rest = { ...student } as Student & { recoveredErrorConcepts?: string[] };
  delete rest.recoveredErrorConcepts;
  return {
    ...rest,
    masteredConcepts: [
      ...new Set([
        ...(rest.masteredConcepts ?? []),
        ...legacy.filter((v): v is string => typeof v === "string"),
      ]),
    ],
  };
}

export function isDbConnected(): boolean {
  const hasRedis = Boolean(
    (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
    (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  );
  const hasTurso = Boolean(process.env.TURSO_DATABASE_URL);
  return hasRedis || hasTurso;
}

export function getActiveStorageProvider(): "vercel-kv" | "turso" | "local" {
  if (getRedisClient()) return "vercel-kv";
  if (getTursoClient()) return "turso";
  return "local";
}

// --- OPERAÇÕES COM ESTUDANTES ---
export async function dbGetStudents(): Promise<Student[] | null> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const data = await redis.hgetall<Record<string, unknown>>("gitsim:students");
      if (!data) return [];
      const list = Object.values(data).map((v) =>
        normalizeLegacyMasteredConcepts(parseItem<Student>(v)),
      );
      return list.sort(
        (a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime()
      );
    } catch (err) {
      console.error("[Storage/Redis] Erro ao buscar estudantes:", err);
      return null;
    }
  }

  const turso = getTursoClient();
  if (turso) {
    await initDb();
    try {
      const result = await turso.execute("SELECT * FROM students ORDER BY last_active DESC");
      return result.rows.map((row: Record<string, unknown>) => ({
        id: String(row.id),
        name: String(row.name),
        turma: String(row.turma),
        hasCloned: Boolean(row.has_cloned),
        hasEdited: Boolean(row.has_edited),
        hasCommitted: Boolean(row.has_committed),
        hasPushed: Boolean(row.has_pushed),
        score: Number(row.score),
        ...parseScoreDetail(row),
        totalCommands: Number(row.total_commands),
        errorCommands: Number(row.error_commands),
        createdAt: String(row.created_at),
        lastActive: String(row.last_active),
      }));
    } catch (err) {
      console.error("[Storage/Turso] Erro ao buscar estudantes:", err);
      return null;
    }
  }

  return null;
}

export async function dbSaveStudent(student: Student): Promise<boolean> {
  const updatedStudent: Student = {
    ...student,
    lastActive: new Date().toISOString(),
  };

  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.hset("gitsim:students", {
        [student.id]: JSON.stringify(updatedStudent),
      });
      return true;
    } catch (err) {
      console.error("[Storage/Redis] Erro ao salvar estudante:", err);
      return false;
    }
  }

  const turso = getTursoClient();
  if (turso) {
    await initDb();
    try {
      await turso.execute({
        sql: `INSERT INTO students (
                id, name, turma, has_cloned, has_edited, has_committed, has_pushed,
                score, score_detail_json, total_commands, error_commands, created_at, last_active
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                turma = excluded.turma,
                has_cloned = excluded.has_cloned,
                has_edited = excluded.has_edited,
                has_committed = excluded.has_committed,
                has_pushed = excluded.has_pushed,
                score = excluded.score,
                score_detail_json = excluded.score_detail_json,
                total_commands = excluded.total_commands,
                error_commands = excluded.error_commands,
                last_active = excluded.last_active`,
        args: [
          student.id,
          student.name,
          student.turma,
          student.hasCloned ? 1 : 0,
          student.hasEdited ? 1 : 0,
          student.hasCommitted ? 1 : 0,
          student.hasPushed ? 1 : 0,
          student.score,
          stringifyScoreDetail(student),
          student.totalCommands,
          student.errorCommands,
          student.createdAt,
          updatedStudent.lastActive,
        ],
      });
      return true;
    } catch (err) {
      console.error("[Storage/Turso] Erro ao salvar estudante:", err);
      return false;
    }
  }

  return false;
}

// --- OPERAÇÕES COM REPOSITÓRIO (um por turma) ---
function rowToRepository(row: Record<string, unknown>): Repository {
  return {
    id: String(row.id),
    turma: isKnownTurma(row.turma) ? row.turma : undefined,
    name: String(row.name),
    owner: String(row.owner),
    description: String(row.description),
    defaultBranch: String(row.default_branch),
    cloneUrl: String(row.clone_url),
    files: JSON.parse(String(row.files_json)),
    commits: JSON.parse(String(row.commits_json)),
    updatedAt: String(row.updated_at),
  };
}

/**
 * Mapa com os dois repositórios. No Redis, a chave antiga
 * `gitsim:repository` (formato único) é migrada na leitura: particiona,
 * escreve as chaves novas + a legada e apaga a antiga. No Turso, a
 * migração vive no initDb (registro id 'repo-turma-a').
 */
export async function dbGetRepositories(): Promise<Record<Turma, Repository> | null> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const out = {} as Record<Turma, Repository>;
      for (const turma of ["201", "202"] as const) {
        const data = await redis.get<unknown>(`gitsim:repository:${turma}`);
        if (!data) {
          const legacy = await redis.get<unknown>("gitsim:repository");
          if (legacy) {
            const oldRepo = parseItem<Repository>(legacy);
            const { repositories, legacyLines, stats } =
              partitionLegacyRepository(oldRepo);
            for (const t of ["201", "202"] as const) {
              await redis.set(`gitsim:repository:${t}`, JSON.stringify(repositories[t]));
            }
            await dbSaveLegacyLines(legacyLines);
            await redis.del("gitsim:repository");
            console.info("[Storage/Redis] Migração da chamada por turma concluída:", stats);
            return repositories;
          }
          await redis.set(
            `gitsim:repository:${turma}`,
            JSON.stringify(initialRepositoryForTurma(turma))
          );
          out[turma] = initialRepositoryForTurma(turma);
        } else {
          out[turma] = parseItem<Repository>(data);
        }
      }
      return out;
    } catch (err) {
      console.error("[Storage/Redis] Erro ao buscar repositórios:", err);
      return null;
    }
  }

  const turso = getTursoClient();
  if (turso) {
    await initDb();
    try {
      const result = await turso.execute(
        "SELECT * FROM repository WHERE id IN ('repo-turma-201', 'repo-turma-202')"
      );
      if (result.rows.length === 0) return null;
      const out = {} as Record<Turma, Repository>;
      for (const row of result.rows as unknown as Record<string, unknown>[]) {
        const repo = rowToRepository(row);
        const turma = repositoryTurmaOf(repo);
        if (turma) out[turma] = repo;
      }
      // Turma sem registro (banco parcial): completa com o inicial.
      for (const turma of ["201", "202"] as const) {
        if (!out[turma]) out[turma] = initialRepositoryForTurma(turma);
      }
      return out;
    } catch (err) {
      console.error("[Storage/Turso] Erro ao buscar repositórios:", err);
      return null;
    }
  }

  return null;
}

export async function dbGetRepository(turma: string): Promise<Repository | null> {
  // Turma desconhecida NÃO cai mais no 201 (P7): retorna null e a rota
  // decide (400/502) em vez de servir a lista errada por fallback.
  if (!isKnownTurma(turma)) return null;
  const repos = await dbGetRepositories();
  if (!repos) return null;
  return repos[turma];
}

/** Salva o repositório da turma dele. Sem turma reconhecível: recusa. */
export async function dbSaveRepository(repo: Repository): Promise<boolean> {
  if (!repositoryTurmaOf(repo)) {
    console.warn("[Storage] dbSaveRepository recusado: repositório sem turma conhecida", repo.id);
    return false;
  }

  const redis = getRedisClient();
  if (redis) {
    try {
      const turma = repositoryTurmaOf(repo) as Turma;
      await redis.set(`gitsim:repository:${turma}`, JSON.stringify(repo));
      return true;
    } catch (err) {
      console.error("[Storage/Redis] Erro ao salvar repositório:", err);
      return false;
    }
  }

  const turso = getTursoClient();
  if (turso) {
    await initDb();
    try {
      await turso.execute({
        sql: `INSERT INTO repository (id, name, owner, description, default_branch, clone_url, files_json, commits_json, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                owner = excluded.owner,
                description = excluded.description,
                default_branch = excluded.default_branch,
                clone_url = excluded.clone_url,
                files_json = excluded.files_json,
                commits_json = excluded.commits_json,
                updated_at = excluded.updated_at`,
        args: [
          repo.id,
          repo.name,
          repo.owner,
          repo.description,
          repo.defaultBranch,
          repo.cloneUrl,
          JSON.stringify(repo.files),
          JSON.stringify(repo.commits),
          repo.updatedAt,
        ],
      });
      return true;
    } catch (err) {
      console.error("[Storage/Turso] Erro ao salvar repositório:", err);
      return false;
    }
  }

  return false;
}

// --- LINHAS LEGADAS (sem turma reconhecível — só o professor as vê) ---
export async function dbGetLegacyLines(): Promise<string[] | null> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const data = await redis.get<unknown>("gitsim:legacy-chamada");
      if (!data) return [];
      return parseItem<string[]>(data);
    } catch (err) {
      console.error("[Storage/Redis] Erro ao buscar linhas legadas:", err);
      return null;
    }
  }

  const turso = getTursoClient();
  if (turso) {
    await initDb();
    try {
      const result = await turso.execute(
        "SELECT line FROM legacy_chamada_lines ORDER BY rowid ASC"
      );
      return result.rows.map((row) => String((row as Record<string, unknown>).line));
    } catch (err) {
      console.error("[Storage/Turso] Erro ao buscar linhas legadas:", err);
      return null;
    }
  }

  return null;
}

export async function dbSaveLegacyLines(lines: string[]): Promise<boolean> {
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.set("gitsim:legacy-chamada", JSON.stringify(lines));
      return true;
    } catch (err) {
      console.error("[Storage/Redis] Erro ao salvar linhas legadas:", err);
      return false;
    }
  }

  const turso = getTursoClient();
  if (turso) {
    await initDb();
    try {
      await turso.execute("DELETE FROM legacy_chamada_lines;");
      const now = new Date().toISOString();
      for (const line of lines) {
        await turso.execute({
          sql: `INSERT INTO legacy_chamada_lines (line, created_at) VALUES (?, ?)`,
          args: [line, now],
        });
      }
      return true;
    } catch (err) {
      console.error("[Storage/Turso] Erro ao salvar linhas legadas:", err);
      return false;
    }
  }

  return false;
}

// --- OPERAÇÕES COM LOGS ---
export async function dbAddLog(log: CommandLog): Promise<boolean> {
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.lpush("gitsim:logs", JSON.stringify(log));
      await redis.ltrim("gitsim:logs", 0, 499); // Mantém os 500 mais recentes
      return true;
    } catch (err) {
      console.error("[Storage/Redis] Erro ao inserir log:", err);
      return false;
    }
  }

  const turso = getTursoClient();
  if (turso) {
    await initDb();
    try {
      await turso.execute({
        sql: `INSERT INTO command_logs (id, student_id, student_name, turma, command, output, is_error, tip, timestamp)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          log.id,
          log.studentId,
          log.studentName,
          log.turma,
          log.command,
          log.output,
          log.isError ? 1 : 0,
          log.tip || null,
          log.timestamp,
        ],
      });
      return true;
    } catch (err) {
      console.error("[Storage/Turso] Erro ao inserir log:", err);
      return false;
    }
  }

  return false;
}

export async function dbGetLogs(limit = 200): Promise<CommandLog[] | null> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const rawLogs = await redis.lrange<unknown>("gitsim:logs", 0, limit - 1);
      if (!rawLogs) return [];
      return rawLogs.map((item) => parseItem<CommandLog>(item));
    } catch (err) {
      console.error("[Storage/Redis] Erro ao buscar logs:", err);
      return null;
    }
  }

  const turso = getTursoClient();
  if (turso) {
    await initDb();
    try {
      const result = await turso.execute({
        sql: `SELECT * FROM command_logs ORDER BY timestamp DESC LIMIT ?`,
        args: [limit],
      });

      return result.rows.map((row: Record<string, unknown>) => ({
        id: String(row.id),
        studentId: String(row.student_id || ""),
        studentName: String(row.student_name || ""),
        turma: String(row.turma || ""),
        command: String(row.command),
        output: String(row.output || ""),
        isError: Boolean(row.is_error),
        tip: row.tip ? String(row.tip) : undefined,
        timestamp: String(row.timestamp),
      }));
    } catch (err) {
      console.error("[Storage/Turso] Erro ao buscar logs:", err);
      return null;
    }
  }

  return null;
}

// --- AUDITORIA DO SERVIDOR + SNAPSHOT PRÉ-RESET (30/10/2026) ---
// Preservados pelo dbResetAll de propósito: a auditoria e o snapshot
// são a prova do que havia antes do reset, não dados da aula.
export async function dbAddAuditLog(event: AuditEvent): Promise<boolean> {
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.lpush("gitsim:audit", JSON.stringify(event));
      await redis.ltrim("gitsim:audit", 0, 1999);
      return true;
    } catch (err) {
      console.error("[Storage/Redis] Erro ao inserir log de auditoria:", err);
      return false;
    }
  }

  const turso = getTursoClient();
  if (turso) {
    await initDb();
    try {
      await turso.execute({
        sql: `INSERT INTO audit_logs (id, action, actor, turma, detail, timestamp)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [event.id, event.action, event.actor, event.turma ?? null, event.detail, event.timestamp],
      });
      return true;
    } catch (err) {
      console.error("[Storage/Turso] Erro ao inserir log de auditoria:", err);
      return false;
    }
  }

  return false;
}

export async function dbGetAuditLogs(limit = 500): Promise<AuditEvent[] | null> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const raw = await redis.lrange<unknown>("gitsim:audit", 0, limit - 1);
      if (!raw) return [];
      return raw.map((item) => parseItem<AuditEvent>(item));
    } catch (err) {
      console.error("[Storage/Redis] Erro ao buscar auditoria:", err);
      return null;
    }
  }

  const turso = getTursoClient();
  if (turso) {
    await initDb();
    try {
      const result = await turso.execute({
        sql: `SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?`,
        args: [limit],
      });
      return result.rows.map((row: Record<string, unknown>) => ({
        id: String(row.id),
        action: String(row.action) as AuditEvent["action"],
        actor: String(row.actor),
        turma: row.turma ? String(row.turma) : undefined,
        detail: String(row.detail),
        timestamp: String(row.timestamp),
      }));
    } catch (err) {
      console.error("[Storage/Turso] Erro ao buscar auditoria:", err);
      return null;
    }
  }

  return null;
}

export async function dbSaveResetSnapshot(snapshot: ResetSnapshot): Promise<boolean> {
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.set("gitsim:last-reset-snapshot", JSON.stringify(snapshot));
      return true;
    } catch (err) {
      console.error("[Storage/Redis] Erro ao salvar snapshot pré-reset:", err);
      return false;
    }
  }

  const turso = getTursoClient();
  if (turso) {
    await initDb();
    try {
      await turso.execute({
        sql: `INSERT INTO reset_snapshots (id, snapshot_json, taken_at)
              VALUES ('last', ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                snapshot_json = excluded.snapshot_json,
                taken_at = excluded.taken_at`,
        args: [JSON.stringify(snapshot), snapshot.takenAt],
      });
      return true;
    } catch (err) {
      console.error("[Storage/Turso] Erro ao salvar snapshot pré-reset:", err);
      return false;
    }
  }

  return false;
}

export async function dbGetResetSnapshot(): Promise<ResetSnapshot | null> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const data = await redis.get<unknown>("gitsim:last-reset-snapshot");
      if (!data) return null;
      return parseItem<ResetSnapshot>(data);
    } catch (err) {
      console.error("[Storage/Redis] Erro ao buscar snapshot pré-reset:", err);
      return null;
    }
  }

  const turso = getTursoClient();
  if (turso) {
    await initDb();
    try {
      const result = await turso.execute(
        "SELECT snapshot_json FROM reset_snapshots WHERE id = 'last'"
      );
      if (result.rows.length === 0) return null;
      return JSON.parse(String((result.rows[0] as Record<string, unknown>).snapshot_json)) as ResetSnapshot;
    } catch (err) {
      console.error("[Storage/Turso] Erro ao buscar snapshot pré-reset:", err);
      return null;
    }
  }

  return null;
}

// --- RESET DE DADOS (GLOBAL: as duas turmas + linhas legadas) ---
// NÃO apaga a auditoria (audit_logs / gitsim:audit) nem o snapshot
// pré-reset: ambos existem justamente para o depois do reset.
export async function dbResetAll(): Promise<boolean> {
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.del("gitsim:students", "gitsim:logs", "gitsim:legacy-chamada");
      for (const turma of ["201", "202"] as const) {
        await redis.set(
          `gitsim:repository:${turma}`,
          JSON.stringify(initialRepositoryForTurma(turma))
        );
      }
      // Chave antiga não volta: se existir, some junto com o reset.
      await redis.del("gitsim:repository");
      return true;
    } catch (err) {
      console.error("[Storage/Redis] Erro ao resetar dados no Redis:", err);
      return false;
    }
  }

  const turso = getTursoClient();
  if (turso) {
    await initDb();
    try {
      await turso.execute("DELETE FROM command_logs;");
      await turso.execute("DELETE FROM students;");
      await turso.execute("DELETE FROM legacy_chamada_lines;");
      for (const turma of ["201", "202"] as const) {
        const seed = initialRepositoryForTurma(turma);
        await turso.execute({
          sql: `INSERT INTO repository (id, name, owner, description, default_branch, clone_url, files_json, commits_json, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  files_json = excluded.files_json,
                  commits_json = excluded.commits_json,
                  updated_at = excluded.updated_at`,
          args: [
            seed.id,
            seed.name,
            seed.owner,
            seed.description,
            seed.defaultBranch,
            seed.cloneUrl,
            JSON.stringify(seed.files),
            JSON.stringify(seed.commits),
            seed.updatedAt,
          ],
        });
      }
      await turso.execute("DELETE FROM repository WHERE id = 'repo-turma-a';");
      return true;
    } catch (err) {
      console.error("[Storage/Turso] Erro ao resetar dados no Turso:", err);
      return false;
    }
  }

  return false;
}
