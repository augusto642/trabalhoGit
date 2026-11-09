import { NextResponse } from "next/server";
import {
  resetAllData,
  getStoredRepositories,
  getStoredStudents,
  getStoredLogs,
  getLegacyLines,
} from "@/lib/storage";
import {
  dbResetAll,
  dbGetRepositories,
  dbGetStudents,
  dbGetLogs,
  dbGetLegacyLines,
  isDbConnected,
} from "@/lib/db";
import { requireTeacherAuth } from "@/lib/auth";
import { recordAudit, saveResetSnapshot } from "@/lib/audit";

// POST /api/reset não recebe corpo: o chamador atual envia POST sem body,
// então não há JSON a validar aqui. A proteção é a auth (abaixo) + o
// retorno honesto: sucesso só se o reset realmente ocorreu.
//
// Correção de segurança (30/10/2026, P4/P5): ANTES de apagar, o servidor
// tira um snapshot (repositórios das duas turmas, alunos, linhas legadas
// e logs) e o guarda fora do alcance do reset — recuperável depois pela
// rota /api/teacher/snapshot, com token do professor. A auditoria do
// servidor também sobrevive ao reset (não é apagada por resetAllData nem
// por dbResetAll). Se o snapshot falhar com banco ligado, o reset ABORTA
// (502) em vez de apagar sem volta.
export async function POST(req: Request) {
  const auth = requireTeacherAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    // 1. Snapshot pré-reset (fonte: banco quando ligado, memória senão).
    let snapshot;
    if (isDbConnected()) {
      const [repos, students, logs, legacyLines] = await Promise.all([
        dbGetRepositories(),
        dbGetStudents(),
        dbGetLogs(),
        dbGetLegacyLines(),
      ]);
      if (!repos || students === null || logs === null || legacyLines === null) {
        return NextResponse.json(
          { error: "Falha ao ler os dados do banco para o snapshot pré-reset; reset abortado" },
          { status: 502 },
        );
      }
      snapshot = {
        takenAt: new Date().toISOString(),
        repositories: repos,
        students,
        legacyLines,
        logs,
      };
    } else {
      snapshot = {
        takenAt: new Date().toISOString(),
        repositories: getStoredRepositories(),
        students: getStoredStudents(),
        legacyLines: getLegacyLines(),
        logs: getStoredLogs(),
      };
    }
    const snapshotOk = await saveResetSnapshot(snapshot);
    if (!snapshotOk) {
      return NextResponse.json(
        { error: "Falha ao guardar o snapshot pré-reset; reset abortado" },
        { status: 502 },
      );
    }

    // 2. Reset de fato.
    resetAllData();

    // dbResetAll() retorna false quando NENHUM provedor de banco está
    // configurado (modo local) — isso não é falha: nesse modo o reset
    // local acima já é o reset real. Só é falha (500) quando há banco
    // conectado e o reset nele não ocorreu.
    if (isDbConnected()) {
      const dbOk = await dbResetAll();
      if (!dbOk) {
        return NextResponse.json(
          { error: "Falha ao resetar os dados no banco" },
          { status: 500 },
        );
      }
    }

    // 3. Auditoria (depois do reset, para sobreviver a ele).
    await recordAudit({
      action: "reset",
      actor: "professor",
      detail: `reset global; snapshot em ${snapshot.takenAt}`,
    });

    return NextResponse.json({
      success: true,
      message: "Todos os dados foram restaurados para o padrão.",
      snapshotTakenAt: snapshot.takenAt,
    });
  } catch (err) {
    console.error("[API/reset] Falha ao resetar dados:", err);
    return NextResponse.json(
      { error: "Falha ao resetar os dados" },
      { status: 500 },
    );
  }
}
