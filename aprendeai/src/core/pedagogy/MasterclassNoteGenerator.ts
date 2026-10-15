import { EditorContext } from '../../shared/messages';
import { ObsidianVaultStore, StudyNote } from '../memory/ObsidianVaultStore';
import { LLMGateway } from '../../adapters/llm/LLMGateway';

interface ConceptTemplate {
  title: string;
  concept: string;
  tags: string[];
  relatedConcepts: string[];
  mentalModel: string;
  realPain: string;
  juniorCode: string;
  seniorCode: string;
  codeExplanation: string;
  terminalStackTrace: string;
  stackTraceAnalysis: string;
  interviewGoldTip: string;
}

export class MasterclassNoteGenerator {
  /**
   * Gera uma nota pedagógica dinamicamente utilizando o LLMGateway ativo,
   * com fallback transparente para o gerador estruturado se o modelo estiver offline.
   */
  public static async generateDynamic(
    context?: EditorContext,
    topicOrPrompt?: string,
    onChunk?: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<StudyNote> {
    const rawTopic = (topicOrPrompt || '').trim();
    const lang = context?.languageId || 'typescript';
    const activeFile = context?.fileName || 'arquivo';

    const promptTitle = rawTopic || (context?.fileName ? `Boas Práticas e Arquitetura em ${activeFile}` : 'Padrões de Engenharia de Software');
    const slug = ObsidianVaultStore.slugify(promptTitle);

    try {
      const gateway = LLMGateway.getInstance();
      const provider = gateway.getActiveProvider();

      const systemPrompt = `Você é o AprendeAI, o mais conceituado Mentor e Arquiteto de Software.
Sua missão é produzir uma Nota Pedagógica Padrão-Ouro completa em Markdown sobre o tema fornecido.
A nota deve seguir RIGOROSAMENTE esta estrutura com cabeçalhos de nível 2:

# 🎓 Masterclass: [Título Conceitual Profundo]

> 📌 **Contexto do Workspace:** [Contexto do arquivo e linguagens]

---

## 1. 🧠 Analogia & Modelo Mental
[Explique com uma analogia visual do mundo real, memorável e intuitiva]

---

## 2. ⚡ A Dor Real (Por Que Isso Existe?)
[Explique as falhas em produção, gargalos de performance e dores que motivaram esse conceito]

---

## 3. ⚔️ Código Amador vs. Código Sênior

### ❌ Como o Amador / Júnior Implementa:
\`\`\`${lang}
[Código com vícios comuns, falta de tratamento de erro ou ineficiência]
\`\`\`

### ✅ Como o Desenvolvedor Sênior / Staff Implementa:
\`\`\`${lang}
[Código limpo, tipado, modular e resiliente]
\`\`\`

### 💡 Racional de Engenharia:
[Explicação detalhada dos trade-offs e decisões técnicas]

---

## 4. 🔍 Anatomia & Leitura da Stack Trace do Terminal

\`\`\`text
[Exemplo realista de erro ou stack trace associado]
\`\`\`

### 🛠️ Roteiro de Investigação Passo a Passo:
[Passo a passo numerado ensinando o desenvolvedor a ler o stack trace e encontrar a causa raiz]

---

## 5. 🏆 Dica de Ouro para Entrevista Técnica

**Pergunta de Entrevista:** "[Pergunta técnica difícil e frequente em big techs sobre este tópico]"

**Resposta Padrão-Ouro:** "[Resposta articulada de nível Staff Engineer]"

---
*Gerado automaticamente pelo AprendeAI Mentor Socrático • Padrão-Ouro de Pedagogia para Engenharia de Software*
`;

      let userPrompt = `Gere a nota de estudo no Padrão-Ouro sobre: "${promptTitle}" para a linguagem ${lang}.`;
      if (context?.selectedText) {
        userPrompt += `\nTrecho de código relevante analisado no editor:\n\`\`\`${lang}\n${context.selectedText}\n\`\`\``;
      }
      if (context?.terminalError) {
        userPrompt += `\nErro do terminal associado:\n\`\`\`\n${context.terminalError}\n\`\`\``;
      }

      const generatedContent = await provider.streamChat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: gateway.sanitizePrompt(userPrompt) }
        ],
        onChunk,
        signal,
        temperature: 0.3
      });

      if (generatedContent && generatedContent.length > 150) {
        return {
          title: `Masterclass: ${promptTitle}`,
          slug,
          concept: promptTitle,
          content: generatedContent,
          relatedConcepts: ['Clean-Architecture', 'Design-Patterns', 'Performance', 'Observabilidade'],
          mastery: 0.9,
          tags: [lang, 'masterclass', 'engenharia-software', 'aprendeai'],
          createdAt: new Date()
        };
      }
    } catch {
      // Fallback para o gerador com templates estáticos
    }

    return this.generate(context, topicOrPrompt);
  }

  /**
   * Gera uma nota pedagógica no Padrão-Ouro (Masterclass Note) a partir de templates
   */
  public static generate(context?: EditorContext, topicOrPrompt?: string): StudyNote {
    const conceptData = this.resolveConceptData(context, topicOrPrompt);
    const slug = ObsidianVaultStore.slugify(conceptData.concept);

    const markdownContent = this.buildMarkdownContent(conceptData, context);

    return {
      title: conceptData.title,
      slug,
      concept: conceptData.concept,
      content: markdownContent,
      relatedConcepts: conceptData.relatedConcepts,
      mastery: 0.85,
      tags: conceptData.tags,
      createdAt: new Date()
    };
  }

  private static resolveConceptData(context?: EditorContext, topicOrPrompt?: string): ConceptTemplate {
    const rawTopic = (topicOrPrompt || '').trim();
    const lang = context?.languageId || 'typescript';
    const activeFile = context?.fileName || 'arquivo';

    // Se temos um erro do terminal, priorizar análise de diagnóstico e resiliência
    if (context?.terminalError || rawTopic.toLowerCase().includes('erro') || rawTopic.toLowerCase().includes('terminal')) {
      const errSnippet = context?.terminalError || 'Error: UnhandledPromiseRejection / TypeError';
      return {
        title: `Diagnóstico de Erros & Resiliência em ${lang.toUpperCase()}`,
        concept: `Tratamento de Erros e Stack Traces em ${lang.toUpperCase()}`,
        tags: ['debugging', 'error-handling', 'stack-trace', lang, 'resiliencia'],
        relatedConcepts: ['Graceful-Degradation', 'Result-Pattern', 'Tipagem-Defensiva', 'Observabilidade'],
        mentalModel: `Pense em um sistema sem tratamento de erro como um trem de alta velocidade sem freios de emergência: qualquer pedra nos trilhos descarrila a composição inteira. Uma arquitetura resiliente é como comportas de um submarino: quando uma câmara é inundada (um erro ocorre), a comporta se fecha isolando a falha e permitindo que o resto do navio continue operando em segurança.`,
        realPain: `Erros não tratados em produção derrubam pods inteiros, causam vazamento de memória e travam a experiência do usuário sem deixar rastros. Em JavaScript/TypeScript e Node.js, erros assíncronos não capturados (` + '`UnhandledPromiseRejection`' + `) historicamente encerravam processos inteiros do Node, provocando indisponibilidade de microsserviços inteiros.`,
        juniorCode: `// ❌ Código Amador: Try/catch engolindo erros ou sem contexto
async function fetchUser(id: string) {
  try {
    const res = await api.get(\`/users/\${id}\`);
    return res.data;
  } catch (err) {
    // Engole o erro ou dá apenas console.log
    console.log("deu erro:", err);
    return null; // O chamador recebe null e quebra mais tarde com TypeError: Cannot read properties of null
  }
}`,
        seniorCode: `// ✅ Código Sênior: Result Pattern / Erros Tipados com Contexto
type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

export class UserNotFoundError extends Error {
  constructor(public readonly userId: string) {
    super(\`Usuário com ID \${userId} não encontrado no repositório.\`);
    this.name = 'UserNotFoundError';
  }
}

export async function findUserSafe(id: string): Promise<Result<UserData, UserNotFoundError | AppNetworkError>> {
  try {
    const response = await api.get<UserData>(\`/users/\${id}\`);
    return { success: true, data: response.data };
  } catch (error: unknown) {
    if (isAxios404(error)) {
      return { success: false, error: new UserNotFoundError(id) };
    }
    return { 
      success: false, 
      error: new AppNetworkError('Falha de infraestrutura ao buscar usuário', { cause: error }) 
    };
  }
}`,
        codeExplanation: `O desenvolvedor sênior não esconde falhas com 'return null' nem silencia exceções. Ele modela erros explicitamente no sistema de tipos (` + '`Result<T, E>`' + `), preserva a causa raiz original com \`Error.cause\` e assegura que quem consome a função é forçado pelo compilador a lidar com o cenário de falha.`,
        terminalStackTrace: `TypeError: Cannot read properties of undefined (reading 'data')
    at findUser (c:/projeto/src/services/userService.ts:42:25)
    at processTicksAndRejections (node:internal/process/task_queues:95:5)
    at async UserController.handle (c:/projeto/src/controllers/userController.ts:18:20)`,
        stackTraceAnalysis: `1. **Última Linha Executada:** A primeira linha da stack trace aponta para \`userService.ts:42:25\`. O objeto que precedia \`.data\` era \`undefined\`.\n2. **Origem:** O erro não começou em \`UserController\`, ele estourou na camada de serviço porque a resposta da rede foi vazia ou uma exceção anterior foi mal gerenciada.\n3. **Ação Rápida:** Checar se a API remota retornou resposta vazia e validar a existência do objeto antes de acessar propriedades profundas (ex: \`response?.data\`).`,
        interviewGoldTip: `**Pergunta de Entrevista:** *"Como você lida com exceções em arquiteturas assíncronas de microsserviços?"*\n\n**Resposta Padrão-Ouro:** "Eu evito usar exceções para controle de fluxo habitual de regras de negócio. Adoto o Result Pattern ou classes de erro de domínio específicas com herança limpa. Para erros de infraestrutura, utilizo Error Cause do ES2022 para manter a stack trace original, implemento circuit breakers e garanto que filtros globais capturem exceções não tratadas, convertendo-as em respostas RFC 7807 (Problem Details) com correlation IDs para observabilidade."`
      };
    }

    // Se há trecho de código selecionado ou arquivo TypeScript/JavaScript
    const isAsyncOrState = rawTopic.toLowerCase().includes('async') ||
      rawTopic.toLowerCase().includes('promise') ||
      (context?.selectedText && context.selectedText.includes('await'));

    if (isAsyncOrState) {
      return {
        title: `Programação Assíncrona & Event Loop em ${lang.toUpperCase()}`,
        concept: `Event Loop, Promises e Concorrência Não-Bloqueante`,
        tags: ['javascript', 'typescript', 'async-await', 'event-loop', 'concorrencia'],
        relatedConcepts: ['Microtasks-e-Macrotasks', 'Promise-AllSettled', 'Worker-Threads', 'Clean-Code'],
        mentalModel: `Imagine um restaurante com um único garçom (a Call Stack single-threaded). Se o garçom ficasse parado na frente do forno esperando a pizza assar por 20 minutos (I/O bloqueante síncrono), nenhum outro cliente seria atendido. Em vez disso, ele anota o pedido, entrega para a cozinha (Libuv / APIs do ambiente) e vai atender outras mesas. Quando a pizza fica pronta, um aviso toca e a entrega entra na fila (Task Queue) para o garçom entregar assim que as mãos estiverem livres.`,
        realPain: `Operações de I/O (leitura em disco, requisições HTTP, queries ao banco) levam milhões de ciclos de clock em comparação com operações em CPU. Se você bloquear a thread principal em Node.js ou no navegador com chamadas síncronas, o servidor para de responder a todos os outros clientes e a UI congela completamente.`,
        juniorCode: `// ❌ Código Amador: Waterfall assíncrono acidental
async function carregarDashboard(usuarioId: string) {
  // Executa uma após a outra em série desnecessariamente: 300ms + 400ms + 250ms = 950ms!
  const usuario = await buscarUsuario(usuarioId);
  const pedidos = await buscarPedidos(usuarioId);
  const recomendacoes = await buscarRecomendacoes(usuarioId);
  return { usuario, pedidos, recomendacoes };
}`,
        seniorCode: `// ✅ Código Sênior: Concorrência orquestrada com tratamento resiliente
async function carregarDashboardSenior(usuarioId: string) {
  // Dispara as promessas em paralelo: tempo total = max(300ms, 400ms, 250ms) ≈ 400ms!
  const [usuarioRes, pedidosRes, recomendacoesRes] = await Promise.allSettled([
    buscarUsuario(usuarioId),
    buscarPedidos(usuarioId),
    buscarRecomendacoes(usuarioId)
  ]);

  return {
    usuario: usuarioRes.status === 'fulfilled' ? usuarioRes.value : null,
    pedidos: pedidosRes.status === 'fulfilled' ? pedidosRes.value : [],
    recomendacoes: recomendacoesRes.status === 'fulfilled' ? recomendacoesRes.value : []
  };
}`,
        codeExplanation: `O desenvolvedor sênior entende a diferença entre execução sequencial e paralela. Usar \`Promise.allSettled\` em vez de \`Promise.all\` garante que a falha de um serviço secundário (como recomendações) não comprometa o carregamento de dados vitais (como perfil e pedidos).`,
        terminalStackTrace: `UnhandledPromiseRejection: This error originated either by throwing inside of an async function without a catch block, or by rejecting a promise which was not handled with .catch().
    at carregarDashboard (c:/app/src/dashboard.ts:12:11)
    at runMicrotasks (<anonymous>)
    at processTicksAndRejections (node:internal/process/task_queues:95:5)`,
        stackTraceAnalysis: `1. **Origem:** O erro aconteceu dentro de uma Promise que foi rejeitada sem tratamento na linha \`dashboard.ts:12\`.\n2. **Ciclo do Event Loop:** \`runMicrotasks\` indica que a rejeição estourou durante o esvaziamento da Microtask Queue, logo após o término da função síncrona atual.\n3. **Solução:** Envolver a chamada com bloco \`try/catch\` ou utilizar \`Promise.allSettled\`.`,
        interviewGoldTip: `**Pergunta de Entrevista:** *"Qual a diferença entre a Microtask Queue e a Macrotask (Callback) Queue no Event Loop do V8?"*\n\n**Resposta Padrão-Ouro:** "No Event Loop do V8, as Microtasks (Promises resolved/rejected, process.nextTick, queueMicrotask) têm prioridade absoluta sobre as Macrotasks (setTimeout, setInterval, setImmediate, I/O). Antes de pegar o próximo evento da Macrotask Queue ou renderizar na tela, o motor drena completamente todas as microtarefas pendentes na Microtask Queue. Se você enfileirar microtarefas recursivamente, você causa Starvation (inanição) das macrotasks e do I/O."`
      };
    }

    // Conceito genérico baseado no contexto do arquivo ou prompt
    const inferredConcept = rawTopic || (context?.fileName ? `Arquitetura e Boas Práticas em ${activeFile}` : 'Clean Architecture & Padrões Sênior');

    return {
      title: `Masterclass: ${inferredConcept}`,
      concept: inferredConcept,
      tags: ['arquitetura', 'clean-code', 'design-patterns', lang, 'software-engineering'],
      relatedConcepts: ['Clean-Architecture', 'Single-Responsibility', 'Inversion-of-Control', 'Testes-Automatizados'],
      mentalModel: `Pense em software de produção como um edifício modular projetado para terremotos: os componentes não são colados com concreto maciço e inflexível, mas sim acoplados por juntas de dilatação e interfaces bem definidas. Se um cano de água estourar no 3º andar, você substitui a conexão hidráulica sem precisar demolir as paredes estruturais do prédio.`,
      realPain: `Sistemas acoplados tornam-se impossíveis de alterar após 6 meses de projeto. Uma alteração simples no formato de uma resposta HTTP quebra regras de banco de dados e regras de negócio porque não há fronteiras arquiteturais claras entre as camadas.`,
      juniorCode: `// ❌ Código Amador: Acoplamento direto entre camadas
class PedidoController {
  async criarPedido(req: any, res: any) {
    // Controller fazendo validação, regra de negócio, query SQL direta e envio de e-mail!
    const db = new Database();
    const usuario = await db.query("SELECT * FROM users WHERE id = ?", [req.body.userId]);
    const preco = req.body.itens.reduce((acc: number, item: any) => acc + item.preco, 0);
    await db.query("INSERT INTO pedidos VALUES (?, ?)", [usuario.id, preco]);
    await sendgrid.sendEmail({ to: usuario.email, text: "Pedido confirmado!" });
    res.json({ ok: true });
  }
}`,
      seniorCode: `// ✅ Código Sênior: Separação de Responsabilidades & Inversão de Dependência
interface OrderRepository {
  save(order: Order): Promise<void>;
}

interface NotificationService {
  notifyOrderCreated(order: Order, customer: Customer): Promise<void>;
}

export class CreateOrderUseCase {
  constructor(
    private readonly orderRepo: OrderRepository,
    private readonly notificationService: NotificationService
  ) {}

  public async execute(input: CreateOrderInput): Promise<OrderResult> {
    const order = Order.create(input.customerId, input.items);
    await this.orderRepo.save(order);
    await this.notificationService.notifyOrderCreated(order, input.customer);
    return OrderResult.success(order.id);
  }
}`,
      codeExplanation: `O desenvolvedor sênior isola as Regras de Domínio e Casos de Uso através de Interfaces (Portas e Adaptadores). A lógica de negócio pura não sabe se o banco de dados é PostgreSQL ou MongoDB, nem se a notificação é via SendGrid ou Amazon SES. Isso permite testes unitários instantâneos com mocks em milissegundos.`,
      terminalStackTrace: `Error: Cannot find module '@infra/database/client'
Require stack:
- c:/projeto/src/controllers/pedidoController.ts
    at Module._resolveFilename (node:internal/modules/cjs/loader:1077:15)
    at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:86:12)`,
      stackTraceAnalysis: `1. **Diagnóstico Imediato:** O erro \`Cannot find module\` indica falha na resolução de caminhos de módulos em tempo de execução.\n2. **Causa Raiz:** Uso de path alias (ex: \`@infra\`) configurado no \`tsconfig.json\` sem resolver no bundler de produção (esbuild/ts-node).\n3. **Solução:** Configurar mapeamento de aliases nas configurações de build ou utilizar caminhos relativos consistentes.`,
      interviewGoldTip: `**Pergunta de Entrevista:** *"Como você garante testabilidade e manutenção em sistemas que evoluem rapidamente?"*\n\n**Resposta Padrão-Ouro:** "Eu aplico o Princípio da Inversão de Dependência (DIP) e Arquitetura Hexagonal. As entidades de domínio e os casos de uso residem no núcleo sem depender de frameworks externos ou bibliotecas de terceiros. As dependências externas são injetadas através de contratos tipados (interfaces), viabilizando testes unitários sem I/O real e permitindo substituição tecnológica sem refatoração de regras de negócio."`
    };
  }

  private static buildMarkdownContent(data: ConceptTemplate, context?: EditorContext): string {
    const activeFileSection = context?.fileName
      ? `> 📌 **Contexto do Workspace:** Arquivo ativo \`${context.fileName}\`${context.selectionStartLine ? ` (linhas ${context.selectionStartLine}-${context.selectionEndLine})` : ''}\n\n`
      : '';

    const selectedCodeSection = context?.selectedText
      ? `### 📝 Trecho Analisado no Editor\n\`\`\`${context.languageId || 'typescript'}\n${context.selectedText}\n\`\`\`\n\n`
      : '';

    return `# 🎓 ${data.title}

${activeFileSection}${selectedCodeSection}---

## 1. 🧠 Analogia & Modelo Mental
${data.mentalModel}

---

## 2. ⚡ A Dor Real (Por Que Isso Existe?)
${data.realPain}

---

## 3. ⚔️ Código Amador vs. Código Sênior

### ❌ Como o Amador / Júnior Implementa:
\`\`\`typescript
${data.juniorCode}
\`\`\`

### ✅ Como o Desenvolvedor Sênior / Staff Implementa:
\`\`\`typescript
${data.seniorCode}
\`\`\`

### 💡 Racional de Engenharia:
${data.codeExplanation}

---

## 4. 🔍 Anatomia & Leitura da Stack Trace do Terminal

\`\`\`text
${data.terminalStackTrace}
\`\`\`

### 🛠️ Roteiro de Investigação Passo a Passo:
${data.stackTraceAnalysis}

---

## 5. 🏆 Dica de Ouro para Entrevista Técnica

${data.interviewGoldTip}

---
*Gerado automaticamente pelo AprendeAI Mentor Socrático • Padrão-Ouro de Pedagogia para Engenharia de Software*
`;
  }
}
