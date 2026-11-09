/**
 * Lookup de aluno registrado, nas duas fontes (banco quando ligado +
 * memória do processo). Usado pelas travas de segurança que dependem de
 * "este id existe e pertence a este nome/turma": prune próprio (S1),
 * trava de nome/turma do POST /api/students (S2) e anti-personificação
 * do POST /api/logs.
 *
 * Sem conta/senha de aluno, "registrado" é o máximo que o servidor pode
 * afirmar: o id existe na lista e o nome/turma conferem. Um atacante que
 * adivinhe o id de um colega ainda pode alegá-lo — por isso, junto com
 * o fechamento das leituras de professor (S3), os ids deixaram de ser
 * listados para o aluno: o id do colega não aparece mais na API do
 * fluxo do aluno (só o próprio, no localStorage dele). Resíduo
 * documentado no relatório; não mascarado.
 */

import { getStoredStudents } from "./storage";
import { dbGetStudents, isDbConnected } from "./db";
import type { Student } from "./types";

export const normalizeName = (s: string): string =>
  s.toLowerCase().replace(/\s+/g, " ").trim();

export type StudentLookup =
  | { found: true; student: Student }
  | { found: false }
  | { found: false; dbFailed: true };

export async function findRegisteredStudent(id: string): Promise<StudentLookup> {
  if (isDbConnected()) {
    const dbStudents = await dbGetStudents();
    if (dbStudents === null) return { found: false, dbFailed: true };
    const fromDb = dbStudents.find((s) => s.id === id);
    if (fromDb) return { found: true, student: fromDb };
  }
  const fromMemory = getStoredStudents().find((s) => s.id === id);
  if (fromMemory) return { found: true, student: fromMemory };
  return { found: false };
}

export async function listRegisteredStudents(): Promise<Student[] | null> {
  if (isDbConnected()) {
    const dbStudents = await dbGetStudents();
    if (dbStudents === null) return null;
    const memory = getStoredStudents();
    const seen = new Set(dbStudents.map((s) => s.id));
    return [...dbStudents, ...memory.filter((s) => !seen.has(s.id))];
  }
  return getStoredStudents();
}
