---
name: ui-accessibility-and-hierarchy
description: >-
  Use esta skill para auditar e implementar acessibilidade (WCAG 2.1 AA/AAA),
  hierarquia visual sem ruído, ergonomia de toque e redução de carga cognitiva na interface.
---

# 👁️ Skill: Acessibilidade (WCAG), Hierarquia Visual & Ergonomia

Interfaces inclusivas e visualmente hierarquizadas garantem que qualquer usuário, independentemente do dispositivo ou habilidade motora/visual, consiga navegar com facilidade.

---

## ⚖️ Conformidade com WCAG 2.1 (Nível AA e AAA)

### 1. Razões de Contraste Mínimo
- **Texto Normal (< 18pt / 24px):** Relação mínima de **4.5:1** em relação ao fundo.
  - Exemplo correto em Dark Mode: Texto `#c9d1d9` ou `#e6edf3` sobre fundo `#0d1117` (contraste > 10:1).
  - Evite cinza escuro sobre fundo preto (`#555555` sobre `#0d1117` possui contraste insuficiente de apenas 2.5:1).
- **Texto Grande (≥ 18pt ou negrito ≥ 14pt) e Ícones:** Relação mínima de **3:1**.

### 2. Acessibilidade sem Confiar Apenas na Cor
- **Nunca use apenas a cor para comunicar um estado:**
  - Se um status for verde para sucesso, inclua também um ícone de check (`CheckCircle2`) ou texto explícito ("Concluído").
  - Se um arquivo estiver com erro, use cor vermelha acompanhada de ícone de alerta e descrição textual.

### 3. Ergonomia de Toque (Touch Targets)
- Todos os botões, links e alvos de clique devem ter área interativa mínima de **44x44 pixels** em dispositivos móveis.
- Adicione padding adequado (`p-2.5` ou `px-4 py-2.5`) para evitar cliques acidentais em elementos adjacentes.

---

## 🏛️ Princípios de Hierarquia Visual & Leis da Gestalt

### 1. Princípio da Proximidade
- Elementos relacionados devem estar próximos uns dos outros (`gap-1.5` ou `space-y-1`).
- Seções distintas devem ter separação generosa (`mb-8` ou `py-10`), facilitando o escaneamento visual da página em formato "F" ou "Z".

### 2. Contraste de Escala & Peso
- Em vez de aumentar indiscriminadamente o tamanho de todas as fontes, use o **peso da fonte** e a **cor semântica** para guiar os olhos:
  - Título principal: `text-2xl sm:text-3xl font-extrabold text-white`
  - Subtítulo explicativo: `text-sm font-normal text-gray-400`
  - Metadado / Tag: `text-[11px] font-semibold tracking-wider uppercase text-gray-500`

### 3. Redução de Ruído Cognitivo
- Evite elementos visuais desnecessários (linhas grossas, excesso de cores simultâneas, gradientes concorrentes).
- Um gradiente deve ter propósito claro de destaque (Hero Banner, botão de ação primária). O restante da interface deve manter serenidade e foco no conteúdo.

---

## ⌨️ Navegação Inclusiva por Teclado
- Garanta que toda a interface possa ser navegada exclusivamente com a tecla `Tab`.
- Elementos focados devem exibir indicador evidente de foco:
  `focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2`
- Diálogos modais devem capturar o foco (*Focus Trap*) e fechar com a tecla `Escape`.
