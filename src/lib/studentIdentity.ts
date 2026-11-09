import type { Student } from "./types";

/**
 * Identidade do aluno na identificação (modal) — correção F1.
 *
 * O modal montava um `Student` novo do zero, copiando só id, nome,
 * turma, passos básicos e contadores. Quem já estava identificado e
 * clicava no próprio nome na Navbar (re-identificação) perdia
 * silenciosamente `masteredConcepts`, `diagnosticCommands`,
 * `unaidedScore` e os flags da Aula 2 — até 10 pts num recompute
 * futuro, porque o POST /api/students recalcula a nota do registro
 * enviado. O caminho "Sair" nunca teve o problema: ele zera o aluno
 * corrente antes, então o próximo identificado sempre ganha registro
 * novo (e o modal não tinha nada para preservar).
 *
 * Regra aqui — "mesmo aluno" é o mesmo nome e a mesma turma:
 * - mesmo aluno → preserva TUDO do registro existente (spread) e só
 *   atualiza nome/turma digitados e lastActive;
 * - aluno diferente (ou sem aluno corrente) → registro novo e zerado,
 *   com id novo: nunca herda o id nem o progresso do aluno anterior
 *   (antes, um nome diferente herdava o id do aluno corrente e o POST
 *   caía no 409 da trava de nome/turma do servidor, sem persistir).
 *
 * A comparação de nome usa a regra do servidor — minúsculas, espaços
 * colapsados (espelha `normalizeName` de serverLookup.ts, usada na
 * trava do POST /api/students): "  MARIA  da  Silva " é a mesma aluna
 * que "Maria da Silva". Homônimos (mesmo nome + mesma turma) continuam
 * indistinguíveis — resíduo documentado, fora desta correção.
 */
const normalizeStudentName = (s: string): string =>
  s.toLowerCase().replace(/\s+/g, " ").trim();

export function isSameStudentIdentity(
  currentStudent: Student | null | undefined,
  name: string,
  turma: string,
): currentStudent is Student {
  if (!currentStudent) return false;
  return (
    normalizeStudentName(name) === normalizeStudentName(currentStudent.name) &&
    turma === currentStudent.turma
  );
}

export function buildIdentifiedStudent(
  currentStudent: Student | null | undefined,
  name: string,
  turma: "201" | "202",
): Student {
  const fullName = name.trim().replace(/\s+/g, " ");
  const now = new Date().toISOString();

  if (isSameStudentIdentity(currentStudent, fullName, turma)) {
    // Re-identificação do MESMO aluno: o spread preserva id, createdAt,
    // passos, contadores, nota, masteredConcepts, diagnosticCommands,
    // unaidedScore e os flags da Aula 2 — e também o campo legado
    // `recoveredErrorConcepts`, se o registro ainda o trouxer (o
    // servidor faz a união dele na validação do POST).
    return {
      ...currentStudent,
      name: fullName,
      turma,
      lastActive: now,
    };
  }

  return {
    id: `student-${Date.now()}`,
    name: fullName,
    turma,
    hasCloned: false,
    hasEdited: false,
    hasCommitted: false,
    hasPushed: false,
    score: 0,
    totalCommands: 0,
    errorCommands: 0,
    createdAt: now,
    lastActive: now,
  };
}
