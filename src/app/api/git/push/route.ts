import { NextResponse } from "next/server";
import { pushCommitToRepo, getStoredStudents, getStoredRepository, saveStudent, mergeRepoFiles, applyPushDeletions } from "@/lib/storage";
import { computeScore, lineContainsFullName } from "@/lib/gitEngine";
import { dbGetRepository, dbSaveRepository, dbGetStudents, dbSaveStudent, isDbConnected } from "@/lib/db";
import { Repository, Student } from "@/lib/types";
import { parseJsonBody, validatePush } from "@/lib/validate";
import { isKnownTurma } from "@/lib/initialData";
import { recordAudit } from "@/lib/audit";

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const validated = validatePush(parsed.data);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  // A turma vem validada (e igual ao authorTurma do commit): o push só
  // lê e escreve o repositório dessa turma — nunca o da outra.
  const { commit, updatedFiles, turma, studentId, deletedFiles } = validated.value;

  // R2 — resolve o aluno ANTES de qualquer escrita, nas duas fontes
  // (banco, quando disponível, e storage local). Se qualquer registro
  // resolvido tem turma conhecida divergente da do push, a requisição
  // é forjada (ex.: studentId da 202 + push na 201): 400 e NADA é
  // escrito em nenhum caminho. Aluno não resolvido (sem studentId ou
  // id desconhecido) segue o comportamento anterior: o envio é válido
  // como git e escreve no repositório, mas ninguém é marcado — não há
  // fluxo legítimo sem aluno identificado (o cliente sempre envia o
  // id do aluno identificado), só id forjado ou obsoleto.
  // P2: com banco ligado, falha de leitura do banco é 502 visível (antes,
  // o catch só avisava e o push seguia com a memória da instância).
  let resolvedStudent: Student | null = null;
  let dbStudentsList: Student[] | null = null;
  if (studentId) {
    const candidates: Student[] = [];
    if (isDbConnected()) {
      const dbStudents = await dbGetStudents();
      if (dbStudents === null) {
        return NextResponse.json(
          { error: "Falha ao ler os alunos do banco" },
          { status: 502 },
        );
      }
      dbStudentsList = dbStudents;
      candidates.push(...dbStudents);
    }
    candidates.push(...getStoredStudents());
    const matches = candidates.filter((s) => s.id === studentId);
    if (matches.some((s) => isKnownTurma(s.turma) && s.turma !== turma)) {
      return NextResponse.json(
        { error: "Aluno resolvido pertence a outra turma" },
        { status: 400 },
      );
    }
    resolvedStudent = matches[0] ?? null;
  }

  try {
    // Candidato SEM salvar ainda: o crédito R1 e a escrita no banco são
    // calculados sobre este estado; a memória só é escrita depois que
    // o banco (quando ligado) aceitou — P2, sem success:true com dado
    // que nunca chegou ao banco.
    const memoryRepo = getStoredRepository(turma);
    const candidateRepo: Repository = {
      ...memoryRepo,
      files: applyPushDeletions(mergeRepoFiles(memoryRepo.files, updatedFiles), deletedFiles ?? []),
      commits: [commit, ...memoryRepo.commits.filter((c) => c.id !== commit.id)],
      updatedAt: new Date().toISOString(),
    };

    // R1 — o crédito do passo de push/conclusão só vem quando o commit
    // inclui o chamada.txt E a lista resultante da turma contém o nome
    // completo do aluno. Sem aluno resolvido, não há ninguém a marcar.
    const touchesChamada = commit.filesChanged.some((f) => {
      const base = f.replace(/^\.\//, "").split("/").pop();
      return base === "chamada.txt";
    });
    const countsForCompletion =
      resolvedStudent !== null &&
      touchesChamada &&
      lineContainsFullName(
        candidateRepo.files["chamada.txt"] ?? "",
        resolvedStudent.name,
      );

    // 1. Banco primeiro (quando ligado). Sem banco, este bloco é pulado
    // e a memória abaixo é o store real.
    if (isDbConnected()) {
      const dbRepo = await dbGetRepository(turma);
      if (!dbRepo) {
        return NextResponse.json(
          { error: "Falha ao ler o repositório do banco" },
          { status: 502 },
        );
      }
      const newRepo: Repository = {
        ...dbRepo,
        // Mesmo merge por linhas da chamada.txt que pushCommitToRepo aplica
        // no storage local — sem ele, o caminho do banco sobrescreveria
        // os nomes dos colegas (o bug original, só em outro lugar).
        // Exclusões propagam igual (exceto chamada.txt, protegida).
        files: applyPushDeletions(mergeRepoFiles(dbRepo.files, updatedFiles), deletedFiles ?? []),
        commits: [commit, ...dbRepo.commits.filter((c) => c.id !== commit.id)],
        updatedAt: new Date().toISOString(),
      };
      const repoOk = await dbSaveRepository(newRepo);
      if (!repoOk) {
        return NextResponse.json(
          { error: "Falha ao persistir o push no banco" },
          { status: 502 },
        );
      }

      if (studentId && countsForCompletion && dbStudentsList) {
        const student = dbStudentsList.find((s) => s.id === studentId);
        if (student) {
          student.hasPushed = true;
          student.score = computeScore(student);
          const studentOk = await dbSaveStudent(student);
          if (!studentOk) {
            // Repositório já persistido acima; o erro é visível (502)
            // em vez de success:true com crédito perdido em silêncio.
            return NextResponse.json(
              { error: "Push persistido, mas falha ao persistir o crédito no banco" },
              { status: 502 },
            );
          }
        }
      }
    }

    // 2. Memória (só depois do banco, quando ligado).
    // O envio em si é sempre válido como git — o gate R1 abaixo retém
    // só o crédito do passo, nunca o envio.
    const updatedRepo = pushCommitToRepo(commit, updatedFiles, turma, deletedFiles ?? []);

    // Se informou studentId, atualiza status do aluno localmente —
    // só quando o gate R1 passou.
    if (studentId && countsForCompletion) {
      const students = getStoredStudents();
      const student = students.find((s) => s.id === studentId);
      if (student) {
        student.hasPushed = true;
        student.score = computeScore(student);
        saveStudent(student);
      }
    }

    // Auditoria do servidor (não é o log do cliente): quem deu push, em
    // que turma, qual commit, e se contou para a conclusão.
    await recordAudit({
      action: "push",
      actor: resolvedStudent ? resolvedStudent.name : "aluno não identificado",
      turma,
      detail: `commit ${commit.id}${countsForCompletion ? " (conta para conclusão)" : ""}`,
    });

    return NextResponse.json({
      success: true,
      repository: updatedRepo,
      countsForCompletion,
      persistedIn: isDbConnected() ? "db" : "memory",
    });
  } catch (error) {
    console.error("[API/git/push] Erro ao processar push:", error);
    return NextResponse.json({ error: "Erro ao processar push" }, { status: 500 });
  }
}
