import { NextResponse } from "next/server";
import { requireTeacherAuth } from "@/lib/auth";
import { getResetSnapshot } from "@/lib/audit";

/**
 * GET /api/teacher/snapshot — o snapshot tirado ANTES do último reset
 * global (ver /api/reset). SÓ com token/senha do professor. Sem reset
 * anterior: 404. É a volta após um reset acidental: o professor baixa o
 * JSON e tem as duas chamadas + alunos + logs de antes do reset.
 */
export async function GET(req: Request) {
  const auth = requireTeacherAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const snapshot = await getResetSnapshot();
    if (!snapshot) {
      return NextResponse.json(
        { error: "Nenhum snapshot pré-reset disponível" },
        { status: 404 },
      );
    }
    return NextResponse.json({ snapshot });
  } catch (err) {
    console.error("[API/teacher/snapshot] Falha ao ler snapshot:", err);
    return NextResponse.json(
      { error: "Falha ao ler o snapshot" },
      { status: 502 },
    );
  }
}
