import { Redis } from "@upstash/redis";
import { createClient, Client } from "@libsql/client";
import { Student, Repository, CommandLog } from "./types";
import { INITIAL_REPOSITORY } from "./initialData";

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

    const existingRepo = await db.execute("SELECT id FROM repository WHERE id = 'repo-turma-a'");
    if (existingRepo.rows.length === 0) {
      await db.execute({
        sql: `INSERT INTO repository (id, name, owner, description, default_branch, clone_url, files_json, commits_json, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          INITIAL_REPOSITORY.id,
          INITIAL_REPOSITORY.name,
          INITIAL_REPOSITORY.owner,
          INITIAL_REPOSITORY.description,
          INITIAL_REPOSITORY.defaultBranch,
          INITIAL_REPOSITORY.cloneUrl,
          JSON.stringify(INITIAL_REPOSITORY.files),
          JSON.stringify(INITIAL_REPOSITORY.commits),
          INITIAL_REPOSITORY.updatedAt,
        ],
      });
    }

    isTursoInitialized = true;
    return true;
  } catch (err) {
    console.error("[Storage/Turso] Erro ao inicializar tabelas:", err);
    return false;
  }
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
      const list = Object.values(data).map((v) => parseItem<Student>(v));
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
                score, total_commands, error_commands, created_at, last_active
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                turma = excluded.turma,
                has_cloned = excluded.has_cloned,
                has_edited = excluded.has_edited,
                has_committed = excluded.has_committed,
                has_pushed = excluded.has_pushed,
                score = excluded.score,
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

// --- OPERAÇÕES COM REPOSITÓRIO ---
export async function dbGetRepository(): Promise<Repository | null> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const data = await redis.get<unknown>("gitsim:repository");
      if (!data) {
        // Inicializa se vazio
        await redis.set("gitsim:repository", JSON.stringify(INITIAL_REPOSITORY));
        return INITIAL_REPOSITORY;
      }
      return parseItem<Repository>(data);
    } catch (err) {
      console.error("[Storage/Redis] Erro ao buscar repositório:", err);
      return null;
    }
  }

  const turso = getTursoClient();
  if (turso) {
    await initDb();
    try {
      const result = await turso.execute("SELECT * FROM repository LIMIT 1");
      if (result.rows.length === 0) return null;

      const row = result.rows[0] as unknown as Record<string, unknown>;
      return {
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
    } catch (err) {
      console.error("[Storage/Turso] Erro ao buscar repositório:", err);
      return null;
    }
  }

  return null;
}

export async function dbSaveRepository(repo: Repository): Promise<boolean> {
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.set("gitsim:repository", JSON.stringify(repo));
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

// --- RESET DE DADOS ---
export async function dbResetAll(): Promise<boolean> {
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.del("gitsim:students", "gitsim:logs");
      await redis.set("gitsim:repository", JSON.stringify(INITIAL_REPOSITORY));
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
      await turso.execute({
        sql: `UPDATE repository SET files_json = ?, commits_json = ?, updated_at = ? WHERE id = ?`,
        args: [
          JSON.stringify(INITIAL_REPOSITORY.files),
          JSON.stringify(INITIAL_REPOSITORY.commits),
          new Date().toISOString(),
          INITIAL_REPOSITORY.id,
        ],
      });
      return true;
    } catch (err) {
      console.error("[Storage/Turso] Erro ao resetar dados no Turso:", err);
      return false;
    }
  }

  return false;
}
