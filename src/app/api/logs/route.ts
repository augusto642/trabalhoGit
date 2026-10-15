import { NextResponse } from "next/server";
import { getStoredLogs, addCommandLog } from "@/lib/storage";
import { dbGetLogs, dbAddLog } from "@/lib/db";

export async function GET() {
  try {
    const dbLogs = await dbGetLogs();
    if (dbLogs) {
      return NextResponse.json(dbLogs);
    }
  } catch (err) {
    console.warn("[API/logs] Fallback para storage local:", err);
  }

  const logs = getStoredLogs();
  return NextResponse.json(logs);
}

export async function POST(req: Request) {
  try {
    const log = await req.json();
    addCommandLog(log);

    try {
      await dbAddLog(log);
    } catch (dbErr) {
      console.warn("[API/logs] Falha ao persistir log no DB:", dbErr);
    }

    return NextResponse.json({ success: true, log });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Falha ao registrar log" }, { status: 400 });
  }
}
