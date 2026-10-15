import { NextResponse } from "next/server";
import { pushCommitToRepo, getStoredStudents, saveStudent } from "@/lib/storage";
import { dbGetRepository, dbSaveRepository, dbGetStudents, dbSaveStudent } from "@/lib/db";
import { Commit, Repository } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const { commit, updatedFiles, studentId } = await req.json();

    if (!commit || !updatedFiles) {
      return NextResponse.json({ success: false, error: "Dados de commit inválidos" }, { status: 400 });
    }

    // 1. Atualiza no storage local/memória
    const updatedRepo = pushCommitToRepo(commit, updatedFiles);

    // 2. Tenta atualizar no banco de dados serverless compartilhado
    try {
      const dbRepo = await dbGetRepository();
      const currentRepo: Repository = dbRepo || updatedRepo;
      const newRepo: Repository = {
        ...currentRepo,
        files: { ...currentRepo.files, ...updatedFiles },
        commits: [commit, ...currentRepo.commits.filter((c) => c.id !== commit.id)],
        updatedAt: new Date().toISOString(),
      };
      await dbSaveRepository(newRepo);

      if (studentId) {
        const students = (await dbGetStudents()) || getStoredStudents();
        const student = students.find((s) => s.id === studentId);
        if (student) {
          student.hasPushed = true;
          student.score = 100;
          await dbSaveStudent(student);
        }
      }
    } catch (dbErr) {
      console.warn("[API/git/push] Falha ao persistir no DB:", dbErr);
    }

    // Se informou studentId, atualiza status do aluno localmente
    if (studentId) {
      const students = getStoredStudents();
      const student = students.find((s) => s.id === studentId);
      if (student) {
        student.hasPushed = true;
        student.score = 100;
        saveStudent(student);
      }
    }

    return NextResponse.json({ success: true, repository: updatedRepo });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Erro ao processar push" }, { status: 500 });
  }
}
