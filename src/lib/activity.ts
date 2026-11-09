import { Student, CommandLog } from "./types";

/**
 * Frente UI/UX (Agente Designer) — conteúdo pedagógico e regras de
 * apresentação. Este arquivo NÃO é o motor: não executa comandos Git nem
 * muda a nota. Ele só descreve os modos de atividade, os textos exibidos
 * ao aluno (micro-explicações e glossário) e os cálculos derivados que a
 * UI mostra (nota sem receita, alerta "só copiou" do professor).
 *
 * Onde encontrar cada texto (para a revisão do Pedagógico):
 * - Micro-explicações da Aula 1: GUIDED_STEPS (abaixo).
 * - Objetivos da Atividade 2 "Sem receita": UNAIDED_OBJECTIVES.
 * - Micro-explicações da Aula 2: LESSON2_STEPS.
 * - Glossário: GLOSSARY.
 * - Regra da nota sem receita: computeUnaidedScore.
 * - Regra do alerta do professor: detectCopiedAlert.
 */

// ---------------------------------------------------------------------------
// Modos de atividade
// ---------------------------------------------------------------------------

export type ActivityMode = "guided" | "unaided" | "lesson2";

export const ACTIVITY_MODE_STORAGE_KEY = "gitsim_activity_mode";

export const ACTIVITY_MODES: Record<
  ActivityMode,
  { label: string; short: string; description: string }
> = {
  guided: {
    label: "Guiado",
    short: "Guiado",
    description:
      "Os 4 passos com micro-explicações antes de cada passo. O comando exato só aparece se você clicar em “Revelar comando”.",
  },
  unaided: {
    label: "Sem receita",
    short: "Sem receita",
    description:
      "O mesmo fluxo, sem comandos prontos em lugar nenhum. Se travar, a dica do terminal dá primeiro uma pista; o comando só aparece se você pedir. Regra da nota sem receita (conta só os comandos de dica revelados no terminal, nesta sessão): nenhum revelado vale 10 pontos, 1 revelado vale 5, 2 ou mais valem 0.",
  },
  lesson2: {
    label: "Branch e conflito",
    short: "Branch e conflito",
    description:
      "Fluxo guiado: criar branch, trazer novidades com pull, resolver um conflito editando os marcadores e fechar com o passo “Git de verdade”.",
  },
};

export function getStoredActivityMode(): ActivityMode {
  try {
    const raw = window.localStorage.getItem(ACTIVITY_MODE_STORAGE_KEY);
    if (raw === "guided" || raw === "unaided" || raw === "lesson2") return raw;
  } catch {
    // Sem localStorage (pré-renderização): cai no modo guiado.
  }
  return "guided";
}

export function setStoredActivityMode(mode: ActivityMode): void {
  try {
    window.localStorage.setItem(ACTIVITY_MODE_STORAGE_KEY, mode);
  } catch {
    // Sem localStorage: o modo vale só nesta montagem.
  }
}

// ---------------------------------------------------------------------------
// Glossário — definições curtas, em português claro, sem jargão sem definição.
// Termos que apareciam sem definição no app: "snapshot local", "mensagem
// semântica", "staging", "working tree clean" (aqui traduzidos/explicados).
// ---------------------------------------------------------------------------

export interface GlossaryEntry {
  term: string;
  definition: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    term: "Repositório",
    definition:
      "A pasta do projeto com o histórico de mudanças guardado junto. É onde o Git acompanha o que mudou, quando e por quem.",
  },
  {
    term: "Remoto (origin)",
    definition:
      "A cópia do repositório que fica fora do seu computador — aqui, o GitHub simulado da turma. “Origin” é só o apelido do remoto principal.",
  },
  {
    term: "Clone",
    definition:
      "Baixar uma cópia completa do repositório remoto para o seu computador, para trabalhar nele localmente.",
  },
  {
    term: "Working tree (árvore de trabalho)",
    definition:
      "Os arquivos do projeto como você os vê e edita no editor, antes de preparar (staging) e registrar (commit) — o seu rascunho atual. O Git só registra o que foi salvo e preparado.",
  },
  {
    term: "Working tree clean (árvore limpa)",
    definition:
      "Mensagem do Git dizendo que não há nenhuma mudança pendente: nada foi alterado desde o último registro, ou tudo que foi alterado já foi registrado em um commit.",
  },
  {
    term: "Staging (área de preparação)",
    definition:
      "A “caixa de saída” do próximo commit: só o que você preparou com o comando de adicionar entra no próximo registro. Editar não basta — é preciso preparar.",
  },
  {
    term: "Commit (foto do projeto)",
    definition:
      "Um registro permanente de um conjunto de mudanças, como uma foto do projeto naquele momento, com autor, data e mensagem. Antes era chamado aqui de “snapshot local” — é a mesma coisa.",
  },
  {
    term: "Mensagem de commit (antes: “mensagem semântica”)",
    definition:
      "O texto que resume O QUE mudou, por exemplo “Presente: Seu Nome”. Serve para qualquer pessoa entender o commit depois, sem adivinhar.",
  },
  {
    term: "Diff",
    definition:
      "A comparação linha por linha entre duas versões de um arquivo: o que foi adicionado aparece em verde e o que foi removido, em vermelho.",
  },
  {
    term: "Log",
    definition: "O histórico de commits do repositório, do mais recente ao mais antigo.",
  },
  {
    term: "Status",
    definition:
      "O raio-x do momento: mostra em que branch você está, o que foi modificado, o que já está preparado (staging) e o que ainda não foi enviado ao remoto.",
  },
  {
    term: "Branch (ramo)",
    definition:
      "Uma linha paralela de trabalho dentro do mesmo repositório, para fazer uma tarefa sem mexer na linha principal até ela estar pronta.",
  },
  {
    term: "Checkout / switch",
    definition:
      "Trocar a branch ativa, isto é, a linha de trabalho em que seus próximos commits vão entrar.",
  },
  {
    term: "Push",
    definition:
      "Enviar seus commits locais para o repositório remoto, para que a turma (e o professor) os veja.",
  },
  {
    term: "Pull",
    definition:
      "Trazer para o seu computador as novidades que já estão no remoto — commits de colegas que você ainda não tem.",
  },
  {
    term: "Ahead (à frente do remoto)",
    definition:
      "“Ahead by 1 commit” significa: você tem 1 commit local que o remoto ainda não recebeu. O push resolve isso.",
  },
  {
    term: "Conflito",
    definition:
      "Quando duas pessoas mudam a mesma linha de formas diferentes, o Git não sabe qual versão vale e pede para você decidir, editando o arquivo.",
  },
  {
    term: "Marcadores de conflito",
    definition:
      "As linhas <<<<<<< HEAD, ======= e >>>>>>> que o Git escreve no arquivo em conflito: acima do meio fica a sua versão, abaixo fica a versão do remoto. Resolver é apagar os marcadores e deixar só o conteúdo certo.",
  },
  {
    term: "HEAD",
    definition:
      "O apelido da sua posição atual no histórico: o commit em que a sua branch está apontando. Nos marcadores de conflito, o lado HEAD é a sua versão.",
  },
  {
    term: "git config (identidade)",
    definition:
      "O registro do seu nome e e-mail no Git, para assinar seus commits. Aqui é só simulado: nada é enviado a lugar nenhum.",
  },
  {
    term: "Credencial / login (push de verdade)",
    definition:
      "No GitHub de verdade, o push pede login (usuário e senha ou token). Aqui a credencial é simulada e descartada: nunca digite sua senha real em uma simulação.",
  },
  {
    term: "Untracked (não rastreado)",
    definition:
      "Arquivo novo que o Git ainda não acompanha. Ele só entra no histórico depois de ser preparado e commitado.",
  },
];

// ---------------------------------------------------------------------------
// Passos guiados — cada passo tem: título, micro-explicação (2 linhas de
// conceito), objetivo (o que fazer, sem o comando exato) e, nos modos
// guiados, o comando revelável sob demanda. O comando NUNCA é renderizado
// sem um clique em “Revelar comando” (ver home e VSCodeView).
// ---------------------------------------------------------------------------

export interface StepGuide {
  id: string;
  title: string;
  /** Micro-explicação: 2 linhas de conceito, antes do comando. */
  concept: string;
  /** Objetivo do passo, descrito sem o comando exato. */
  goal: string;
  /** Comando exato — só exibido após “Revelar comando”. Ausente = sem receita. */
  revealCommand?: string;
  revealNote?: string;
}

export function guidedSteps(cloneUrl: string, repoName: string): StepGuide[] {
  return [
    {
      id: "clone",
      title: "1. Copiar o link e clonar",
      concept:
        "Repositório é a pasta do projeto com o histórico junto. Clonar é baixar uma cópia dele para o seu computador.",
      goal: "No GitHub simulado, copie a URL no botão verde “<> Code” e, no terminal do VS Code, clone o repositório da turma.",
      revealCommand: `git clone ${cloneUrl}`,
    },
    {
      id: "edit",
      title: "2. Entrar na pasta e assinar a chamada",
      concept:
        "A working tree é o arquivo como você o edita no editor. O Git só enxerga o que foi salvo — texto só digitado, sem salvar, não conta.",
      goal: `Entre na pasta do repositório, abra chamada.txt, escreva uma linha nova com seu nome completo e turma, e salve com Ctrl+S ou no botão Salvar.`,
      revealCommand: `cd ${repoName}`,
      revealNote: "Depois de entrar na pasta, edite o arquivo no editor — não no terminal.",
    },
    {
      id: "add-commit",
      title: "3. Preparar e registrar (staging + commit)",
      concept:
        "Staging é a “caixa de saída” do commit: só o que você prepara entra no registro. Commit é a foto do projeto naquele momento, com uma mensagem que explica a mudança.",
      goal: "Confira o que mudou, prepare o arquivo e registre o commit com uma mensagem que diga o que você fez.",
      revealCommand: `git add . && git commit -m "Presente: Seu Nome"`,
      revealNote: "Troque “Seu Nome” pelo seu nome completo antes de executar.",
    },
    {
      id: "push",
      title: "4. Enviar para o remoto (push)",
      concept:
        "O remoto é a cópia do projeto fora do seu computador. Push envia seus commits para lá, para que a turma os veja.",
      goal: "Envie seus commits para o repositório da turma e confira seu nome na aba GitHub.",
      revealCommand: `git push origin main`,
    },
  ];
}

export const UNAIDED_OBJECTIVES: StepGuide[] = [
  {
    id: "clone",
    title: "1. Trazer o repositório para o seu computador",
    concept:
      "Repositório é a pasta do projeto com o histórico junto. Você precisa de uma cópia local dele antes de trabalhar.",
    goal: "Descubra sozinho como copiar a URL no GitHub simulado e trazer o repositório para o VS Code. Se travar, a dica do terminal dá uma pista — o comando só aparece se você pedir.",
  },
  {
    id: "edit",
    title: "2. Assinar a chamada e salvar de verdade",
    concept:
      "A working tree é o arquivo como você o edita. O Git só enxerga o que foi salvo: sem Ctrl+S (ou botão Salvar), a mudança não existe para o Git.",
    goal: "Entre na pasta do projeto, abra chamada.txt, escreva uma linha nova com seu nome completo e turma, e salve.",
  },
  {
    id: "add-commit",
    title: "3. Preparar e registrar sua mudança",
    concept:
      "Staging é a “caixa de saída” do commit: só o que você prepara entra no registro. Commit é a foto do projeto naquele momento.",
    goal: "Confira o que mudou, prepare o arquivo e registre o commit com uma mensagem clara sobre o que você fez.",
  },
  {
    id: "push",
    title: "4. Enviar para o remoto",
    concept:
      "O remoto é a cópia do projeto fora do seu computador. Enviar seus commits para lá é o que faz a turma vê-los.",
    goal: "Envie seus commits para o repositório da turma e confira seu nome na aba GitHub.",
  },
];

export function lesson2Steps(repoName: string): StepGuide[] {
  void repoName;
  return [
    {
      id: "branch",
      title: "1. Criar uma branch para a sua tarefa",
      concept:
        "Branch é uma linha paralela de trabalho: você mexe nela sem bagunçar a linha principal até a tarefa estar pronta. Limitação honesta deste simulador: as branches compartilham o mesmo conteúdo de trabalho — trocar de branch NÃO restaura o conteúdo de outra branch, não há uma cópia separada por branch.",
      goal: "Crie uma branch com um nome que descreva sua tarefa e troque para ela. Confira em qual branch você está antes de continuar.",
      revealCommand: "git checkout -b minha-tarefa",
      revealNote: "Troque “minha-tarefa” por um nome da sua tarefa, sem espaços.",
    },
    {
      id: "edit-branch",
      title: "2. Trabalhar na branch e registrar",
      concept:
        "O fluxo não muda na branch: editar, salvar, preparar (staging) e commit. A branch só organiza em qual linha o commit é feito — e, neste simulador, o conteúdo continua compartilhado com a main (ver passo 1).",
      goal: "Edite chamada.txt, salve com Ctrl+S, prepare o arquivo e registre o commit na sua branch.",
      revealCommand: `git add . && git commit -m "Tarefa na branch"`,
    },
    {
      id: "pull",
      title: "3. Trazer as novidades do remoto (pull)",
      concept:
        "Pull traz para o seu computador os commits que já estão no remoto e você ainda não tem. Se um colega mudou a mesma linha que você, de forma diferente, o Git não decide sozinho: nasce um conflito.",
      goal: "Traga as novidades do remoto. Receita de sala para ver um conflito de verdade: o professor indica quem será o colega que dá push primeiro; esse colega edita a MESMA linha inicial de chamada.txt, dá push, e só depois você dá pull com a sua versão diferente dessa linha. Se vocês dois editaram a mesma linha de formas diferentes, o pull DEVE mostrar CONFLICT — se ele só atualizar, avise o professor: o conflito deveria ter aparecido.",
      revealCommand: "git pull",
      revealNote:
        "Se aparecer CONFLICT, não entre em pânico: vá para o passo 4. Se aparecer “Already up to date”, não havia novidade no remoto.",
    },
    {
      id: "conflict",
      title: "4. Resolver o conflito editando os marcadores",
      concept:
        "Os marcadores <<<<<<< HEAD, ======= e >>>>>>> marcam a briga: acima do meio fica a sua versão, abaixo fica a do remoto. Resolver é escolher o conteúdo certo e apagar os marcadores.",
      goal: "Abra o arquivo em conflito, apague os marcadores deixando só o conteúdo certo (pode manter as duas versões, se fizer sentido), salve com Ctrl+S, prepare o arquivo resolvido e registre o commit da resolução.",
      revealCommand: "git add chamada.txt",
      revealNote: "Depois de preparar, registre o commit da resolução e envie com push.",
    },
    {
      id: "transfer",
      title: "5. Git de verdade: identidade + push com login simulado",
      concept:
        "No GitHub de verdade, o push pede login — e o commit carrega seu nome e e-mail registrados. Aqui tudo é simulado: a identidade fica só neste simulador e a credencial digitada é descartada.",
      goal: "Ative o passo “Git de verdade” no painel abaixo, registre seu nome e e-mail simulados e faça o push: ele vai pedir uma credencial SIMULADA. ⚠️ Nunca digite sua senha real — o valor digitado é descartado e nunca é enviado, salvo ou verificado de verdade. Atenção: o pedido de credencial só aparece se houver um commit novo para enviar; se o push responder “up to date”, faça antes uma nova edição e um novo commit.",
      revealCommand: `git config user.name "Seu Nome"`,
      revealNote:
        "Depois, registre o e-mail da mesma forma e faça o push — o pedido de credencial simulada aparece no terminal.",
    },
  ];
}

// ---------------------------------------------------------------------------
// Nota sem receita (Atividade 2) — regra da UI, somada pelo motor via
// Student.unaidedScore (0–10). Sessão = a sessão atual do VS Code: conta
// quantos comandos de dica o aluno revelou nela.
// ---------------------------------------------------------------------------

/** 0 comandos revelados → 10 · 1 revelado → 5 · 2 ou mais → 0. */
export function computeUnaidedScore(revealedTipCount: number): number {
  if (revealedTipCount <= 0) return 10;
  if (revealedTipCount === 1) return 5;
  return 0;
}

// ---------------------------------------------------------------------------
// Alerta "só copiou" do professor — cálculo DERIVADO dos logs já carregados
// (sem nova rota, sem mudar o schema, sem mudar a nota). O alerta exige
// pelo menos 2 dos 3 indícios, para um único sinal não rotular ninguém.
// É indício, não prova: a UI sempre mostra os motivos e o aviso de que o
// professor deve conversar com o aluno antes de concluir qualquer coisa.
// ---------------------------------------------------------------------------

export interface CopiedAlert {
  alert: boolean;
  /** Motivos legíveis, com os números que os sustentam. */
  reasons: string[];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function detectCopiedAlert(
  student: Student,
  studentLogs: CommandLog[]
): CopiedAlert {
  const reasons: string[] = [];
  const gitLogs = studentLogs
    .filter((l) => l.command.trim().toLowerCase().startsWith("git"))
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

  // Indício 1 — ritmo curtíssimo: mediana dos intervalos entre comandos
  // git consecutivos abaixo de 8 segundos (exige ao menos 3 comandos git).
  if (gitLogs.length >= 3) {
    const gaps: number[] = [];
    for (let i = 1; i < gitLogs.length; i++) {
      const gap =
        new Date(gitLogs[i].timestamp).getTime() -
        new Date(gitLogs[i - 1].timestamp).getTime();
      if (Number.isFinite(gap) && gap >= 0) gaps.push(gap);
    }
    const med = median(gaps);
    if (gaps.length >= 2 && med < 8000) {
      reasons.push(
        `Ritmo curtíssimo: mediana de ${(med / 1000).toFixed(1)}s entre ${gitLogs.length} comandos git — ritmo que sugere pouca leitura das saídas entre comandos; vale verificar se o aluno leu as saídas ou só seguiu o guia.`
      );
    }
  }

  // Indício 2 — cadeia completa com && sem nenhum comando de diagnóstico.
  const hasFullChain = studentLogs.some((l) => {
    const cmd = l.command.toLowerCase();
    return (
      cmd.includes("&&") &&
      cmd.includes("git add") &&
      cmd.includes("git commit") &&
      cmd.includes("git push")
    );
  });
  const hasDiagnostic = studentLogs.some((l) => {
    const cmd = l.command.trim().toLowerCase();
    return (
      cmd.startsWith("git status") ||
      cmd.startsWith("git diff") ||
      cmd.startsWith("git log")
    );
  });
  if (hasFullChain && !hasDiagnostic) {
    reasons.push(
      "Cadeia completa com && (add + commit + push de uma vez) sem nenhum git status, git diff ou git log antes — o aluno não conferiu o estado do projeto em nenhum momento."
    );
  }

  // Indício 3 — zero erros em uma atividade com pelo menos 4 comandos.
  if (student.errorCommands === 0 && student.totalCommands >= 4) {
    reasons.push(
      `Zero erros em ${student.totalCommands} comandos — nenhuma tentativa que deu errado, o que é raro em um primeiro contato com o terminal.`
    );
  }

  return { alert: reasons.length >= 2, reasons };
}
