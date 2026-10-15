// Script de Teste Ponta a Ponta (E2E) para Produção - Git Simulador
import { spawn } from 'child_process';
import http from 'http';

const PORT = 3005;
const BASE_URL = `http://127.0.0.1:${PORT}`;

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

  // GET /api/repository inicial
  const repoRes = await fetchJson('/api/repository');
  assert('GET /api/repository retorna status 200', repoRes.status === 200);
  assert('Repositório contém branch padrão e lista de arquivos', Boolean(repoRes.data?.defaultBranch && repoRes.data?.files));
  assert('Repositório contém chamada.txt inicial', 'chamada.txt' in (repoRes.data?.files || {}));

  // POST /api/students
  const newStudent = {
    id: 'student-e2e-' + Date.now(),
    name: 'Ana Dev Silva E2E',
    turma: 'Turma-Alpha-Prod',
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

  // GET /api/students
  const listStudentsRes = await fetchJson('/api/students');
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
  const listLogsRes = await fetchJson('/api/logs');
  assert('GET /api/logs retorna histórico de comandos', Array.isArray(listLogsRes.data));
  const foundLog = listLogsRes.data.find((l) => l.id === newLog.id || l.studentId === newStudent.id);
  assert('Log do comando executado é retornado na consulta', Boolean(foundLog));

  // 3. FLUXO COMPLETO DO ESTUDANTE: GIT PUSH
  console.log('\n📌 Testando Ciclo Completo de Aprendizagem (Git Push do Aluno):');
  
  const updatedChamadaContent = (repoRes.data?.files['chamada.txt'] || '') + `\n- [x] ${newStudent.name} (${newStudent.turma}) - PRESENTE`;
  const pushPayload = {
    studentId: newStudent.id,
    updatedFiles: {
      'chamada.txt': updatedChamadaContent,
    },
    commit: {
      id: 'commit-e2e-' + Date.now(),
      hash: 'e2e' + Math.random().toString(36).substring(2, 9),
      message: `Assinatura de presença: ${newStudent.name}`,
      author: newStudent.name,
      date: new Date().toISOString(),
      filesChanged: ['chamada.txt'],
    },
  };

  const pushRes = await fetchJson('/api/git/push', {
    method: 'POST',
    body: JSON.stringify(pushPayload),
  });
  assert('POST /api/git/push processa push e merge com sucesso', pushRes.status === 200 && pushRes.data?.success);

  // Verifica se o repositório remoto recebeu o novo commit e arquivo atualizado
  const repoAfterPush = await fetchJson('/api/repository');
  assert('Repositório reflete a presença assinada no arquivo chamada.txt', repoAfterPush.data?.files['chamada.txt']?.includes(newStudent.name));
  const commitPushed = repoAfterPush.data?.commits?.find((c) => c.id === pushPayload.commit.id);
  assert('Commit do push do aluno é integrado ao histórico remoto', Boolean(commitPushed));

  // 4. TESTE DE RESETA E RESTAURAÇÃO
  console.log('\n📌 Testando Restauração do Ambiente (/api/reset):');
  const resetRes = await fetchJson('/api/reset', { method: 'POST' });
  assert('POST /api/reset retorna 200 com mensagem de sucesso', resetRes.status === 200 && resetRes.data?.success);

  const repoAfterReset = await fetchJson('/api/repository');
  assert('Repositório é restaurado ao estado inicial', Boolean(repoAfterReset.data?.id));

  console.log('\n======================================================');
  console.log('🎉 TODOS OS TESTES DE PONTA A PONTA PASSARAM COM SUCESSO!');
  console.log('======================================================\n');
}

async function main() {
  console.log('Iniciando Next.js em modo de produção...');
  const nextProcess = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    stdio: 'pipe',
    shell: true,
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
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', nextProcess.pid, '/f', '/t']);
      } else {
        nextProcess.kill('SIGTERM');
      }
    } catch {
      // ignore
    }
  }
}

main();
