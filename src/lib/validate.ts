import type { CommandLog, Commit, Repository, Student } from "./types";
import { isKnownTurma } from "./initialData";

/**
 * Validadores escritos à mão, SEM nova dependência.
 *
 * Justificativa: os payloads das rotas de escrita são pequenos e de formato
 * fixo (Student, Repository, CommandLog, push { commit, updatedFiles }),
 * já tipados em `src/lib/types.ts`. Uma biblioteca de schema (ex.: zod)
 * adicionaria uma dependência e um passo de install para validar meia
 * dúzia de campos — validação manual cobre o que as rotas precisam
 * (campo obrigatório, tipo correto, JSON válido) sem pesar o projeto.
 * Se os payloads crescerem ou ganharem regras aninhadas complexas,
 * reavaliar a troca por uma biblioteca de schema.
 *
 * Convenções:
 * - Validadores só exigem os campos obrigatórios; campos extras no payload
 *   são ignorados (não rejeitados), para não quebrar clientes que enviem
 *   campos novos junto com os conhecidos.
 * - Mensagens de erro nomeiam o campo e o problema, para o cliente corrigir
 *   a requisição sem adivinhar. Nunca ecoam valores recebidos.
 * - Falha de validação é sempre 400 nas rotas; 500 é reservado a falha
 *   interna (nunca para entrada inválida).
 */

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export type JsonParseResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

/**
 * Tetos de entrada (higiene, 30/10/2026 — S7): antes só se validava tipo,
 * nunca comprimento, e um nome de 5000 caracteres ou um README de 500 KB
 * passava (prova da auditoria). Os tetos são generosos para a aula
 * (nenhum arquivo real de exercício chega perto) e só barram abuso.
 */
export const MAX_BODY_BYTES = 3_000_000;
export const MAX_NAME_LENGTH = 120;
export const MAX_ID_LENGTH = 200;
export const MAX_FILE_NAME_LENGTH = 200;
export const MAX_FILE_CONTENT_LENGTH = 200_000;
export const MAX_FILES_PER_PAYLOAD = 200;
export const MAX_TOTAL_FILES_LENGTH = 2_000_000;
export const MAX_COMMIT_MESSAGE_LENGTH = 500;
export const MAX_COMMAND_LENGTH = 2000;
export const MAX_OUTPUT_LENGTH = 50_000;
export const MAX_LEGACY_LINES = 5000;
export const MAX_LEGACY_LINE_LENGTH = 500;

/** Lê o corpo como JSON; JSON inválido (ou corpo vazio) vira erro 400. */
export async function parseJsonBody(req: Request): Promise<JsonParseResult> {
  const contentLength = req.headers.get("content-length");
  if (contentLength !== null) {
    const size = Number(contentLength);
    if (Number.isFinite(size) && size > MAX_BODY_BYTES) {
      return { ok: false, error: "Corpo da requisição excede o tamanho máximo permitido" };
    }
  }
  let data: unknown;
  try {
    data = await req.json();
  } catch {
    return { ok: false, error: "Corpo da requisição não é um JSON válido" };
  }
  return { ok: true, data };
}

/** Teto de arquivos (nome, conteúdo, quantidade e total) — push e repositório. */
function checkFilesRecord(
  files: Record<string, string>,
): string | null {
  const names = Object.keys(files);
  if (names.length > MAX_FILES_PER_PAYLOAD) {
    return `Campo 'files' excede o máximo de ${MAX_FILES_PER_PAYLOAD} arquivos`;
  }
  let total = 0;
  for (const [name, content] of Object.entries(files)) {
    if (name.length > MAX_FILE_NAME_LENGTH) {
      return "Nome de arquivo excede o tamanho máximo permitido";
    }
    if (content.length > MAX_FILE_CONTENT_LENGTH) {
      return `Arquivo '${name}' excede o tamanho máximo permitido`;
    }
    total += content.length;
    if (total > MAX_TOTAL_FILES_LENGTH) {
      return "Conteúdo total dos arquivos excede o tamanho máximo permitido";
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    isRecord(value) &&
    Object.values(value).every((item) => typeof item === "string")
  );
}

function requiredString(
  body: Record<string, unknown>,
  field: string,
): string | null {
  if (!isNonEmptyString(body[field])) {
    return `Campo '${field}' é obrigatório e deve ser texto não vazio`;
  }
  return null;
}

function optionalString(
  body: Record<string, unknown>,
  field: string,
): string | null {
  if (body[field] !== undefined && !isString(body[field])) {
    return `Campo '${field}' deve ser texto`;
  }
  return null;
}

export function validateStudent(body: unknown): ValidationResult<Student> {
  if (!isRecord(body)) {
    return { ok: false, error: "Corpo deve ser um objeto de aluno" };
  }
  for (const field of ["id", "name", "turma", "createdAt", "lastActive"]) {
    const error = requiredString(body, field);
    if (error) return { ok: false, error };
  }
  if ((body.id as string).length > MAX_ID_LENGTH) {
    return { ok: false, error: "Campo 'id' excede o tamanho máximo permitido" };
  }
  if ((body.name as string).length > MAX_NAME_LENGTH) {
    return { ok: false, error: "Campo 'name' excede o tamanho máximo permitido" };
  }
  // R3 — a turma tem de ser conhecida (201/202): sem isso, um registro
  // forjado cairia no fallback de leitura para a 201 e apareceria no
  // painel. O login já força nova escolha para turma antiga, então
  // nenhum fluxo legítimo envia outra turma.
  if (!isKnownTurma(body.turma)) {
    return { ok: false, error: "Campo 'turma' é obrigatório e deve ser '201' ou '202'" };
  }
  for (const field of ["hasCloned", "hasEdited", "hasCommitted", "hasPushed"]) {
    if (!isBoolean(body[field])) {
      return { ok: false, error: `Campo '${field}' é obrigatório e deve ser booleano` };
    }
  }
  for (const field of ["score", "totalCommands", "errorCommands"]) {
    if (!isNonNegativeNumber(body[field])) {
      return { ok: false, error: `Campo '${field}' é obrigatório e deve ser número maior ou igual a 0` };
    }
  }
  // Componentes da nota (frente MOTOR + NOTA): opcionais, mas tipados
  // quando presentes — aluno antigo sem esses campos continua válido.
  for (const field of ["masteredConcepts", "diagnosticCommands"]) {
    if (body[field] !== undefined && !isStringArray(body[field])) {
      return { ok: false, error: `Campo '${field}' deve ser lista de textos` };
    }
  }
  // Campo legado: registros antigos trazem `recoveredErrorConcepts`
  // (só conceitos dominados após erro). Se presente, precisa ser lista
  // de textos — a união com `masteredConcepts` acontece no retorno.
  if (
    body["recoveredErrorConcepts"] !== undefined &&
    !isStringArray(body["recoveredErrorConcepts"])
  ) {
    return { ok: false, error: "Campo 'recoveredErrorConcepts' deve ser lista de textos" };
  }
  // Progresso da Aula 2 (correção D1): opcionais, mas booleanos quando
  // presentes — mesmo padrão dos demais campos opcionais acima. Aluno
  // antigo sem esses campos continua válido.
  for (const field of ["hasPulled", "hasResolvedConflict", "transferCompleted"]) {
    if (body[field] !== undefined && !isBoolean(body[field])) {
      return { ok: false, error: `Campo '${field}' deve ser booleano` };
    }
  }
  if (
    body["unaidedScore"] !== undefined &&
    (!isNonNegativeNumber(body["unaidedScore"]) || (body["unaidedScore"] as number) > 10)
  ) {
    return { ok: false, error: `Campo 'unaidedScore' deve ser número entre 0 e 10` };
  }
  // Retrocompatibilidade: o campo legado `recoveredErrorConcepts` é
  // unido em `masteredConcepts` e removido do objeto validado — o
  // registro antigo não perde os conceitos já dominados, e o campo
  // legado não volta a ser persistido.
  const { recoveredErrorConcepts: _legacy, ...rest } = body as Record<string, unknown> & {
    recoveredErrorConcepts?: string[];
  };
  const mastered = [
    ...new Set([
      ...((rest["masteredConcepts"] as string[] | undefined) ?? []),
      ...(_legacy ?? []),
    ]),
  ];
  return {
    ok: true,
    value: { ...rest, masteredConcepts: mastered } as unknown as Student,
  };
}

export function validateCommit(body: unknown): ValidationResult<Commit> {
  if (!isRecord(body)) {
    return { ok: false, error: "Campo 'commit' deve ser um objeto" };
  }
  for (const field of ["id", "hash", "author", "authorTurma", "message", "timestamp"]) {
    const error = requiredString(body, field);
    if (error) return { ok: false, error: `Campo 'commit.${field}' é obrigatório e deve ser texto não vazio` };
  }
  if ((body.author as string).length > MAX_NAME_LENGTH) {
    return { ok: false, error: "Campo 'commit.author' excede o tamanho máximo permitido" };
  }
  if ((body.message as string).length > MAX_COMMIT_MESSAGE_LENGTH) {
    return { ok: false, error: "Campo 'commit.message' excede o tamanho máximo permitido" };
  }
  if (!isStringArray(body.filesChanged)) {
    return { ok: false, error: "Campo 'commit.filesChanged' é obrigatório e deve ser lista de textos" };
  }
  if (
    body.filesChanged.length > MAX_FILES_PER_PAYLOAD ||
    (body.filesChanged as string[]).some((f) => f.length > MAX_FILE_NAME_LENGTH)
  ) {
    return { ok: false, error: "Campo 'commit.filesChanged' excede o tamanho máximo permitido" };
  }
  return { ok: true, value: body as unknown as Commit };
}

export function validateRepository(body: unknown): ValidationResult<Repository> {
  if (!isRecord(body)) {
    return { ok: false, error: "Corpo deve ser um objeto de repositório" };
  }
  // Partição por turma: todo repositório salvo pertence a uma turma
  // conhecida — sem isso, uma escrita poderia cair na lista errada.
  if (!isKnownTurma(body.turma)) {
    return { ok: false, error: "Campo 'turma' é obrigatório e deve ser '201' ou '202'" };
  }
  for (const field of ["id", "name", "owner", "defaultBranch", "updatedAt"]) {
    const error = requiredString(body, field);
    if (error) return { ok: false, error };
  }
  for (const field of ["description", "cloneUrl"]) {
    const error = optionalString(body, field);
    if (error) return { ok: false, error };
    if (body[field] === undefined) {
      return { ok: false, error: `Campo '${field}' é obrigatório e deve ser texto` };
    }
  }
  if (!isStringRecord(body.files)) {
    return { ok: false, error: "Campo 'files' é obrigatório e deve ser um objeto de texto para texto" };
  }
  const filesError = checkFilesRecord(body.files);
  if (filesError) return { ok: false, error: filesError };
  if ((body.name as string).length > MAX_NAME_LENGTH || (body.owner as string).length > MAX_NAME_LENGTH) {
    return { ok: false, error: "Campo 'name'/'owner' excede o tamanho máximo permitido" };
  }
  if (!Array.isArray(body.commits)) {
    return { ok: false, error: "Campo 'commits' é obrigatório e deve ser uma lista" };
  }
  if (body.commits.length > 5000) {
    return { ok: false, error: "Campo 'commits' excede o tamanho máximo permitido" };
  }
  for (const commit of body.commits) {
    const result = validateCommit(commit);
    if (!result.ok) return { ok: false, error: result.error };
  }
  return { ok: true, value: body as unknown as Repository };
}

export function validateCommandLog(body: unknown): ValidationResult<CommandLog> {
  if (!isRecord(body)) {
    return { ok: false, error: "Corpo deve ser um objeto de log" };
  }
  for (const field of ["id", "command", "timestamp"]) {
    const error = requiredString(body, field);
    if (error) return { ok: false, error };
  }
  for (const field of ["studentId", "studentName", "turma", "output"]) {
    const error = optionalString(body, field);
    if (error) return { ok: false, error };
    if (body[field] === undefined) {
      return { ok: false, error: `Campo '${field}' é obrigatório e deve ser texto` };
    }
  }
  if ((body.command as string).length > MAX_COMMAND_LENGTH) {
    return { ok: false, error: "Campo 'command' excede o tamanho máximo permitido" };
  }
  if ((body.output as string).length > MAX_OUTPUT_LENGTH) {
    return { ok: false, error: "Campo 'output' excede o tamanho máximo permitido" };
  }
  if ((body.studentName as string).length > MAX_NAME_LENGTH || (body.studentId as string).length > MAX_ID_LENGTH) {
    return { ok: false, error: "Campo 'studentName'/'studentId' excede o tamanho máximo permitido" };
  }
  if (!isBoolean(body.isError)) {
    return { ok: false, error: "Campo 'isError' é obrigatório e deve ser booleano" };
  }
  if (body.tip !== undefined && !isString(body.tip)) {
    return { ok: false, error: "Campo 'tip' deve ser texto" };
  }
  return { ok: true, value: body as unknown as CommandLog };
}

export interface PushPayload {
  commit: Commit;
  updatedFiles: Record<string, string>;
  turma: string;
  studentId?: string;
  /** Nomes limpos excluídos no commit (propagados ao repo da turma). */
  deletedFiles?: string[];
}

export function validatePush(body: unknown): ValidationResult<PushPayload> {
  if (!isRecord(body)) {
    return { ok: false, error: "Corpo deve ser um objeto com 'commit' e 'updatedFiles'" };
  }
  const commit = validateCommit(body.commit);
  if (!commit.ok) return commit;
  if (!isStringRecord(body.updatedFiles)) {
    return { ok: false, error: "Campo 'updatedFiles' é obrigatório e deve ser um objeto de texto para texto" };
  }
  const pushFilesError = checkFilesRecord(body.updatedFiles);
  if (pushFilesError) return { ok: false, error: pushFilesError };
  if (
    Array.isArray(body.deletedFiles) &&
    (body.deletedFiles.length > MAX_FILES_PER_PAYLOAD ||
      (body.deletedFiles as unknown[]).some(
        (f) => typeof f === "string" && f.length > MAX_FILE_NAME_LENGTH,
      ))
  ) {
    return { ok: false, error: "Campo 'deletedFiles' excede o tamanho máximo permitido" };
  }
  // Trava anti-vazamento entre turmas: o push declara a turma e o commit
  // precisa ser da mesma turma — um push da 201 nunca escreve na 202.
  if (!isKnownTurma(body.turma)) {
    return { ok: false, error: "Campo 'turma' é obrigatório e deve ser '201' ou '202'" };
  }
  if (commit.value.authorTurma !== body.turma) {
    return { ok: false, error: "Campo 'commit.authorTurma' deve ser igual a 'turma'" };
  }
  if (body.studentId !== undefined && !isNonEmptyString(body.studentId)) {
    return { ok: false, error: "Campo 'studentId' deve ser texto não vazio" };
  }
  if (body.deletedFiles !== undefined && !isStringArray(body.deletedFiles)) {
    return { ok: false, error: "Campo 'deletedFiles' deve ser uma lista de textos" };
  }
  return {
    ok: true,
    value: {
      commit: commit.value,
      updatedFiles: body.updatedFiles,
      turma: body.turma as string,
      ...(body.studentId !== undefined
        ? { studentId: body.studentId as string }
        : {}),
      ...(body.deletedFiles !== undefined
        ? { deletedFiles: body.deletedFiles as string[] }
        : {}),
    },
  };
}

/** Linhas legadas da chamada antiga (sem turma reconhecível). */
export function validateLegacyLines(body: unknown): ValidationResult<string[]> {
  if (!isStringArray(body)) {
    return { ok: false, error: "Corpo deve ser uma lista de textos" };
  }
  const lines = body as string[];
  if (
    lines.length > MAX_LEGACY_LINES ||
    lines.some((l) => l.length > MAX_LEGACY_LINE_LENGTH)
  ) {
    return { ok: false, error: "Lista de linhas legadas excede o tamanho máximo permitido" };
  }
  return { ok: true, value: lines };
}
