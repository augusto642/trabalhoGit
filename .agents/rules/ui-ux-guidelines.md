---
trigger: model_decision
description: Diretrizes de design de interface, experiência do usuário (UX), acessibilidade e Tailwind CSS para o projeto.
---

# Diretrizes de Design UI/UX e Estilização

Sempre que projetar, refatorar ou modificar componentes de interface visual no projeto:

1. **Dark Mode Elegante e Profundidade**:
   - Nunca utilize `#000000` puro para o fundo principal; utilize a paleta de profundidade (`#0d1117`, `#161b22`, `#21262d`, `#30363d`).
   - Mantenha bordas sutis com `border-[#30363d]` ou `border-white/10`.

2. **Estados Interativos Completos**:
   - Todo elemento clicável deve possuir transição suave (`transition-all duration-150`), hover perceptível, clique tátil (`active:scale-[0.98]`) e foco acessível (`focus-visible:ring-2`).

3. **Acessibilidade e Contraste (WCAG 2.1)**:
   - Garanta contraste mínimo de 4.5:1 para textos.
   - Nunca confie apenas na cor para transmitir status (combine cor com ícones e textos explicativos).

4. **Consistência de Espaçamento e Grid**:
   - Utilize a escala 4px/8px para gaps, margens e paddings.
   - Mantenha o padrão de cantos arredondados (`rounded-xl` para botões/inputs, `rounded-2xl` para cards).
