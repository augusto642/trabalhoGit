import { Repository } from "./types";

export const INITIAL_REPOSITORY: Repository = {
  id: "repo-turma-a",
  name: "chamada-turma-a",
  owner: "prof-augusto",
  description: "Repositório oficial para a chamada de presença e introdução prática aos comandos Git & fluxo GitHub.",
  defaultBranch: "main",
  cloneUrl: "https://gitsim.edu/prof-augusto/chamada-turma-a.git",
  files: {
    "README.md": `# 📚 Chamada de Presença - Turma A

Bem-vindo(a) ao repositório oficial da disciplina!

## 🎯 Instruções do Exercício:
1. Copie o link HTTPS deste repositório clicando no botão verde **<> Code** acima.
2. Acesse a aba **VS Code** na barra superior.
3. No terminal do VS Code, clone este repositório executando:
   \`git clone https://gitsim.edu/prof-augusto/chamada-turma-a.git\`
4. Entre na pasta criada:
   \`cd chamada-turma-a\`
5. Abra o arquivo \`chamada.txt\` no explorador de arquivos à esquerda, digite seu nome e salve (**Ctrl+S** ou botão Salvar).
6. Verifique o status com \`git status\`.
7. Adicione o arquivo modificado com \`git add chamada.txt\` (ou \`git add .\`).
8. Crie o seu commit com \`git commit -m "Presente: Seu Nome"\`.
9. Envie para o GitHub com \`git push origin main\`.

Ao finalizar, volte a esta página para ver seu nome na lista e seu commit no histórico! 🚀
`,
    "chamada.txt": `========================================
       LISTA DE PRESENÇA - TURMA A
========================================
Instruções: Adicione seu nome completo e turma nas linhas abaixo:

- [Docente] Prof. Augusto - Orientador
`,
  },
  commits: [
    {
      id: "commit-init-001",
      hash: "a1b2c3d",
      author: "Prof. Augusto",
      authorTurma: "Docente",
      message: "Initial commit: Configurado README e lista de chamada da turma",
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      filesChanged: ["README.md", "chamada.txt"],
    },
  ],
  updatedAt: new Date().toISOString(),
};
