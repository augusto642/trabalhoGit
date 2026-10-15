---
name: ui-design-tokens-and-theming
description: >-
  Use esta skill para orientar a definição de tokens de design, sistemas de cores semânticas,
  paletas de Dark Mode refinado, tipografia modular e superfícies com profundidade estética.
---

# 🎨 Skill: Design Tokens, Superfícies & Temas (UI Theming)

Esta skill guia o agente na criação e manutenção de sistemas visuais coesos, modernos e com acabamento de nível internacional.

---

## 🖤 A Filosofia do Dark Mode Elegante

Interfaces escuras modernas nunca utilizam preto puro (`#000000`) como fundo de página. O preto puro gera contraste excessivo e cansativo para a visão humana. Em vez disso, utilize **camadas de profundidade tonal (Elevation Layers)** inspiradas em produtos como GitHub, Vercel e VS Code:

### 1. Camadas de Profundidade (Elevation Stack)
| Nível de Camada | Exemplo Tailwind / Hex | Finalidade |
| :--- | :--- | :--- |
| **Camada 0: Base / Canvas** | `bg-[#0d1117]` ou `bg-zinc-950` | Fundo principal da página. Menor luminosidade. |
| **Camada 1: Superfícies / Cards** | `bg-[#161b22]` ou `bg-zinc-900` | Containers, seções, cards de conteúdo. |
| **Camada 2: Elementos Interativos**| `bg-[#21262d]` ou `bg-zinc-800` | Inputs, botões secundários, caixas de código. |
| **Camada 3: Modais / Popovers** | `bg-[#1c2128]` ou `bg-zinc-800/90` | Elementos suspensos com elevação e sombra. |

### 2. Bordas Sutis e Delicadas
Em fundos escuros, as bordas não devem ser pesadas. Prefira bordas com espessura de 1px e opacidade semântica:
- **Padrão de borda de card:** `border border-[#30363d]` ou `border border-white/10`
- **Borda de destaque sutil:** `hover:border-[#484f58]` ou `hover:border-white/20`
- **Borda com brilho sutil (Subtle Glow):** `border border-blue-500/30 shadow-[0_0_15px_-3px_rgba(59,130,246,0.15)]`

---

## 🚦 Paleta Semântica de Estados

Nunca utilize cores puras saturadas que agridem os olhos. Utilize combinações balanceadas com fundos em tintura translúcida:

| Estado Semântico | Cor do Texto / Ícone | Fundo do Badge / Alerta | Borda |
| :--- | :--- | :--- | :--- |
| **Sucesso (Success)** | `text-emerald-400` | `bg-emerald-500/10` | `border-emerald-500/30` |
| **Atenção (Warning)** | `text-amber-400` | `bg-amber-500/10` | `border-amber-500/30` |
| **Erro / Perigo (Danger)**| `text-rose-400` | `bg-rose-500/10` | `border-rose-500/30` |
| **Informativo (Info)** | `text-sky-400` | `bg-sky-500/10` | `border-sky-500/30` |
| **Destaque Primário** | `text-blue-400` | `bg-blue-600` (botão sólido) | `shadow-lg shadow-blue-600/25` |

---

## 🔤 Escala Tipográfica & Contraste de Texto

- **Texto Principal / Títulos:** `text-white` ou `text-zinc-100` (alto contraste, máxima legibilidade).
- **Texto Secundário / Corpo:** `text-[#c9d1d9]` ou `text-zinc-300` (confortável para leitura contínua).
- **Legendas & Metadados:** `text-[#8b949e]` ou `text-zinc-500` (discreto, reduz a competição pelo foco visual).
- **Código & Terminais:** Utilize fontes monoespaçadas autênticas (`font-mono`) com espaçamento balanceado (`tracking-tight` ou `tracking-normal`).

---

## 📐 Regras de Consistência Espacial (Grid 4px/8px)
- Margens e paddings devem sempre seguir múltiplos de 4px:
  - Microespaços (entre ícone e texto): `gap-1.5` (6px) ou `gap-2` (8px).
  - Espaços internos de cards: `p-4` (16px), `p-6` (24px) ou `p-8` (32px).
  - Espaços entre seções: `space-y-6` (24px) ou `space-y-10` (40px).
- **Bordas arredondadas (Radius):** Mantenha consistência:
  - Botões e tags: `rounded-lg` (8px) ou `rounded-xl` (12px).
  - Cards e containers: `rounded-2xl` (16px).
  - Pills e badges: `rounded-full`.
