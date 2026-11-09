import { NextResponse } from "next/server";
import { getStoredStudents, saveStudent } from "@/lib/storage";
import { dbGetStudents, dbSaveStudent, isDbConnected } from "@/lib/db";
import { parseJsonBody, validateStudent } from "@/lib/validate";
import { computeScore } from "@/lib/gitEngine";
import { requireTeacherAuth } from "@/lib/auth";
import { findRegisteredStudent, normalizeName } from "@/lib/serverLookup";

// GET /api/students → SÓ professor (S3). O fluxo do aluno não precisa
// desta lista: o próprio progresso vive no localStorage dele e o crédito
// do push é resolvido no servidor (rota /api/git/push).
export async function GET(req: Request) {
  const auth = requireTeacherAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (isDbConnected()) {
    const dbStudents = await dbGetStudents();
    if (dbStudents === null) {
      return NextResponse.json(
        { error: "Falha ao ler os alunos do banco" },
        { status: 502, headers: { "x-gitsim-persistence": "db-error" } },
      );
    }
    return NextResponse.json(dbStudents, { headers: { "x-gitsim-persistence": "db" } });
  }
  return NextResponse.json(getStoredStudents(), {
    headers: { "x-gitsim-persistence": "memory" },
  });
}

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const validated = validateStudent(parsed.data);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const incoming = validated.value;

  // S2 — a nota NUNCA mais é entrada: o campo 'score' do cliente é
  // ignorado e a nota é recalculada no servidor a partir dos passos e
  // dos componentes (mesma fórmula do cliente — computeScore, teto 100).
  // Um POST com score 999999 passa a persistir a nota dos passos (ex.:
  // clone+edit+commit = 50), não 999999.
  // Resíduo honesto: os PASSOS (hasCloned etc.) continuam afirmados pelo
  // cliente — o servidor não tem como provar cada passo sem reescrever
  // o motor no servidor. O que fechou: nota arbitrária, e (abaixo) o
  // takeover de registro alheio e a troca de turma por reenvio.
  const serverStudent = {
    ...incoming,
    score: computeScore(incoming),
  };

  // S2 — upsert vinculado à identidade de origem: um id já registrado
  // NÃO muda de turma nem de nome por reenvio (antes, o mesmo id com
  // turma 202 sobrescrevia o registro da 201). Divergência: 409 e nada
  // é escrito. Aluno novo: cria com a turma enviada.
  const existing = await findRegisteredStudent(incoming.id);
  if ("dbFailed" in existing && existing.dbFailed) {
    return NextResponse.json(
      { error: "Falha ao verificar o aluno no banco" },
      { status: 502 },
    );
  }
  if (existing.found) {
    if (
      existing.student.turma !== incoming.turma ||
      normalizeName(existing.student.name) !== normalizeName(incoming.name)
    ) {
      return NextResponse.json(
        { error: "Aluno já registrado com outro nome ou turma" },
        { status: 409 },
      );
    }
    // Preserva o createdAt de origem (o cliente reenvia o dele, mas a
    // origem registrada é a fonte).
    serverStudent.createdAt = existing.student.createdAt;
  }

  try {
    // P2 — banco antes da memória (ver repository/route.ts).
    if (isDbConnected()) {
      const dbOk = await dbSaveStudent(serverStudent);
      if (!dbOk) {
        return NextResponse.json(
          { error: "Falha ao persistir o aluno no banco" },
          { status: 502 },
        );
      }
    }
    saveStudent(serverStudent);

    return NextResponse.json({
      success: true,
      student: serverStudent,
      persistedIn: isDbConnected() ? "db" : "memory",
    });
  } catch (error) {
    console.error("[API/students] Falha ao salvar aluno:", error);
    return NextResponse.json({ error: "Falha ao salvar aluno" }, { status: 500 });
  }
}
