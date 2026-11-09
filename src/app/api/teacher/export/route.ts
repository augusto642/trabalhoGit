import { NextResponse } from "next/server";
import { requireTeacherAuth } from "@/lib/auth";
import { getStoredRepositories, getStoredStudents, getLegacyLines } from "@/lib/storage";
import {
  dbGetRepositories,
  dbGetStudents,
  dbGetLegacyLines,
  isDbConnected,
} from "@/lib/db";
import { getAuditEvents } from "@/lib/audit";

/**
 * GET /api/teacher/export — exportação do professor (P5): as duas
 * chamadas (chamada.txt por turma), a lista de alunos, as linhas legadas
 * e a auditoria do servidor, num único JSON para baixar antes do fim da
 * aula ou antes de um reset. SÓ com token/senha do professor — o aluno
 * não tem acesso a esta rota (e o GET de alunos/logs/legados também
 * fechou; ver S3).
 *
 * Com banco ligado, falha de leitura é 502 visível (P2), não um JSON
 * parcial com a memória da instância.
 */
export async function GET(req: Request) {
  const auth = requireTeacherAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    if (isDbConnected()) {
      const [repos, students, legacyLines] = await Promise.all([
        dbGetRepositories(),
        dbGetStudents(),
        dbGetLegacyLines(),
      ]);
      if (!repos || students === null || legacyLines === null) {
        return NextResponse.json(
          { error: "Falha ao ler os dados do banco para exportação" },
          { status: 502 },
        );
      }
      const audit = await getAuditEvents(500);
      return NextResponse.json({
        exportedAt: new Date().toISOString(),
        repositories: repos,
        students,
        legacyLines,
        audit,
        persistedIn: "db",
      });
    }

    const audit = await getAuditEvents(500);
    return NextResponse.json({
      exportedAt: new Date().toISOString(),
      repositories: getStoredRepositories(),
      students: getStoredStudents(),
      legacyLines: getLegacyLines(),
      audit,
      persistedIn: "memory",
    });
  } catch (err) {
    console.error("[API/teacher/export] Falha ao exportar:", err);
    return NextResponse.json(
      { error: "Falha ao exportar os dados" },
      { status: 502 },
    );
  }
}
