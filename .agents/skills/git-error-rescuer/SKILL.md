---
name: git-error-rescuer
description: >-
  Use esta skill sempre que o estudante relatar um erro do Git, estiver em pânico
  com medo de ter perdido código, encontrar conflitos de merge, erros de push rejeitado ou detached HEAD.
---

# 🛟 Skill: Resgate Pedagógico de Erros de Git (Git Error Rescuer)

O objetivo desta skill é acolher o estudante iniciante, desmistificar o erro e transformá-lo em uma oportunidade de aprendizado seguro.

---

## 🛡️ Mandamentos do Resgate de Erros
1. **Tranquilize imediatamente**: A primeira frase deve sempre ser acolhedora. Ex.: *"Respire fundo! Seus arquivos estão a salvo e nós vamos resolver isso juntos passo a passo."*
2. **Desmistifique o papel do Git**: Explique que o Git não está brigando com o aluno; ele é como um cinto de segurança ou um guardião que travou a porta exatamente para proteger o código de ser sobrescrito acidentalmente.
3. **Nunca recomende comandos destrutivos a iniciantes**:
   - 🚫 Proibido recomendar de primeira: `git reset --hard`, `git push --force`, `git clean -f`.
   - ✅ Prefira investigar com comandos de observação inofensivos: `git status`, `git log --oneline -n 5`, `git branch`.

---

## 🔍 Dicionário de Erros Comuns & Roteiro de Resolução

### 1. `Updates were rejected because the remote contains work that you do not have locally` (Push Rejeitado)
- **O que o aluno sente**: Pânico achando que foi bloqueado ou que estragou o repositório.
- **Tradução Pedagógica**: *"O GitHub está dizendo: 'Ei! Alguém (ou você mesmo em outro computador) colocou novidades na nuvem enquanto você trabalhava. Se você jogar o seu agora por cima, você vai apagar o trabalho do outro sem querer. Pegue as novidades primeiro!'."*
- **Passo a Passo Seguro**:
  1. Verifique onde você está: `git status`
  2. Puxe as atualizações: `git pull origin main` (ou a branch atual)
  3. Agora que as novidades estão integradas, envie novamente: `git push origin main`

---

### 2. `CONFLICT (content): Merge conflict in <arquivo>` (Conflito de Merge)
- **O que o aluno sente**: Terror diante dos marcadores `<<<<<<< HEAD`, `=======` e `>>>>>>>`.
- **Tradução Pedagógica**: *"O Git é super inteligente para juntar arquivos, mas aqui duas pessoas alteraram exatamente a mesma linha ao mesmo tempo. Ele não quer adivinhar qual das duas é a certa e educadamente chamou você para decidir como humano."*
- **Passo a Passo Seguro**:
  1. Abra o arquivo no editor (como o VS Code, que mostra os botões "Accept Current Change", "Accept Incoming Change" ou "Accept Both").
  2. Escolha o conteúdo correto e apague os símbolos de marcação (`<<<<<<<`, `=======`, `>>>>>>>`).
  3. Salve o arquivo.
  4. Avise o Git que o conflito foi resolvido:
     ```bash
     git add <arquivo>
     git commit -m "fix: resolve conflito na linha X"
     ```

---

### 3. `fatal: not a git repository (or any of the parent directories): .git`
- **Tradução Pedagógica**: *"Você está tentando falar em código Git com uma pasta que ainda não foi apresentada ao Git, ou você está fora da pasta do projeto!"*
- **Passo a Passo Seguro**:
  1. Verifique em qual pasta você está: `pwd` (Linux/Mac) ou verifique o prompt do terminal.
  2. Se a pasta for a do projeto e acabou de ser criada: rode `git init`.
  3. Se você clonou um projeto e está na pasta de fora: use `cd <nome-da-pasta>`.

---

### 4. `You are in 'detached HEAD' state`
- **Tradução Pedagógica**: *"Lembra do nosso post-it? Você moveu o leitor (HEAD) para olhar um commit antigo, mas não está conectado ao post-it de nenhuma branch ativa. Nada foi quebrado! Você só está no modo de visualização do passado."*
- **Como voltar para casa**:
  ```bash
  git switch main
  # ou no Git antigo:
  git checkout main
  ```

---

### 5. "Fiz o commit mas esqueci um arquivo ou errei a mensagem!"
- **Tradução Pedagógica**: *"Não se preocupe! Dá para reabrir a foto e carimbar de novo sem poluir o histórico com `git commit --amend`."*
- **Passo a Passo**:
  ```bash
  git add <arquivo-esquecido>
  git commit --amend -m "Mensagem corrigida e completa"
  ```
