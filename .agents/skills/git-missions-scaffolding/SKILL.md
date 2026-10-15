---
name: git-missions-scaffolding
description: >-
  Use esta skill para propor trilhas práticas de aprendizado, desafios graduais
  (scaffolding) e missões de fixação em Git para iniciantes, com feedback formativo.
---

# 🚀 Skill: Missões Práticas & Andaime Pedagógico de Git

Esta skill estrutura o aprendizado do aluno em desafios graduais, evitando sobrecarga cognitiva e garantindo que cada conceito seja consolidado na prática antes de avançar.

---

## 🧗 As 4 Fases do Aprendizado Gradual (Scaffolding)

```
[ Nível 1: Primeiro Passo ] ---> [ Nível 2: O Historiador ] ---> [ Nível 3: O Ramificador ] ---> [ Nível 4: O Colaborador ]
(init, add, commit)              (log, diff, restore)             (branch, switch, merge)          (remote, push, pull, PR)
```

---

### 🟢 Missão Nível 1: O Primeiro Checkpoint
*Meta: Perder o medo do terminal e salvar o primeiro estado do projeto.*

1. **Desafio**:
   - Crie uma pasta de teste e inicialize o repositório:
     `git init`
   - Crie um arquivo `meu_diario.txt` e escreva uma frase sobre seu dia.
   - Pergunte ao Git o que ele está achando:
     `git status` *(Observe o arquivo vermelho: não rastreado)*
   - Coloque o arquivo na caixa de despacho:
     `git add meu_diario.txt`
   - Confira o `git status` novamente *(Observe o arquivo verde: pronto para a foto!)*
   - Registre seu primeiro snapshot:
     `git commit -m "feat: cria meu primeiro diário"`

2. **Pergunta Socrática para o Aluno**:
   - *"O que você acha que aconteceria se você rodasse `git commit` sem ter dado `git add` antes?"*

---

### 🟡 Missão Nível 2: O Historiador (Navegando no Tempo)
*Meta: Entender que o Git é uma máquina do tempo segura.*

1. **Desafio**:
   - Adicione uma nova linha no arquivo `meu_diario.txt`.
   - Antes de dar add, veja exatamente o que mudou com:
     `git diff`
   - Adicione e faça o segundo commit:
     `git add . && git commit -m "docs: adiciona meta da semana"`
   - Explore o álbum de fotos do projeto:
     `git log --oneline --graph --decorate`

2. **Dica de Ouro**:
   - Commits são como capítulos de um livro. Mensagens claras ajudam o seu "eu do futuro" a entender o que foi feito!

---

### 🟠 Missão Nível 3: O Ramificador (Criando Universos Paralelos)
*Meta: Entender branches sem medo de quebrar o trabalho principal.*

1. **Desafio**:
   - Crie uma nova branch para testar uma ideia maluca sem risco:
     `git switch -c teste-ideia-nova` *(ou `git checkout -b teste-ideia-nova`)*
   - Modifique o arquivo e faça um commit nessa branch.
   - Volte para a linha do tempo principal:
     `git switch main`
   - Abra o arquivo: a alteração maluca sumiu dali!
   - Junte o trabalho aprovado:
     `git merge teste-ideia-nova`

2. **Feedback Formativo**:
   - Elogie o estudante por não fazer experimentos direto na `main`!

---

### 🔴 Missão Nível 4: O Colaborador (GitHub & Nuvem)
*Meta: Conectar o Git local ao repositório remoto e trabalhar em equipe.*

1. **Desafio (Alinhado com a Atividade do Simulador)**:
   - Conecte o repositório local ao repositório da turma:
     `git remote add origin https://gitsim.edu/turma/chamada.git`
   - Envie seus commits para a turma:
     `git push -u origin main`
   - Puxe as atualizações dos colegas:
     `git pull origin main`

---

## 🏆 Critérios de Feedback Formativo:
- **Elogie o processo**: Notou que o aluno usou mensagens de commit claras? Destaque isso!
- **Encorage o hábito do `git status`**: O `git status` é a bússola do marinheiro; recomende sempre rodá-lo na dúvida.
- **Micro-vitórias**: Celebre cada comando concluído com sucesso.
