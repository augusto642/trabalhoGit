---
name: ui-ux-microinteractions-and-states
description: >-
  Use esta skill para projetar microinterações, transições suaves, estados de feedback
  completos (hover, focus-visible, active, disabled, loading, empty) e momentos de celebração na UI.
---

# ✨ Skill: Microinterações, Transições & Estados de UI

Interfaces profissionais se diferenciam pelo cuidado com os estados transitórios e o feedback imediato a cada ação do usuário.

---

## ⚡ Os 7 Estados Obrigatórios de Todo Componente Interativo

Nunca projete um botão, input ou card apenas em seu estado estático (*idle*). Todo elemento deve prever:

```
[ 1. Idle ] ---> [ 2. Hover ] ---> [ 3. Focus-Visible ] ---> [ 4. Active (Click) ]
      |
      +--------> [ 5. Loading ] ---> [ 6. Disabled ] --------> [ 7. Success / Feedback ]
```

### 1. Estado Idle (Repouso)
- Claro, com contraste adequado e cursor apropriado (`cursor-pointer`).

### 2. Estado Hover (Sobrevôo)
- Transição suave de cor ou elevação: `transition-all duration-150 ease-out`.
- Efeito sutil: clareamento do background (`hover:bg-[#30363d]`) ou leve elevação de sombra.

### 3. Estado Focus-Visible (Acessibilidade pelo Teclado)
- **Regra de Ouro:** Nunca remova o outline sem substituí-lo por um anel semântico visível:
  `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d1117]`

### 4. Estado Active (Pressionado)
- Sensação tátil de clique físico: `active:scale-[0.98] transition-transform`.

### 5. Estado Loading (Carregando)
- Indicação clara de progresso assíncrono:
  - Botão com spinner giratório (`animate-spin`) e texto trocado para gerúndio (ex: "Salvando...").
  - Cursor em espera (`cursor-wait`).
  - Skeleton screens com efeito de pulso suave (`animate-pulse bg-zinc-800/80 rounded-md`).

### 6. Estado Disabled (Desabilitado)
- Baixa opacidade com clareza funcional: `disabled:opacity-50 disabled:cursor-not-allowed`.
- Tooltip explicativo quando a ação estiver bloqueada por pré-requisito pendente.

### 7. Estado Success / Feedback (Celebração)
- Confirmação visual positiva:
  - Ícone de check animado (`CheckCircle2 text-emerald-400`).
  - Confetes para marcos principais (`canvas-confetti`).
  - Mudança temporária de texto (ex: de "Copiar" para "Copiado!").

---

## 🎭 Padrões de Empty States Elegantes

Evite listas ou painéis vazios com telas em branco ou textos frios ("Nenhum dado"). Um Empty State moderno deve conter:
1. **Ícone ou Ilustração Contextual:** Um ícone em círculo com fundo translúcido (ex: `FolderGit2` com `bg-blue-500/10 text-blue-400 p-4 rounded-full`).
2. **Título Direto e Positivo:** *"Nenhum commit encontrado ainda"*.
3. **Explicação Instrutiva:** *"Assim que você executar o primeiro git commit no terminal, ele aparecerá aqui com autor e data."*
4. **Chamada para Ação (CTA):** Botão ou link direcionando para a próxima etapa (ex: *"Abrir Terminal"*).

---

## 🪟 Tooltips & Badges Dinâmicos
- **Badges com pulso vivo:**
  ```tsx
  <span className="flex h-2 w-2 relative">
    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
  </span>
  ```
- **Transições de entrada de modais/cards:**
  - Suavidade com opacidade e leve deslocamento: `transition-all duration-200 transform scale-100 opacity-100`.
