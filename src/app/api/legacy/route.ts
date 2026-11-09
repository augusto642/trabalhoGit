import { NextResponse } from "next/server";
import { getLegacyLines, saveLegacyLines } from "@/lib/storage";
import { dbGetLegacyLines, dbSaveLegacyLines, isDbConnected } from "@/lib/db";
import { parseJsonBody, validateLegacyLines } from "@/lib/validate";
import { requireTeacherAuth } from "@/lib/auth";

// Linhas da chamada antiga sem turma reconhecível. Só o painel do
// professor as exibe; nenhum fluxo do aluno as lê. GET e POST agora
// exigem token/senha do professor (S3/S6): antes, qualquer POST
// sobrescrevia as linhas legadas sem auth.
export async function GET(req: Request) {
  const auth = requireTeacherAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (isDbConnected()) {
    const dbLines = await dbGetLegacyLines();
    if (dbLines === null) {
      return NextResponse.json(
        { error: "Falha ao ler as linhas legadas do banco" },
        { status: 502, headers: { "x-gitsim-persistence": "db-error" } },
      );
    }
    return NextResponse.json(
      { lines: dbLines },
      { headers: { "x-gitsim-persistence": "db" } },
    );
  }
  return NextResponse.json(
    { lines: getLegacyLines() },
    { headers: { "x-gitsim-persistence": "memory" } },
  );
}

export async function POST(req: Request) {
  const auth = requireTeacherAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const validated = validateLegacyLines(parsed.data);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const lines = validated.value;

  try {
    // P2 — banco antes da memória (ver repository/route.ts).
    if (isDbConnected()) {
      const dbOk = await dbSaveLegacyLines(lines);
      if (!dbOk) {
        return NextResponse.json(
          { error: "Falha ao persistir as linhas legadas no banco" },
          { status: 502 },
        );
      }
    }
    saveLegacyLines(lines);

    return NextResponse.json({
      success: true,
      lines,
      persistedIn: isDbConnected() ? "db" : "memory",
    });
  } catch (error) {
    console.error("[API/legacy] Falha ao salvar linhas legadas:", error);
    return NextResponse.json({ error: "Falha ao salvar linhas legadas" }, { status: 500 });
  }
}
