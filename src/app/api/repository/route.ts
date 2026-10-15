import { NextResponse } from "next/server";
import { getStoredRepository, saveRepository } from "@/lib/storage";
import { dbGetRepository, dbSaveRepository } from "@/lib/db";

export async function GET() {
  try {
    const dbRepo = await dbGetRepository();
    if (dbRepo) {
      return NextResponse.json(dbRepo);
    }
  } catch (err) {
    console.warn("[API/repository] Fallback para storage local:", err);
  }

  const repo = getStoredRepository();
  return NextResponse.json(repo);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    saveRepository(body);

    try {
      await dbSaveRepository(body);
    } catch (dbErr) {
      console.warn("[API/repository] Falha ao persistir no DB:", dbErr);
    }

    return NextResponse.json({ success: true, repository: body });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Falha ao salvar repositório" }, { status: 400 });
  }
}
