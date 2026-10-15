---
name: git-mental-models
description: >-
  Use esta skill para explicar conceitos fundamentais de Git utilizando modelos
  mentais visuais, analogias cotidianas e metáforas intuitivas para estudantes iniciantes.
---

# 🧠 Skill: Modelos Mentais e Analogias de Git

Esta skill orienta o agente na transmissão de conceitos abstratos do Git de forma visual, empática e conectada ao cotidiano dos estudantes.

---

## 🏛️ O Modelo das Três Áreas do Git

Ao introduzir o funcionamento do Git local, utilize a metáfora da **"Mesa de Trabalho, Caixa de Encomenda e Cofre Fotográfico"**:

```
+------------------------+      git add       +------------------------+     git commit      +------------------------+
| 1. Working Directory   | -----------------> | 2. Staging Area (Index)| ------------------> | 3. Git Repository      |
| (Mesa de Trabalho)     |                    | (Caixa de Despacho)    |                     | (Cofre de Snapshots)   |
| Seus arquivos abertos  | <----------------- | O que vai na foto      |                     | Histórico imutável     |
| e modificados no VSCode|   git restore .    | pronta pra carimbar    |                     | salvo para sempre      |
+------------------------+                    +------------------------+                     +------------------------+
```

### Explicação em Linguagem Humana:
1. **Working Directory (Mesa de Trabalho / Editor)**:
   - É onde você escreve código, erra, apaga e testa. O Git está de olho, mas ainda não guardou nada permanentemente.
2. **Staging Area / Index (A Caixa de Encomenda / Preparação da Foto)**:
   - Você escolhe quais alterações quer incluir no pacote. É a oportunidade de organizar o que faz sentido ir junto (`git add <arquivo>`).
3. **Local Repository / Histórico (O Cofre de Fotografias)**:
   - O `git commit` é o clique da câmera fotográfica. Uma vez tirada a foto (com mensagem clara do que mudou), ela recebe um código único (hash SHA) e é guardada para sempre no cofre.

---

## 🌿 O que é uma Branch (Ramo)?

### Analogia do Post-it Móvel:
- **O que muitos alunos pensam**: "Uma branch é uma cópia duplicada pesada de toda a pasta do meu projeto."
- **A realidade didática**: "Uma branch é apenas um **post-it adesivo com um nome**, apontando para o último commit daquela linha de história."
- Criar uma branch não gasta quase nada de memória nem duplica seus arquivos. É apenas um marcador móvel.

```
       (main)
         v
[C1] <- [C2] <- [C3]
                  ^
              (HEAD) -> "Você está aqui!"
```

---

## 🎯 O que é o HEAD?

- **Metáfora**: O marcador **"VOCÊ ESTÁ AQUI"** de um mapa de shopping center ou a agulha de um toca-discos.
- O `HEAD` aponta normalmente para a branch em que você está trabalhando no momento (`main`, `feature/minha-tela`).
- **Detached HEAD**: Se o `HEAD` apontar diretamente para um commit antigo em vez de uma branch, significa apenas que a agulha do toca-discos foi posicionada manualmente em uma faixa antiga para você ouvir (ou olhar), sem estar preso a um post-it de branch.

---

## ☁️ Git Local vs. Git Remoto (GitHub)

- **Git**: O motor do carro, a ferramenta que roda na sua máquina offline. Você pode fazer commits no meio da floresta sem internet.
- **GitHub / GitLab**: A garagem compartilhada nas nuvens onde você expõe seu carro para seus colegas poderem olhar ou clonar.
- **Comandos de Ponte**:
  - `git push`: "Empurrar" minhas fotos locais para a garagem compartilhada.
  - `git pull`: "Puxar" as fotos mais recentes da garagem compartilhada para a minha máquina.
  - `git clone`: "Baixar uma cópia completa da garagem" para começar a trabalhar.

---

## 💡 Diretrizes Didáticas ao Usar Esta Skill:
1. **Pergunte antes de despejar conteúdo**: Ex.: *"Você já jogou algum videogame que tem pontos de salvamento (checkpoints)? O commit é exatamente isso!"*
2. **Faça o aluno desenhar mentalmente**: Use pequenas representações em texto ou pergunte em qual das 3 áreas o arquivo dele está após cada comando.
3. **Evite jargões sem tradução imediata**: Se falar *SHA-1*, explique: *"É como o número do RG ou CPF daquele ponto de salvamento"*.
