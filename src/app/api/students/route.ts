import { NextResponse } from "next/server";
import { getStoredStudents, saveStudent } from "@/lib/storage";
import { dbGetStudents, dbSaveStudent } from "@/lib/db";

export async function GET() {
  try {
    const dbStudents = await dbGetStudents();
    if (dbStudents) {
      return NextResponse.json(dbStudents);
    }
  } catch (err) {
    console.warn("[API/students] Fallback para storage local:", err);
  }

  const students = getStoredStudents();
  return NextResponse.json(students);
}

export async function POST(req: Request) {
  try {
    const student = await req.json();
    saveStudent(student);

    try {
      await dbSaveStudent(student);
    } catch (dbErr) {
      console.warn("[API/students] Falha ao persistir no DB:", dbErr);
    }

    return NextResponse.json({ success: true, student });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Falha ao salvar aluno" }, { status: 400 });
  }
}
