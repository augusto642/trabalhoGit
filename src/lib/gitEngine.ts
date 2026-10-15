import { Student, Commit, Repository } from "./types";

export interface VirtualFileTree {
  [path: string]: string; // path relativo a /home/aluno, ex: 'chamada-turma-a/chamada.txt'
}

export interface GitEngineState {
  currentDir: string; // ex: '~' ou '~/chamada-turma-a'
  isRepoCloned: boolean;
  repoFolder: string; // 'chamada-turma-a'
  head: string; // 'main'
  files: VirtualFileTree;
  stagedFiles: Set<string>;
  untrackedFiles: Set<string>;
  modifiedFiles: Set<string>;
  localCommits: Commit[];
  remoteRepo: Repository;
  student: Student;
}

export interface CommandExecutionResult {
  output: string;
  isError: boolean;
  tip?: string;
  newState: GitEngineState;
  pushedCommit?: Commit;
  stepCompleted?: "clone" | "edit" | "commit" | "push";
}

// Gera um hash SHA curto de 7 caracteres
function generateHash(): string {
  const chars = "0123456789abcdef";
  let hash = "";
  for (let i = 0; i < 7; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}

export function createInitialGitState(student: Student, remoteRepo: Repository): GitEngineState {
  return {
    currentDir: "~",
    isRepoCloned: false,
    repoFolder: remoteRepo.name,
    head: remoteRepo.defaultBranch || "main",
    files: {},
    stagedFiles: new Set<string>(),
    untrackedFiles: new Set<string>(),
    modifiedFiles: new Set<string>(),
    localCommits: [],
    remoteRepo,
    student,
  };
}

function executeSingleTerminalCommand(
  rawCommand: string,
  state: GitEngineState
): CommandExecutionResult {
  const trimmed = rawCommand.trim();
  const newState: GitEngineState = {
    ...state,
    stagedFiles: new Set(state.stagedFiles),
    untrackedFiles: new Set(state.untrackedFiles),
    modifiedFiles: new Set(state.modifiedFiles),
    files: { ...state.files },
    localCommits: [...state.localCommits],
  };

  if (!trimmed) {
    return { output: "", isError: false, newState };
  }

  // Argument parser respeitando aspas
  const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
  const args: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(trimmed)) !== null) {
    args.push(match[1] ?? match[2] ?? match[0]);
  }

  const cmd = args[0].toLowerCase();

  // COMANDOS BÁSICOS DE SHELL
  if (cmd === "clear" || cmd === "cls") {
    return { output: "\x1b[CLEAR]", isError: false, newState };
  }

  if (cmd === "pwd") {
    const fullPath = newState.currentDir === "~" ? "/home/aluno" : `/home/aluno/${newState.repoFolder}`;
    return { output: fullPath, isError: false, newState };
  }

  if (cmd === "help") {
    const helpText = `Comandos disponíveis no simulador:
  git clone <url>      - Clona o repositório remoto para o VS Code
  cd <pasta>           - Entra em um diretório (ex: cd ${newState.repoFolder} ou cd ..)
  ls / dir             - Lista arquivos e pastas do diretório atual
  cat <arquivo>        - Exibe o conteúdo de um arquivo de texto
  pwd                  - Mostra o caminho da pasta atual
  git status           - Mostra o estado dos arquivos (modificados, staged, untracked)
  git diff             - Mostra o que mudou nos arquivos antes do commit
  git branch           - Mostra as ramificações e qual está ativa
  git add <arquivo>    - Adiciona arquivos para a área de preparação (staging)
  git commit -m "msg"  - Cria um commit com as alterações preparadas
  git push origin main - Envia seus commits para o GitHub
  git log              - Mostra o histórico de commits
  clear                - Limpa a tela do terminal
  * Dica: Você também pode encadear comandos usando && (ex: git add . && git commit -m "msg" && git push)`;
    return { output: helpText, isError: false, newState };
  }

  if (cmd === "ls" || cmd === "dir") {
    if (newState.currentDir === "~") {
      if (newState.isRepoCloned) {
        return {
          output: `\x1b[34m${newState.repoFolder}/\x1b[0m`,
          isError: false,
          newState,
        };
      }
      return { output: "(diretório vazio)", isError: false, newState };
    } else {
      // Dentro do repo
      const filesInRepo = Object.keys(newState.files)
        .filter((f) => f.startsWith(`${newState.repoFolder}/`))
        .map((f) => f.replace(`${newState.repoFolder}/`, ""));

      if (filesInRepo.length === 0) {
        return { output: "(repositório vazio)", isError: false, newState };
      }

      return {
        output: filesInRepo.join("   "),
        isError: false,
        newState,
      };
    }
  }

  if (cmd === "cd") {
    const target = args[1]?.trim() || "~";
    if (target === "~" || target === ".." || target === "/" || target === "/home/aluno") {
      newState.currentDir = "~";
      return { output: "", isError: false, newState };
    }

    const cleanTarget = target.replace(/\/$/, "");
    if (cleanTarget === newState.repoFolder || cleanTarget === `./${newState.repoFolder}`) {
      if (!newState.isRepoCloned) {
        return {
          output: `bash: cd: ${target}: Arquivo ou diretório inexistente`,
          isError: true,
          tip: `💡 Dica: Você ainda não clonou o repositório! Use 'git clone ${newState.remoteRepo.cloneUrl}' primeiro.`,
          newState,
        };
      }
      newState.currentDir = `~/${newState.repoFolder}`;
      return { output: "", isError: false, newState };
    }

    return {
      output: `bash: cd: ${target}: Arquivo ou diretório inexistente`,
      isError: true,
      tip: `💡 Dica: Use 'ls' para ver as pastas disponíveis ou 'cd ${newState.repoFolder}' para entrar no repositório.`,
      newState,
    };
  }

  if (cmd === "cat") {
    const file = args[1]?.trim();
    if (!file) {
      return { output: "cat: argumento ausente", isError: true, newState };
    }
    const filePath =
      newState.currentDir === "~" ? file : `${newState.repoFolder}/${file}`;

    if (newState.files[filePath] !== undefined) {
      return { output: newState.files[filePath], isError: false, newState };
    }
    return {
      output: `cat: ${file}: Arquivo ou diretório inexistente`,
      isError: true,
      tip: `💡 Dica: Verifique o nome do arquivo usando 'ls'. Certifique-se de que está dentro da pasta com 'cd ${newState.repoFolder}'.`,
      newState,
    };
  }

  // COMANDOS GIT
  if (cmd === "git") {
    const gitSubCmd = args[1]?.toLowerCase();

    if (!gitSubCmd) {
      return {
        output: "usage: git <command> [<args>]\nDigite 'help' para ver os comandos suportados.",
        isError: false,
        newState,
      };
    }

    // GIT CLONE
    if (gitSubCmd === "clone") {
      const url = args[2]?.trim();

      if (!url) {
        return {
          output: "fatal: You must specify a repository to clone.\n\nusage: git clone <url>",
          isError: true,
          tip: `💡 Dica: Copie a URL no botão verde '<> Code' da aba GitHub e digite:\ngit clone ${newState.remoteRepo.cloneUrl}`,
          newState,
        };
      }

      const expectedUrl = newState.remoteRepo.cloneUrl.toLowerCase();
      const inputUrl = url.toLowerCase();

      // Tolera URL com ou sem .git e variações de maiúsculas
      if (inputUrl !== expectedUrl && !inputUrl.includes(newState.remoteRepo.name.toLowerCase())) {
        return {
          output: `fatal: repository '${url}' does not exist`,
          isError: true,
          tip: `💡 Dica: URL inválida! Copie o link oficial clicando no botão verde '<> Code' no GitHub:\n${newState.remoteRepo.cloneUrl}`,
          newState,
        };
      }

      if (newState.isRepoCloned) {
        return {
          output: `fatal: destination path '${newState.repoFolder}' already exists and is not an empty directory.`,
          isError: true,
          tip: `💡 Dica: O repositório já foi clonado! Use 'cd ${newState.repoFolder}' para entrar nele.`,
          newState,
        };
      }

      // Clona arquivos do remoteRepo
      newState.isRepoCloned = true;
      for (const [filename, content] of Object.entries(newState.remoteRepo.files)) {
        newState.files[`${newState.repoFolder}/${filename}`] = content;
      }
      newState.localCommits = [...newState.remoteRepo.commits];

      return {
        output: `Cloning into '${newState.repoFolder}'...
remote: Enumerating objects: 6, done.
remote: Counting objects: 100% (6/6), done.
remote: Compressing objects: 100% (4/4), done.
remote: Total 6 (delta 1), reused 0 (delta 0)
Receiving objects: 100% (6/6), done.`,
        isError: false,
        tip: `💡 Muito bem! O repositório foi clonado com sucesso!\n👉 Próximo passo: Digite 'cd ${newState.repoFolder}' para entrar na pasta do projeto.`,
        newState,
        stepCompleted: "clone",
      };
    }

    // Verificação de estar dentro do repositório
    const isInsideRepo = newState.currentDir === `~/${newState.repoFolder}`;

    if (!isInsideRepo) {
      if (gitSubCmd === "status" || gitSubCmd === "add" || gitSubCmd === "commit" || gitSubCmd === "push" || gitSubCmd === "log") {
        return {
          output: "fatal: not a git repository (or any of the parent directories): .git",
          isError: true,
          tip: newState.isRepoCloned
            ? `💡 Dica: Você está fora da pasta do repositório! Digite 'cd ${newState.repoFolder}' para entrar nela.`
            : `💡 Dica: Você precisa clonar o repositório antes de usar o Git! Use: git clone ${newState.remoteRepo.cloneUrl}`,
          newState,
        };
      }
    }

    // GIT STATUS
    if (gitSubCmd === "status") {
      let output = `On branch main\nYour branch is up to date with 'origin/main'.\n\n`;

      if (newState.localCommits.length > newState.remoteRepo.commits.length) {
        const diff = newState.localCommits.length - newState.remoteRepo.commits.length;
        output = `On branch main\nYour branch is ahead of 'origin/main' by ${diff} commit${diff > 1 ? "s" : ""}.\n  (use "git push" to publish your local commits)\n\n`;
      }

      const hasStaged = newState.stagedFiles.size > 0;
      const hasModified = newState.modifiedFiles.size > 0;
      const hasUntracked = newState.untrackedFiles.size > 0;

      if (!hasStaged && !hasModified && !hasUntracked) {
        output += `nothing to commit, working tree clean`;
        return { output, isError: false, newState };
      }

      if (hasStaged) {
        output += `Changes to be committed:\n  (use "git restore --staged <file>..." to unstage)\n`;
        newState.stagedFiles.forEach((file) => {
          output += `\t\x1b[32mmodified:   ${file}\x1b[0m\n`;
        });
        output += `\n`;
      }

      if (hasModified) {
        output += `Changes not staged for commit:\n  (use "git add <file>..." to update what will be committed)\n`;
        newState.modifiedFiles.forEach((file) => {
          output += `\t\x1b[31mmodified:   ${file}\x1b[0m\n`;
        });
        output += `\n`;
      }

      if (hasUntracked) {
        output += `Untracked files:\n  (use "git add <file>..." to include in what will be committed)\n`;
        newState.untrackedFiles.forEach((file) => {
          output += `\t\x1b[31m${file}\x1b[0m\n`;
        });
        output += `\n`;
      }

      let tip: string | undefined;
      if (hasModified || hasUntracked) {
        tip = `💡 Dica: Você tem arquivos modificados! Execute 'git add chamada.txt' (ou 'git add .') para prepará-los para o commit.`;
      } else if (hasStaged) {
        tip = `💡 Dica: As alterações já estão preparadas (em verde)! Agora crie o commit com: git commit -m "Presente: ${newState.student.name}"`;
      }

      return { output, isError: false, tip, newState };
    }

    // GIT ADD
    if (gitSubCmd === "add") {
      const targetFile = args[2];
      if (!targetFile) {
        return {
          output: "Nothing specified, nothing added.\nMaybe you wanted to say 'git add .'?",
          isError: true,
          tip: "💡 Dica: Especifique o arquivo: 'git add chamada.txt' ou 'git add .' para adicionar todos.",
          newState,
        };
      }

      if (targetFile === "." || targetFile === "*") {
        if (newState.modifiedFiles.size === 0 && newState.untrackedFiles.size === 0) {
          return {
            output: "",
            isError: false,
            tip: "💡 Nada a ser adicionado. Você já editou o arquivo chamada.txt no editor à esquerda?",
            newState,
          };
        }
        newState.modifiedFiles.forEach((f) => newState.stagedFiles.add(f));
        newState.untrackedFiles.forEach((f) => newState.stagedFiles.add(f));
        newState.modifiedFiles.clear();
        newState.untrackedFiles.clear();

        return {
          output: "",
          isError: false,
          tip: `💡 Arquivos adicionados à área de preparação (Staging)!\n👉 Próximo passo: Crie o commit com: git commit -m "Presente: ${newState.student.name}"`,
          newState,
        };
      }

      const cleanFileName = targetFile.replace(/^\.\//, "");
      const fullPath = `${newState.repoFolder}/${cleanFileName}`;

      if (newState.files[fullPath] === undefined) {
        return {
          output: `fatal: pathspec '${targetFile}' did not match any files`,
          isError: true,
          tip: `💡 Dica: O arquivo '${targetFile}' não foi encontrado. Use 'ls' para ver o nome correto (ex: chamada.txt).`,
          newState,
        };
      }

      newState.stagedFiles.add(cleanFileName);
      newState.modifiedFiles.delete(cleanFileName);
      newState.untrackedFiles.delete(cleanFileName);

      return {
        output: "",
        isError: false,
        tip: `💡 Arquivo '${cleanFileName}' preparado com sucesso!\n👉 Próximo passo: Execute 'git commit -m "Presente: ${newState.student.name}"'`,
        newState,
      };
    }

    // GIT COMMIT
    if (gitSubCmd === "commit") {
      const mIndex = args.findIndex((a) => a === "-m" || a.startsWith("-m="));
      if (mIndex === -1) {
        return {
          output: "error: switch 'm' requires a value\nAborting commit due to empty commit message.",
          isError: true,
          tip: `💡 Dica: O commit precisa de uma mensagem explicativa com o parâmetro -m.\nExemplo: git commit -m "Presente: ${newState.student.name}"`,
          newState,
        };
      }

      const commitMessage = args[mIndex + 1]?.trim();
      if (!commitMessage) {
        return {
          output: "error: empty commit message specified.\nAborting commit.",
          isError: true,
          tip: `💡 Dica: Coloque a mensagem entre aspas após o -m!\nExemplo: git commit -m "Presente: ${newState.student.name}"`,
          newState,
        };
      }

      if (newState.stagedFiles.size === 0) {
        if (newState.modifiedFiles.size > 0) {
          return {
            output: `On branch main\nChanges not staged for commit:\n\tmodified:   chamada.txt\n\nno changes added to commit (use "git add")`,
            isError: true,
            tip: `💡 Dica: Você modificou o arquivo, mas esqueceu de prepará-lo com 'git add'!\nExecute primeiro: git add chamada.txt`,
            newState,
          };
        }
        return {
          output: "On branch main\nnothing to commit, working tree clean",
          isError: true,
          tip: `💡 Dica: Você ainda não modificou nenhum arquivo ou nada foi salvo. Abra 'chamada.txt' no editor, digite seu nome e salve (Ctrl+S).`,
          newState,
        };
      }

      const stagedList = Array.from(newState.stagedFiles);
      const commitHash = generateHash();
      const newCommit: Commit = {
        id: `commit-${Date.now()}`,
        hash: commitHash,
        author: newState.student.name,
        authorTurma: newState.student.turma,
        message: commitMessage,
        timestamp: new Date().toISOString(),
        filesChanged: stagedList,
      };

      newState.localCommits.unshift(newCommit);
      newState.stagedFiles.clear();

      return {
        output: `[main ${commitHash}] ${commitMessage}\n ${stagedList.length} file${stagedList.length > 1 ? "s" : ""} changed, 1 insertion(+)`,
        isError: false,
        tip: `💡 Perfeito! Commit gravado localmente no histórico!\n👉 Próximo passo: Envie para o GitHub executando:\ngit push origin main`,
        newState,
        stepCompleted: "commit",
      };
    }

    // GIT PUSH
    if (gitSubCmd === "push") {
      const localOnlyCommits = newState.localCommits.filter(
        (lc) => !newState.remoteRepo.commits.some((rc) => rc.hash === lc.hash)
      );

      if (localOnlyCommits.length === 0) {
        return {
          output: "Everything up-to-date",
          isError: false,
          tip: "💡 Todas as suas alterações já estão sincronizadas com o GitHub!",
          newState,
        };
      }

      const latestCommit = localOnlyCommits[0];
      const prevHash = newState.remoteRepo.commits[0]?.hash || "0000000";

      // Atualiza os arquivos no estado
      return {
        output: `Enumerating objects: 5, done.
Counting objects: 100% (5/5), done.
Writing objects: 100% (3/3), done.
Total 3 (delta 1), reused 0 (delta 0)
To ${newState.remoteRepo.cloneUrl}
   ${prevHash}..${latestCommit.hash}  main -> main`,
        isError: false,
        tip: `🎉 SUCESSO TOTAL! Seu commit foi enviado para o repositório da turma!\n👉 Acesse a aba 'GitHub' para ver seu nome na chamada e seu commit no histórico!`,
        newState,
        pushedCommit: latestCommit,
        stepCompleted: "push",
      };
    }

    // GIT LOG
    if (gitSubCmd === "log") {
      if (newState.localCommits.length === 0) {
        return { output: "fatal: your current branch 'main' does not have any commits yet", isError: false, newState };
      }

      const logOutput = newState.localCommits
        .map((c) => {
          const dateStr = new Date(c.timestamp).toLocaleString("pt-BR");
          return `\x1b[33mcommit ${c.hash}\x1b[0m\nAuthor: ${c.author} <${c.authorTurma}>\nDate:   ${dateStr}\n\n    ${c.message}\n`;
        })
        .join("\n");

      return { output: logOutput, isError: false, newState };
    }

    // GIT DIFF
    if (gitSubCmd === "diff") {
      if (newState.modifiedFiles.size === 0 && newState.untrackedFiles.size === 0) {
        return {
          output: "",
          isError: false,
          tip: "💡 Nenhuma alteração pendente no momento para exibir no diff.",
          newState,
        };
      }

      const diffOutput = `diff --git a/chamada.txt b/chamada.txt\n--- a/chamada.txt\n+++ b/chamada.txt\n@@ -34,3 +34,4 @@\n - [Docente] Prof. Augusto - Orientador\n\x1b[32m+ - [Aluno] ${newState.student.name} - ${newState.student.turma} (Presente)\x1b[0m`;
      return {
        output: diffOutput,
        isError: false,
        tip: "💡 O 'git diff' mostra exatamente o que foi adicionado (em verde) ou removido (em vermelho) antes do commit!",
        newState,
      };
    }

    // GIT BRANCH
    if (gitSubCmd === "branch") {
      return {
        output: `* \x1b[32mmain\x1b[0m`,
        isError: false,
        tip: "💡 O asterisco (*) e a cor verde indicam que sua branch atual ativa é a 'main'.",
        newState,
      };
    }

    return {
      output: `git: '${gitSubCmd}' não é um comando git suportado neste simulador.\nDigite 'help' para ver os comandos.`,
      isError: true,
      tip: `💡 Dica: Use os comandos principais: git clone, git status, git add, git commit -m "...", git push, git diff, git branch, git log.`,
      newState,
    };
  }

  // Comando não reconhecido
  return {
    output: `bash: ${cmd}: comando não encontrado`,
    isError: true,
    tip: `💡 Dica: Digite 'help' para ver a lista de comandos disponíveis no simulador.`,
    newState,
  };
}

// Quebra comandos encadeados por && respeitando aspas
function splitByLogicalAnd(input: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes: string | null = null;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if ((char === '"' || char === "'") && (i === 0 || input[i - 1] !== "\\")) {
      if (inQuotes === char) {
        inQuotes = null;
      } else if (!inQuotes) {
        inQuotes = char;
      }
    }

    if (!inQuotes && char === "&" && input[i + 1] === "&") {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = "";
      i++; // pula o segundo &
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

export function executeTerminalCommand(
  rawCommand: string,
  state: GitEngineState
): CommandExecutionResult {
  const parts = splitByLogicalAnd(rawCommand);

  if (parts.length <= 1) {
    return executeSingleTerminalCommand(rawCommand, state);
  }

  let currentState = state;
  const outputs: string[] = [];
  let lastTip: string | undefined;
  let pushedCommit: Commit | undefined;
  let stepCompleted: "clone" | "edit" | "commit" | "push" | undefined;

  for (const part of parts) {
    if (!part) continue;
    const result = executeSingleTerminalCommand(part, currentState);
    if (result.output) {
      outputs.push(result.output);
    }
    currentState = result.newState;
    if (result.tip) lastTip = result.tip;
    if (result.pushedCommit) pushedCommit = result.pushedCommit;
    if (result.stepCompleted) stepCompleted = result.stepCompleted;

    if (result.isError) {
      return {
        output: outputs.join("\n"),
        isError: true,
        tip: `⚠️ O comando '${part}' falhou. Os comandos seguintes da cadeia não foram executados.\n${result.tip || ""}`.trim(),
        newState: currentState,
        pushedCommit,
        stepCompleted,
      };
    }
  }

  return {
    output: outputs.join("\n"),
    isError: false,
    tip: lastTip,
    newState: currentState,
    pushedCommit,
    stepCompleted,
  };
}
