// Script de Teste Ponta a Ponta (E2E) para Produção - Git Simulador
//
// PRÉ-REQUISITOS (o script sobe o próprio servidor, mas NÃO o compila):
//   1. Build prévio: `npm run build`
//   2. Senha de TESTE descartável via ambiente (nunca commitar valores):
//      `TEACHER_PASSWORD=<senha-de-teste> npm run test:e2e`
//      O servidor herda o ambiente deste processo, então o `next start`
//      abaixo sobe com a mesma TEACHER_PASSWORD.
//   3. Porta 3005 livre (o servidor é `next start -p 3005`).
//
// CONTRATO DE SEGURANÇA TESTADO AQUI (não regrida) — correção 30/10/2026:
// - Rotas de PROFESSOR exigem token/senha: GET /api/repository (mapa das
//   duas turmas), GET/POST /api/students (GET), GET /api/logs, GET/POST
//   /api/legacy, GET /api/teacher/export, GET /api/teacher/snapshot e
//   POST /api/reset. Sem credencial -> 401; com a senha certa no verify
//   -> 200 + token (TTL 2h, desbloqueio ÚNICO); token inválido/expirado
//   -> 401. (Produção sem TEACHER_PASSWORD -> 503; por isso a senha é
//   obrigatória para rodar este script.)
// - Rotas do fluxo do ALUNO (POST /api/students, POST /api/logs com aluno
//   registrado, GET /api/repository?turma=, POST /api/repository sem prune,
//   POST /api/git/push) NÃO exigem senha de professor (são a própria aula)
//   e são protegidas por validação de schema (JSON inválido/tipos errados
//   -> 400), tetos de tamanho, nota recalculada no servidor (S2),
//   trava de nome/turma (S2) e anti-personificação de logs.
// - Prune (POST /api/repository com pruneStudent) exige token do professor
//   OU pruneStudentId do próprio aluno registrado (S1); sem isso -> 403.
import { spawn } from 'child_process';
import http from 'http';
import { createHmac } from 'node:crypto';

const PORT = 3005;
const BASE_URL = `http://127.0.0.1:${PORT}`;
// Senha de teste lida do ambiente; nunca hardcodear valores aqui.
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD;
const TEACHER_HEADER = { 'x-teacher-password': TEACHER_PASSWORD };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

// POST com corpo bruto (para testar JSON inválido: fetchJson sempre serializa
// um objeto válido, então não serve para esse caso).
async function fetchRaw(endpoint, rawBody, extraHeaders = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: rawBody,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function fetchHtml(endpoint) {
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url);
  const text = await res.text();
  return { status: res.status, ok: res.ok, html: text };
}

async function waitForServer(maxAttempts = 30) {
  process.stdout.write('Aguardando servidor subir');
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${BASE_URL}/`);
      if (res.status === 200) {
        console.log('\n✅ Servidor Next.js pronto e respondendo!');
        return true;
      }
    } catch (e) {
      // continua aguardando
    }
    process.stdout.write('.');
    await sleep(1000);
  }
  console.log('\n❌ Tempo esgotado aguardando servidor.');
  return false;
}

async function runE2ETests() {
  const testResults = [];
  function assert(title, condition, extra = '') {
    if (condition) {
      console.log(`  ✅ [PASS] ${title}`);
      testResults.push({ title, pass: true });
    } else {
      console.error(`  ❌ [FAIL] ${title} - ${extra}`);
      testResults.push({ title, pass: false, error: extra });
      throw new Error(`Falha no teste: ${title} (${extra})`);
    }
  }

  console.log('\n🚀 Iniciando Bateria de Testes E2E...\n');

  // Pré-condição (não conta como assert de produto): sem
  // TEACHER_PASSWORD o servidor de produção (NODE_ENV=production) responde
  // 503 no reset em vez de 401/200 — falhar explícito aqui em vez de gerar
  // falsos negativos nos testes de reset abaixo.
  if (!TEACHER_PASSWORD) {
    throw new Error('TEACHER_PASSWORD não definida: rode com TEACHER_PASSWORD=<senha-de-teste> npm run test:e2e');
  }

  // 1. TESTES DE PÁGINAS FRONTEND (SSR / HTML)
  console.log('📌 Testando Páginas Frontend:');
  
  const home = await fetchHtml('/');
  assert('GET / (Home) retorna status 200', home.status === 200);
  assert('GET / contém título ou contexto do simulador', home.html.includes('Git') || home.html.includes('Simulador'));

  const vscode = await fetchHtml('/vscode');
  assert('GET /vscode (Simulador VS Code) retorna status 200', vscode.status === 200);
  assert('GET /vscode renderiza interface com terminal', vscode.html.length > 500);

  const github = await fetchHtml('/github');
  assert('GET /github (Visualização GitHub) retorna status 200', github.status === 200);
  assert('GET /github renderiza elementos do repositório', github.html.length > 500);

  const professor = await fetchHtml('/professor');
  assert('GET /professor (Painel Docente) retorna status 200', professor.status === 200);
  assert('GET /professor renderiza métricas e painel', professor.html.length > 500);

  // 2. TESTES DE ENDPOINTS DA API REST
  console.log('\n📌 Testando Endpoints da API:');

  // Token do professor primeiro: os GETs de professor exigem auth (S3).
  const verifyEarlyRes = await fetchJson('/api/teacher/verify', {
    method: 'POST',
    body: JSON.stringify({ password: TEACHER_PASSWORD }),
  });
  assert('POST /api/teacher/verify com senha certa retorna 200 + token', verifyEarlyRes.status === 200 && typeof verifyEarlyRes.data?.token === 'string' && verifyEarlyRes.data.token.length > 0);
  const teacherToken = verifyEarlyRes.data.token;
  const teacherHeader = { 'x-teacher-token': teacherToken };

  // Sem token, os dados de professor fecham (S3).
  const repoNoAuthRes = await fetchJson('/api/repository');
  assert('GET /api/repository sem token retorna 401', repoNoAuthRes.status === 401);
  const studentsNoAuthRes = await fetchJson('/api/students');
  assert('GET /api/students sem token retorna 401', studentsNoAuthRes.status === 401);
  const logsNoAuthRes = await fetchJson('/api/logs');
  assert('GET /api/logs sem token retorna 401', logsNoAuthRes.status === 401);
  const legacyNoAuthRes = await fetchJson('/api/legacy');
  assert('GET /api/legacy sem token retorna 401', legacyNoAuthRes.status === 401);

  // GET /api/repository inicial: mapa com as duas turmas + forma única
  const repoRes = await fetchJson('/api/repository', { headers: teacherHeader });
  assert('GET /api/repository retorna status 200', repoRes.status === 200);
  assert('GET /api/repository retorna as duas turmas', Boolean(repoRes.data?.repositories?.['201'] && repoRes.data?.repositories?.['202']));
  assert('Repositório da 201 contém chamada.txt inicial', 'chamada.txt' in (repoRes.data?.repositories?.['201']?.files || {}));
  assert('Repositório da 202 contém chamada.txt inicial', 'chamada.txt' in (repoRes.data?.repositories?.['202']?.files || {}));
  const repo201Res = await fetchJson('/api/repository?turma=201');
  assert('GET /api/repository?turma=201 retorna o repositório da turma', repo201Res.status === 200 && repo201Res.data?.turma === '201');
  const repoTurmaInvalida = await fetchJson('/api/repository?turma=999');
  assert('GET /api/repository?turma=999 retorna 400', repoTurmaInvalida.status === 400);

  // POST /api/students
  const newStudent = {
    id: 'student-e2e-' + Date.now(),
    name: 'Ana Dev Silva E2E',
    turma: '201',
    hasCloned: true,
    hasEdited: true,
    hasCommitted: true,
    hasPushed: false,
    score: 75,
    totalCommands: 6,
    errorCommands: 0,
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
  };

  const createStudentRes = await fetchJson('/api/students', {
    method: 'POST',
    body: JSON.stringify(newStudent),
  });
  assert('POST /api/students cria novo aluno com sucesso', createStudentRes.status === 200 && createStudentRes.data?.success);
  assert('S2: score enviado (75) é ignorado — servidor recalcula dos passos (50)', createStudentRes.data?.student?.score === 50);

  // GET /api/students
  const listStudentsRes = await fetchJson('/api/students', { headers: teacherHeader });
  assert('GET /api/students retorna array de alunos', Array.isArray(listStudentsRes.data));
  const foundStudent = listStudentsRes.data.find((s) => s.id === newStudent.id);
  assert('Estudante criado está presente na listagem de alunos', Boolean(foundStudent && foundStudent.name === newStudent.name));

  // POST /api/logs
  const newLog = {
    id: 'log-e2e-' + Date.now(),
    studentId: newStudent.id,
    studentName: newStudent.name,
    turma: newStudent.turma,
    command: 'git commit -m "feat: assinatura da chamada"',
    output: '[main abc1234] feat: assinatura da chamada',
    isError: false,
    timestamp: new Date().toISOString(),
  };
  const createLogRes = await fetchJson('/api/logs', {
    method: 'POST',
    body: JSON.stringify(newLog),
  });
  assert('POST /api/logs registra comando executado com sucesso', createLogRes.status === 200 && createLogRes.data?.success);

  // GET /api/logs
  const listLogsRes = await fetchJson('/api/logs', { headers: teacherHeader });
  assert('GET /api/logs retorna histórico de comandos', Array.isArray(listLogsRes.data));
  const foundLog = listLogsRes.data.find((l) => l.id === newLog.id || l.studentId === newStudent.id);
  assert('Log do comando executado é retornado na consulta', Boolean(foundLog));

  // 3. FLUXO COMPLETO DO ESTUDANTE: GIT PUSH
  console.log('\n📌 Testando Ciclo Completo de Aprendizagem (Git Push do Aluno):');
  
  const updatedChamadaContent = (repoRes.data?.repositories?.['201']?.files['chamada.txt'] || '') + `\n- [x] ${newStudent.name} (${newStudent.turma}) - PRESENTE`;
  const pushPayload = {
    studentId: newStudent.id,
    turma: '201',
    updatedFiles: {
      'chamada.txt': updatedChamadaContent,
    },
    commit: {
      id: 'commit-e2e-' + Date.now(),
      hash: 'e2e' + Math.random().toString(36).substring(2, 9),
      message: `Assinatura de presença: ${newStudent.name}`,
      author: newStudent.name,
      authorTurma: newStudent.turma,
      timestamp: new Date().toISOString(),
      filesChanged: ['chamada.txt'],
    },
  };

  const pushRes = await fetchJson('/api/git/push', {
    method: 'POST',
    body: JSON.stringify(pushPayload),
  });
  assert('POST /api/git/push processa push e merge com sucesso', pushRes.status === 200 && pushRes.data?.success);

  // Verifica se o repositório remoto recebeu o novo commit e arquivo atualizado
  const repoAfterPush = await fetchJson('/api/repository?turma=201');
  assert('Repositório da 201 reflete a presença assinada no arquivo chamada.txt', repoAfterPush.data?.files['chamada.txt']?.includes(newStudent.name));
  const commitPushed = repoAfterPush.data?.commits?.find((c) => c.id === pushPayload.commit.id);
  assert('Commit do push do aluno é integrado ao histórico remoto da 201', Boolean(commitPushed));
  // Isolamento: a outra turma não vê o nome nem o commit.
  const repo202AfterPush = await fetchJson('/api/repository?turma=202');
  assert('Repositório da 202 NÃO contém o nome da aluna da 201', !repo202AfterPush.data?.files['chamada.txt']?.includes(newStudent.name));
  assert('Histórico da 202 NÃO contém o commit da 201', !repo202AfterPush.data?.commits?.some((c) => c.id === pushPayload.commit.id));

  // 4. CASOS NEGATIVOS: VALIDAÇÃO DE SCHEMA E CONTRATO DE AUTENTICAÇÃO
  // (nenhum destes deve alterar o estado: 400/401 rejeitam antes de salvar)
  console.log('\n📌 Testando Casos Negativos (validação e autenticação):');

  const invalidJsonRes = await fetchRaw('/api/students', '{json inválido');
  assert('POST /api/students com JSON inválido retorna 400', invalidJsonRes.status === 400);

  const wrongTypeRes = await fetchJson('/api/students', {
    method: 'POST',
    body: JSON.stringify({ ...newStudent, id: 'student-e2e-wrong-type-' + Date.now(), score: '75' }),
  });
  assert('POST /api/students com score como string retorna 400', wrongTypeRes.status === 400);

  // Push do aluno SEM header de professor: contrato atual — a rota do
  // fluxo do aluno não exige senha e deve responder 200.
  // Trava anti-vazamento: turma do push diferente do authorTurma → 400.
  const pushCrossTurmaPayload = {
    studentId: newStudent.id,
    turma: '202',
    updatedFiles: { 'chamada.txt': updatedChamadaContent },
    commit: {
      id: 'commit-e2e-cross-' + Date.now(),
      hash: 'e2e' + Math.random().toString(36).substring(2, 9),
      message: `Push cruzado: ${newStudent.name}`,
      author: newStudent.name,
      authorTurma: '201',
      timestamp: new Date().toISOString(),
      filesChanged: ['chamada.txt'],
    },
  };
  const pushCrossRes = await fetchJson('/api/git/push', {
    method: 'POST',
    body: JSON.stringify(pushCrossTurmaPayload),
  });
  assert('POST /api/git/push com turma diferente do authorTurma retorna 400', pushCrossRes.status === 400);

  const pushNoHeaderPayload = {
    studentId: newStudent.id,
    turma: '201',
    updatedFiles: { 'chamada.txt': updatedChamadaContent },
    commit: {
      id: 'commit-e2e-noheader-' + Date.now(),
      hash: 'e2e' + Math.random().toString(36).substring(2, 9),
      message: `Push sem header: ${newStudent.name}`,
      author: newStudent.name,
      authorTurma: newStudent.turma,
      timestamp: new Date().toISOString(),
      filesChanged: ['chamada.txt'],
    },
  };
  const pushNoHeaderRes = await fetchJson('/api/git/push', {
    method: 'POST',
    body: JSON.stringify(pushNoHeaderPayload),
  });
  assert('POST /api/git/push do aluno SEM header retorna 200 (contrato atual)', pushNoHeaderRes.status === 200 && pushNoHeaderRes.data?.success);

  // 4b. GATES R1/R2/R3 (correções do QA da partição por turma)
  console.log('\n📌 Testando Gates R1/R2/R3:');

  const gateStudent = {
    id: 'student-e2e-gate-' + Date.now(),
    name: 'Rita Gate E2E',
    turma: '201',
    hasCloned: true,
    hasEdited: true,
    hasCommitted: true,
    hasPushed: false,
    score: 0,
    totalCommands: 0,
    errorCommands: 0,
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
  };
  const createGateRes = await fetchJson('/api/students', {
    method: 'POST',
    body: JSON.stringify(gateStudent),
  });
  assert('R1: aluno de teste do gate criado', createGateRes.status === 200);

  // R1: push de README sem o nome → 200 (envio válido), sem crédito.
  const readmeCommitId = 'commit-e2e-gate-readme-' + Date.now();
  const readmePushRes = await fetchJson('/api/git/push', {
    method: 'POST',
    body: JSON.stringify({
      studentId: gateStudent.id,
      turma: '201',
      updatedFiles: { 'README.md': '# README da turma\n' },
      commit: {
        id: readmeCommitId,
        hash: 'e2e' + Math.random().toString(36).substring(2, 9),
        message: 'Docs: README',
        author: gateStudent.name,
        authorTurma: gateStudent.turma,
        timestamp: new Date().toISOString(),
        filesChanged: ['README.md'],
      },
    }),
  });
  assert('R1: push de README retorna 200 (envio válido)', readmePushRes.status === 200 && readmePushRes.data?.success);
  assert('R1: push de README não conta para a conclusão', readmePushRes.data?.countsForCompletion === false);
  const repoAfterReadme = await fetchJson('/api/repository?turma=201');
  assert('R1: commit do README está no histórico (envio aconteceu)', repoAfterReadme.data?.commits?.some((c) => c.id === readmeCommitId));
  const studentsAfterReadme = await fetchJson('/api/students', { headers: teacherHeader });
  const gateAfterReadme = studentsAfterReadme.data.find((s) => s.id === gateStudent.id);
  assert('R1: hasPushed segue false após push sem o nome', Boolean(gateAfterReadme && gateAfterReadme.hasPushed === false));

  // R1 positivo: push com chamada.txt + nome → conta.
  const gateChamada = (repoAfterReadme.data?.files['chamada.txt'] || '') + `\n- [x] ${gateStudent.name} (${gateStudent.turma}) - PRESENTE`;
  const gatePushRes = await fetchJson('/api/git/push', {
    method: 'POST',
    body: JSON.stringify({
      studentId: gateStudent.id,
      turma: '201',
      updatedFiles: { 'chamada.txt': gateChamada },
      commit: {
        id: 'commit-e2e-gate-' + Date.now(),
        hash: 'e2e' + Math.random().toString(36).substring(2, 9),
        message: `Assinatura: ${gateStudent.name}`,
        author: gateStudent.name,
        authorTurma: gateStudent.turma,
        timestamp: new Date().toISOString(),
        filesChanged: ['chamada.txt'],
      },
    }),
  });
  assert('R1: push com chamada.txt + nome conta para a conclusão', gatePushRes.status === 200 && gatePushRes.data?.countsForCompletion === true);
  const studentsAfterGate = await fetchJson('/api/students', { headers: teacherHeader });
  const gateAfter = studentsAfterGate.data.find((s) => s.id === gateStudent.id);
  assert('R1: hasPushed vira true após push com o nome', Boolean(gateAfter && gateAfter.hasPushed === true));

  // R2: push forjado (aluno da 202 + push na 201) → 400 e nada escrito.
  const student202 = { ...gateStudent, id: 'student-e2e-gate202-' + Date.now(), name: 'Paulo Gate E2E', turma: '202', hasPushed: false };
  const create202Res = await fetchJson('/api/students', {
    method: 'POST',
    body: JSON.stringify(student202),
  });
  assert('R2: aluno da 202 criado', create202Res.status === 200);
  const repoBeforeForged = await fetchJson('/api/repository?turma=201');
  const forgedCommitId = 'commit-e2e-forged-' + Date.now();
  const forgedRes = await fetchJson('/api/git/push', {
    method: 'POST',
    body: JSON.stringify({
      studentId: student202.id,
      turma: '201',
      updatedFiles: { 'chamada.txt': gateChamada },
      commit: {
        id: forgedCommitId,
        hash: 'e2e' + Math.random().toString(36).substring(2, 9),
        message: 'Push forjado',
        author: student202.name,
        authorTurma: '201',
        timestamp: new Date().toISOString(),
        filesChanged: ['chamada.txt'],
      },
    }),
  });
  assert('R2: push forjado (aluno da 202 + turma 201) retorna 400', forgedRes.status === 400);
  const repoAfterForged = await fetchJson('/api/repository?turma=201');
  assert('R2: commit forjado NÃO entrou no histórico da 201', !repoAfterForged.data?.commits?.some((c) => c.id === forgedCommitId));
  assert('R2: contagem de commits da 201 não mudou', repoAfterForged.data?.commits?.length === repoBeforeForged.data?.commits?.length);

  // R3: aluno com turma inválida → 400.
  const badTurmaRes = await fetchJson('/api/students', {
    method: 'POST',
    body: JSON.stringify({ ...gateStudent, id: 'student-e2e-gate-bad-' + Date.now(), turma: '999' }),
  });
  assert('R3: POST /api/students com turma inválida retorna 400', badTurmaRes.status === 400);

  const resetNoPassRes = await fetchJson('/api/reset', { method: 'POST' });
  assert('POST /api/reset sem senha com TEACHER_PASSWORD configurada retorna 401', resetNoPassRes.status === 401);

  const resetWrongPassRes = await fetchJson('/api/reset', {
    method: 'POST',
    headers: { 'x-teacher-password': 'senha-errada-de-teste' },
  });
  assert('POST /api/reset com senha errada retorna 401', resetWrongPassRes.status === 401);

  // Desbloqueio ÚNICO (token de sessão, obtido no início da seção 2):
  // reset com token funciona sem senha; token inválido ou expirado → 401;
  // verify com senha errada → 401. O reset com token aqui também restaura
  // o estado, como qualquer reset — a seção 5 abaixo revalida a restauração.
  const verifyWrongRes = await fetchJson('/api/teacher/verify', {
    method: 'POST',
    body: JSON.stringify({ password: 'senha-errada-de-teste' }),
  });
  assert('POST /api/teacher/verify com senha errada retorna 401', verifyWrongRes.status === 401);

  const resetTokenRes = await fetchJson('/api/reset', {
    method: 'POST',
    headers: { 'x-teacher-token': teacherToken },
  });
  assert('POST /api/reset com token válido retorna 200 sem senha', resetTokenRes.status === 200 && resetTokenRes.data?.success);

  const resetBadTokenRes = await fetchJson('/api/reset', {
    method: 'POST',
    headers: { 'x-teacher-token': teacherToken.slice(0, -1) + (teacherToken.endsWith('0') ? '1' : '0') },
  });
  assert('POST /api/reset com token adulterado retorna 401', resetBadTokenRes.status === 401);

  // Token expirado, fabricado aqui no teste com a senha de teste (HMAC
  // sobre v1.<exp passado>) — o servidor deve recusar como 401.
  const expiredPayload = `v1.${Math.floor(Date.now() / 1000) - 3600}`;
  const expiredSig = createHmac('sha256', TEACHER_PASSWORD).update(expiredPayload).digest('hex');
  const resetExpiredRes = await fetchJson('/api/reset', {
    method: 'POST',
    headers: { 'x-teacher-token': `${expiredPayload}.${expiredSig}` },
  });
  assert('POST /api/reset com token expirado retorna 401', resetExpiredRes.status === 401);

  // 5. TESTE DE RESETA E RESTAURAÇÃO
  console.log('\n📌 Testando Restauração do Ambiente (/api/reset):');
  const resetRes = await fetchJson('/api/reset', { method: 'POST', headers: TEACHER_HEADER });
  assert('POST /api/reset com senha certa retorna 200 com mensagem de sucesso', resetRes.status === 200 && resetRes.data?.success);

  const repoAfterReset = await fetchJson('/api/repository', { headers: teacherHeader });
  assert('Repositórios são restaurados ao estado inicial (duas turmas)', Boolean(repoAfterReset.data?.repositories?.['201']?.id && repoAfterReset.data?.repositories?.['202']?.id));
  assert('Reset remove o nome da aluna das duas listas', !repoAfterReset.data?.repositories?.['201']?.files['chamada.txt']?.includes(newStudent.name) && !repoAfterReset.data?.repositories?.['202']?.files['chamada.txt']?.includes(newStudent.name));

  // 6. SEGURANÇA (correção 30/10/2026): S1, S2, S6, exportação e snapshot.
  console.log('\n📌 Testando Segurança (S1/S2/S6/export/snapshot):');

  // S1: vítima com push confirmado; prune sem auth -> 403 e vítima intacta.
  const victim = {
    id: 'student-e2e-victim-' + Date.now(),
    name: 'Vivian Vitima E2E',
    turma: '201',
    hasCloned: true, hasEdited: true, hasCommitted: true, hasPushed: false,
    score: 0, totalCommands: 1, errorCommands: 0,
    createdAt: new Date().toISOString(), lastActive: new Date().toISOString(),
  };
  const createVictimRes = await fetchJson('/api/students', { method: 'POST', body: JSON.stringify(victim) });
  assert('S1: aluna vítima criada', createVictimRes.status === 200);
  const repoBeforeVictim = await fetchJson('/api/repository?turma=201');
  const victimChamada = (repoBeforeVictim.data?.files['chamada.txt'] || '') + `\n- [x] ${victim.name} (${victim.turma}) - PRESENTE`;
  const victimPushRes = await fetchJson('/api/git/push', {
    method: 'POST',
    body: JSON.stringify({
      studentId: victim.id, turma: '201', updatedFiles: { 'chamada.txt': victimChamada },
      commit: { id: 'commit-e2e-victim-' + Date.now(), hash: 'e2e' + Math.random().toString(36).substring(2, 9), message: `Assinatura: ${victim.name}`, author: victim.name, authorTurma: '201', timestamp: new Date().toISOString(), filesChanged: ['chamada.txt'] },
    }),
  });
  assert('S1: push da vítima processado', victimPushRes.status === 200);
  const repoWithVictim = await fetchJson('/api/repository?turma=201');
  assert('S1: vítima está na chamada antes da poda', repoWithVictim.data?.files['chamada.txt']?.includes(victim.name));
  const pruneNoAuthRes = await fetchJson('/api/repository', {
    method: 'POST',
    body: JSON.stringify({ ...repoWithVictim.data, pruneStudent: victim.name }),
  });
  assert('S1: prune SEM auth retorna 403', pruneNoAuthRes.status === 403);
  const repoAfterNoAuthPrune = await fetchJson('/api/repository?turma=201');
  assert('S1: vítima intacta após prune sem auth', repoAfterNoAuthPrune.data?.files['chamada.txt']?.includes(victim.name));
  const pruneWrongIdRes = await fetchJson('/api/repository', {
    method: 'POST',
    body: JSON.stringify({ ...repoWithVictim.data, pruneStudent: victim.name, pruneStudentId: 'student-e2e-intruso-' + Date.now() }),
  });
  assert('S1: prune com id de outro aluno retorna 403', pruneWrongIdRes.status === 403);
  const pruneSelfRes = await fetchJson('/api/repository', {
    method: 'POST',
    body: JSON.stringify({ ...repoWithVictim.data, pruneStudent: victim.name, pruneStudentId: victim.id }),
  });
  assert('S1: prune próprio (id registrado) retorna 200', pruneSelfRes.status === 200);
  const repoAfterSelfPrune = await fetchJson('/api/repository?turma=201');
  assert('S1: vítima some após o próprio prune', !repoAfterSelfPrune.data?.files['chamada.txt']?.includes(victim.name));

  // S2: score forjado e troca de turma.
  const forgedScoreRes = await fetchJson('/api/students', {
    method: 'POST',
    body: JSON.stringify({ ...victim, id: 'student-e2e-forged-' + Date.now(), score: 999999 }),
  });
  assert('S2: POST com score 999999 não persiste 999999', forgedScoreRes.status === 200 && forgedScoreRes.data?.student?.score !== 999999);
  const turmaChangeRes = await fetchJson('/api/students', {
    method: 'POST',
    body: JSON.stringify({ ...victim, turma: '202' }),
  });
  assert('S2: mesmo id com turma trocada retorna 409', turmaChangeRes.status === 409);
  const logForgedRes = await fetchJson('/api/logs', {
    method: 'POST',
    body: JSON.stringify({ id: 'log-e2e-forged-' + Date.now(), studentId: victim.id, studentName: 'Nome Falso E2E', turma: '201', command: 'git status', output: 'ok', isError: false, timestamp: new Date().toISOString() }),
  });
  assert('S2: log personificando outro aluno retorna 400', logForgedRes.status === 400);
  const capsRes = await fetchJson('/api/students', {
    method: 'POST',
    body: JSON.stringify({ ...victim, id: 'student-e2e-caps-' + Date.now(), name: 'A'.repeat(5000) }),
  });
  assert('S7: nome com 5000 caracteres retorna 400', capsRes.status === 400);

  // S6: rename do repositório via snapshot é ignorado (metadados canônicos).
  const repoNow = await fetchJson('/api/repository?turma=201');
  const renameRes = await fetchJson('/api/repository', {
    method: 'POST',
    body: JSON.stringify({ ...repoNow.data, name: 'renomeado-e2e', owner: 'intruso-e2e' }),
  });
  assert('S6: POST com metadados trocados retorna 200 (merge, sem rename)', renameRes.status === 200);
  const repoAfterRename = await fetchJson('/api/repository?turma=201');
  assert('S6: nome/owner do repositório não mudaram', repoAfterRename.data?.name === repoNow.data?.name && repoAfterRename.data?.owner === repoNow.data?.owner);

  // P5: exportação e snapshot com token (o reset da seção 5 gerou snapshot).
  const exportRes = await fetchJson('/api/teacher/export', { headers: teacherHeader });
  assert('P5: GET /api/teacher/export com token retorna 200 com auditoria', exportRes.status === 200 && Array.isArray(exportRes.data?.audit));
  const snapshotRes = await fetchJson('/api/teacher/snapshot', { headers: teacherHeader });
  assert('P5: GET /api/teacher/snapshot com token retorna o snapshot pré-reset', snapshotRes.status === 200 && Boolean(snapshotRes.data?.snapshot?.repositories?.['201']));
  const snapshotNoAuthRes = await fetchJson('/api/teacher/snapshot');
  assert('P5: GET /api/teacher/snapshot sem token retorna 401', snapshotNoAuthRes.status === 401);

  console.log('\n======================================================');
  console.log('🎉 TODOS OS TESTES DE PONTA A PONTA PASSARAM COM SUCESSO!');
  console.log('======================================================\n');
}

// Encerra o servidor de testes e TODA a sua árvore. Antes, o teardown
// mandava SIGTERM só para o shell do spawn (shell:true): o next-server
// filho sobrevivia com os pipes abertos e o processo de teste nunca
// terminava (hang após "Encerrando servidor..."), mesmo com todos os
// asserts verdes. Agora, em POSIX, o servidor sobe destacado (líder do
// próprio grupo) e o teardown mata o grupo inteiro, com SIGKILL de
// fallback após 5s. No Windows, o comportamento original (taskkill /t,
// que já mata a árvore) foi mantido.
async function stopServer(child) {
  if (child.exitCode !== null) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', child.pid, '/f', '/t']);
    } else {
      process.kill(-child.pid, 'SIGTERM');
    }
  } catch {
    // processo já morto: nada a fazer
  }
  const exited = await Promise.race([
    new Promise((resolve) => child.once('exit', () => resolve(true))),
    sleep(5000).then(() => false),
  ]);
  if (!exited) {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', child.pid, '/f', '/t']);
      } else {
        process.kill(-child.pid, 'SIGKILL');
      }
    } catch {
      // processo já morto: nada a fazer
    }
  }
}

async function main() {
  console.log('Iniciando Next.js em modo de produção...');
  const nextProcess = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    stdio: 'pipe',
    // POSIX: sem shell (evita o warning DEP0190) + detached para o
    // teardown matar o grupo inteiro. Windows: shell para resolver npx.cmd.
    shell: process.platform === 'win32',
    detached: process.platform !== 'win32',
  });

  nextProcess.stdout.on('data', (d) => {
    // console.log(`[Next] ${d}`);
  });

  nextProcess.stderr.on('data', (d) => {
    // console.error(`[Next Err] ${d}`);
  });

  try {
    const ready = await waitForServer(30);
    if (!ready) {
      throw new Error('Falha ao inicializar o servidor Next.js em modo de produção.');
    }
    await runE2ETests();
  } catch (err) {
    console.error('\n❌ Erro durante a execução dos testes E2E:', err);
    process.exitCode = 1;
  } finally {
    console.log('Encerrando servidor de testes Next.js...');
    await stopServer(nextProcess);
  }
}

main();
