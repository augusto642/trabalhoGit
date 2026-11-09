import { NextResponse } from "next/server";
import {
  getStoredRepositories,
  getStoredRepository,
  saveRepository,
  mergeRepository,
  removeStudentContributions,
} from "@/lib/storage";
import {
  dbGetRepositories,
  dbGetRepository,
  dbSaveRepository,
  isDbConnected,
} from "@/lib/db";
import { parseJsonBody, validateRepository } from "@/lib/validate";
import { isKnownTurma, repositoryTurmaOf } from "@/lib/initialData";
import { requireTeacherAuth } from "@/lib/auth";
import { findRegisteredStudent, normalizeName } from "@/lib/serverLookup";
import { clientIp, pruneAllowed } from "@/lib/rateLimit";
import { recordAudit } from "@/lib/audit";

// GET /api/repository?turma=201 → o repositório da turma (fluxo do aluno:
// aberto, pois o aluno não tem conta — resíduo S3 documentado: qualquer
// um que saiba a turma lê o repo DELA; o que fechou foi o mapa das duas
// turmas juntas, as listas de alunos, os logs e os legados).
// GET /api/repository (sem turma) → SÓ professor (token/senha).
export async function GET(req: Request) {
  const turma = new URL(req.url).searchParams.get("turma");

  if (turma !== null) {
    if (!isKnownTurma(turma)) {
      return NextResponse.json({ error: "Parâmetro 'turma' deve ser '201' ou '202'" }, { status: 400 });
    }
    if (isDbConnected()) {
      const dbRepo = await dbGetRepository(turma);
      if (!dbRepo) {
        // Banco ligado e leitura falhou/nula: erro visível (P2), nunca
        // sucesso silencioso com a memória desta instância.
        return NextResponse.json(
          { error: "Falha ao ler o repositório do banco" },
          { status: 502, headers: { "x-gitsim-persistence": "db-error" } },
        );
      }
      return NextResponse.json(dbRepo, { headers: { "x-gitsim-persistence": "db" } });
    }
    return NextResponse.json(getStoredRepository(turma), {
      headers: { "x-gitsim-persistence": "memory" },
    });
  }

  // Mapa das duas turmas: dado de professor (S3).
  const auth = requireTeacherAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (isDbConnected()) {
    const dbRepos = await dbGetRepositories();
    if (!dbRepos) {
      return NextResponse.json(
        { error: "Falha ao ler os repositórios do banco" },
        { status: 502, headers: { "x-gitsim-persistence": "db-error" } },
      );
    }
    return NextResponse.json(
      { repositories: dbRepos },
      { headers: { "x-gitsim-persistence": "db" } },
    );
  }
  return NextResponse.json(
    { repositories: getStoredRepositories() },
    { headers: { "x-gitsim-persistence": "memory" } },
  );
}

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  // Campo opcional do fluxo Reiniciar (só ele remove): o nome do aluno
  // cujas contribuições devem ser podadas. O validateRepository abaixo
  // ignora campos extras, então ele é lido aqui do corpo cru — e NUNCA
  // entra no objeto salvo (mergeRepository constrói só os campos do
  // Repository). Sem este campo, o POST é merge puro e nunca apaga.
  const raw = parsed.data as Record<string, unknown>;
  const pruneStudent =
    typeof raw.pruneStudent === "string" && raw.pruneStudent.trim()
      ? raw.pruneStudent.trim()
      : null;
  const pruneStudentId =
    typeof raw.pruneStudentId === "string" && raw.pruneStudentId.trim()
      ? raw.pruneStudentId.trim()
      : null;

  const validated = validateRepository(parsed.data);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const body = validated.value;
  const turma = repositoryTurmaOf(body);
  if (!turma) {
    return NextResponse.json({ error: "Repositório sem turma conhecida" }, { status: 400 });
  }

  // S1 — prune autorizado SÓ por (a) token/senha do professor OU (b)
  // auto-poda: pruneStudentId de um aluno REGISTRADO cujo nome (normalizado)
  // é o podado e cuja turma é a do repositório. Sem um dos dois: 403 e
  // NADA é podado (antes, qualquer POST sem auth podava qualquer aluno).
  // Resíduo honesto: sem conta de aluno, "próprio aluno" = "quem alega
  // o id registrado". O que fecha o vetor antigo: (1) o nome sozinho
  // não basta mais; (2) os ids não são mais listados para o aluno (S3),
  // então o id do colega não está na API do fluxo dele — só no
  // localStorage do próprio colega. Quem adivinhar um id
  // (student-<milissegundo>) ainda pode alegá-lo: o fechamento total
  // exige identidade de aluno, que a tarefa proíbe inventar.
  let pruneActor: string | null = null;
  if (pruneStudent) {
    if (!pruneAllowed(clientIp(req))) {
      return NextResponse.json(
        { error: "Muitas podas em sequência — aguarde um minuto" },
        { status: 429 },
      );
    }
    const teacher = requireTeacherAuth(req);
    if (teacher.ok) {
      pruneActor = "professor";
    } else {
      if (!pruneStudentId) {
        return NextResponse.json(
          { error: "Poda exige token do professor ou identificação do próprio aluno" },
          { status: 403 },
        );
      }
      const lookup = await findRegisteredStudent(pruneStudentId);
      if ("dbFailed" in lookup && lookup.dbFailed) {
        return NextResponse.json(
          { error: "Falha ao verificar o aluno no banco" },
          { status: 502 },
        );
      }
      if (
        !lookup.found ||
        normalizeName(lookup.student.name) !== normalizeName(pruneStudent) ||
        lookup.student.turma !== turma
      ) {
        return NextResponse.json(
          { error: "Poda permitida só para o próprio aluno ou para o professor" },
          { status: 403 },
        );
      }
      pruneActor = `aluno:${lookup.student.name}`;
    }
  }

  try {
    // D-NOVO-1: o snapshot é MESCLADO com o estado atual (união de
    // commits, união de linhas na chamada.txt). A seção memória é
    // síncrona (leitura + merge + escrita sem await no meio), portanto
    // atômica no event loop do Node — a corrida lógica morre aqui.
    // O Reiniciar poda DEPOIS do merge, sobre o estado fresco.
    const mergedMemory = pruneStudent
      ? removeStudentContributions(mergeRepository(getStoredRepository(turma), body), pruneStudent)
      : mergeRepository(getStoredRepository(turma), body);

    // P2 — com banco ligado, o banco é escrito ANTES da memória: se ele
    // falhar, nada é salvo em memória e a resposta é 502 (antes, o
    // POST retornava success:true com a memória desta instância).
    // Sem banco, a memória é o único store e o merge acima é o real.
    if (isDbConnected()) {
      const dbCurrent = await dbGetRepository(turma);
      if (!dbCurrent) {
        return NextResponse.json(
          { error: "Falha ao ler o repositório do banco" },
          { status: 502 },
        );
      }
      const dbMerged = mergeRepository(dbCurrent, body);
      const dbFinal = pruneStudent
        ? removeStudentContributions(dbMerged, pruneStudent)
        : dbMerged;
      const dbOk = await dbSaveRepository(dbFinal);
      if (!dbOk) {
        return NextResponse.json(
          { error: "Falha ao persistir o repositório no banco" },
          { status: 502 },
        );
      }
    }
    saveRepository(mergedMemory);

    if (pruneStudent && pruneActor) {
      await recordAudit({
        action: "prune",
        actor: pruneActor,
        turma,
        detail: `poda de ${pruneStudent}`,
      });
    }

    return NextResponse.json({
      success: true,
      repository: mergedMemory,
      persistedIn: isDbConnected() ? "db" : "memory",
    });
  } catch (error) {
    console.error("[API/repository] Falha ao salvar repositório:", error);
    return NextResponse.json({ error: "Falha ao salvar repositório" }, { status: 500 });
  }
}
