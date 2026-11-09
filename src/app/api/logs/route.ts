import { NextResponse } from "next/server";
import { getStoredLogs, addCommandLog } from "@/lib/storage";
import { dbGetLogs, dbAddLog, isDbConnected } from "@/lib/db";
import { parseJsonBody, validateCommandLog } from "@/lib/validate";
import { requireTeacherAuth } from "@/lib/auth";
import { findRegisteredStudent, normalizeName } from "@/lib/serverLookup";

// GET /api/logs → SÓ professor (S3). O fluxo do aluno só ESCREVE logs;
// quem os lê é o painel.
export async function GET(req: Request) {
  const auth = requireTeacherAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (isDbConnected()) {
    const dbLogs = await dbGetLogs();
    if (dbLogs === null) {
      return NextResponse.json(
        { error: "Falha ao ler os logs do banco" },
        { status: 502, headers: { "x-gitsim-persistence": "db-error" } },
      );
    }
    return NextResponse.json(dbLogs, { headers: { "x-gitsim-persistence": "db" } });
  }
  return NextResponse.json(getStoredLogs(), {
    headers: { "x-gitsim-persistence": "memory" },
  });
}

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const validated = validateCommandLog(parsed.data);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const log = validated.value;

  // Anti-personificação: o log só é aceito se o studentId for de um
  // aluno REGISTRADO com o mesmo nome e a mesma turma (antes, qualquer
  // POST personificava qualquer aluno). Aluno não registrado, nome
  // divergente ou turma divergente: 400 e nada é escrito.
  // Resíduo honesto: registrar uma identidade NOVA e logar como ela
  // continua possível (o registro aparece como linha de aluno no painel
  // — não é personificação de colega, e não altera nota de ninguém).
  // O fluxo legítimo sempre registra o aluno no login, antes de qualquer
  // comando — um log que chegue antes do registro é rejeitado, não
  // enfileirado (o cliente só loga em warning; o comando em si não é
  // afetado).
  const lookup = await findRegisteredStudent(log.studentId);
  if ("dbFailed" in lookup && lookup.dbFailed) {
    return NextResponse.json(
      { error: "Falha ao verificar o aluno no banco" },
      { status: 502 },
    );
  }
  if (
    !lookup.found ||
    normalizeName(lookup.student.name) !== normalizeName(log.studentName) ||
    lookup.student.turma !== log.turma
  ) {
    return NextResponse.json(
      { error: "Log rejeitado: aluno não registrado com este nome e turma" },
      { status: 400 },
    );
  }

  try {
    // P2 — banco antes da memória (ver repository/route.ts).
    if (isDbConnected()) {
      const dbOk = await dbAddLog(log);
      if (!dbOk) {
        return NextResponse.json(
          { error: "Falha ao persistir o log no banco" },
          { status: 502 },
        );
      }
    }
    addCommandLog(log);

    return NextResponse.json({
      success: true,
      log,
      persistedIn: isDbConnected() ? "db" : "memory",
    });
  } catch (error) {
    console.error("[API/logs] Falha ao registrar log:", error);
    return NextResponse.json({ error: "Falha ao registrar log" }, { status: 500 });
  }
}
