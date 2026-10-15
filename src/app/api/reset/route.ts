import { NextResponse } from "next/server";
import { resetAllData } from "@/lib/storage";
import { dbResetAll } from "@/lib/db";

export async function POST() {
  resetAllData();
  try {
    await dbResetAll();
  } catch (err) {
    console.warn("[API/reset] Falha ao resetar DB:", err);
  }

  return NextResponse.json({ success: true, message: "Todos os dados foram restaurados para o padrão." });
}
