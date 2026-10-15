import * as vscode from 'vscode';
import { EditorContext, HintLevel, LLMProviderType, ProviderStatusInfo, ChatMessage, StudentProfileContext } from '../../shared/messages';
import { ConnectionTestResult, ILLMProvider, LLMMessage, LLMRequestOptions } from './types';
import { OllamaProvider } from './OllamaProvider';
import { GeminiProvider } from './GeminiProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { ClaudeProvider } from './ClaudeProvider';

export class LLMGateway {
  private static instance?: LLMGateway;

  public static getInstance(): LLMGateway {
    if (!LLMGateway.instance) {
      LLMGateway.instance = new LLMGateway();
    }
    return LLMGateway.instance;
  }

  /**
   * Sanitiza chaves de API, senhas, tokens JWT e segredos antes de enviar ao modelo
   */
  public sanitizePrompt(content: string): string {
    if (!content) {
      return '';
    }

    return content
      // Chaves OpenAI (sk-...)
      .replace(/sk-[a-zA-Z0-9_\-]{20,}/g, '[REDACTED_API_KEY]')
      // Chaves Google Gemini (AIzaSy...)
      .replace(/AIzaSy[a-zA-Z0-9_\-]{33}/g, '[REDACTED_GEMINI_KEY]')
      // Chaves Anthropic (sk-ant-...)
      .replace(/sk-ant-[a-zA-Z0-9_\-]{20,}/g, '[REDACTED_ANTHROPIC_KEY]')
      // Chaves genéricas em variáveis de ambiente
      .replace(/([A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASS|AUTH)[A-Z0-9_]*\s*[:=]\s*["']?)[^"'\s\n\r]+(["']?)/gi, '$1[REDACTED]$2')
      // Tokens JWT (eyJh...)
      .replace(/ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[REDACTED_JWT_TOKEN]');
  }

  /**
   * Obtém o provedor configurado no momento
   */
  public getActiveProvider(): ILLMProvider {
    const config = vscode.workspace.getConfiguration('aprendeai');
    const providerType = config.get<LLMProviderType>('provider', 'ollama');

    switch (providerType) {
      case 'gemini': {
        const apiKey = config.get<string>('gemini.apiKey', '');
        const model = config.get<string>('gemini.model', 'gemini-1.5-flash');
        return new GeminiProvider(apiKey, model);
      }
      case 'openai': {
        const apiKey = config.get<string>('openai.apiKey', '');
        const model = config.get<string>('openai.model', 'gpt-4o-mini');
        return new OpenAIProvider(apiKey, model);
      }
      case 'claude': {
        const apiKey = config.get<string>('claude.apiKey', '');
        const model = config.get<string>('claude.model', 'claude-3-5-sonnet-20241022');
        return new ClaudeProvider(apiKey, model);
      }
      case 'ollama':
      default: {
        const baseUrl = config.get<string>('ollama.baseUrl', 'http://localhost:11434');
        const model = config.get<string>('ollama.model', 'qwen2.5-coder:7b');
        return new OllamaProvider(baseUrl, model);
      }
    }
  }

  /**
   * Altera o provedor de IA ativo no VS Code settings
   */
  public async setActiveProvider(provider: LLMProviderType): Promise<void> {
    const config = vscode.workspace.getConfiguration('aprendeai');
    await config.update('provider', provider, vscode.ConfigurationTarget.Global);
  }

  /**
   * Obtém o tipo de provedor ativo
   */
  public getActiveProviderType(): LLMProviderType {
    const config = vscode.workspace.getConfiguration('aprendeai');
    return config.get<LLMProviderType>('provider', 'ollama');
  }

  /**
   * Retorna informações de diagnóstico e status do provedor atual
   */
  public async getProviderStatus(): Promise<ProviderStatusInfo> {
    const provider = this.getActiveProvider();
    const config = vscode.workspace.getConfiguration('aprendeai');
    const providerType = this.getActiveProviderType();

    let modelName = '';
    let isConfigured = false;

    switch (providerType) {
      case 'ollama':
        modelName = config.get<string>('ollama.model', 'qwen2.5-coder:7b');
        isConfigured = true;
        break;
      case 'gemini':
        modelName = config.get<string>('gemini.model', 'gemini-1.5-flash');
        isConfigured = Boolean(config.get<string>('gemini.apiKey', '').trim());
        break;
      case 'openai':
        modelName = config.get<string>('openai.model', 'gpt-4o-mini');
        isConfigured = Boolean(config.get<string>('openai.apiKey', '').trim());
        break;
      case 'claude':
        modelName = config.get<string>('claude.model', 'claude-3-5-sonnet-20241022');
        isConfigured = Boolean(config.get<string>('claude.apiKey', '').trim());
        break;
    }

    if (!isConfigured) {
      return {
        provider: providerType,
        model: modelName,
        connected: false,
        statusText: `Chave de API não configurada para ${provider.name}`,
        isConfigured: false
      };
    }

    try {
      const test = await provider.testConnection();
      return {
        provider: providerType,
        model: modelName,
        connected: test.ok,
        statusText: test.message,
        isConfigured: true
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        provider: providerType,
        model: modelName,
        connected: false,
        statusText: `Erro de conexão: ${msg}`,
        isConfigured: true
      };
    }
  }

  /**
   * Testa a conexão do provedor ativo
   */
  public async testActiveConnection(): Promise<ConnectionTestResult> {
    const provider = this.getActiveProvider();
    return await provider.testConnection();
  }

  /**
   * Dispara streaming socrático para a Escada de Dicas (Níveis 1 a 4)
   */
  public async streamHint(params: {
    level: HintLevel;
    context: EditorContext;
    userPrompt?: string;
    onChunk?: (chunk: string) => void;
    signal?: AbortSignal;
  }): Promise<string> {
    const { level, context, userPrompt, onChunk, signal } = params;
    const provider = this.getActiveProvider();

    const systemPrompt = this.buildSocraticSystemPrompt(level, context.studentProfile);
    const userMessageContent = this.formatContextualPrompt({
      taskDescription: `O aluno solicitou uma dica de Nível ${level}.`,
      context,
      userPrompt
    });

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: this.sanitizePrompt(userMessageContent) }
    ];

    return await provider.streamChat({
      messages,
      onChunk,
      signal,
      temperature: 0.2
    });
  }

  /**
   * Dispara streaming pedagógico para diagnóstico de erro no terminal
   */
  public async streamTerminalError(params: {
    terminalOutput: string;
    context: EditorContext;
    onChunk?: (chunk: string) => void;
    signal?: AbortSignal;
  }): Promise<string> {
    const { terminalOutput, context, onChunk, signal } = params;
    const provider = this.getActiveProvider();

    const systemPrompt = `Você é o AprendeAI, um Mentor Socrático de Engenharia de Software.
Sua missão é ajudar o aluno a diagnosticar o erro do terminal sem dar a resposta mastigada imediatamente.
REGRAS PEDAGÓGICAS:
1. Explique a causa raiz do erro em linguagem clara, relacionando à stack trace.
2. Identifique qual linha causou a exceção e por que ela ocorreu.
3. Formule 1 ou 2 perguntas socráticas reflexivas guiando o aluno para investigar o ponto exato da correção no código.
4. Mantenha tom encorajador e de alto nível de engenharia (como um Staff Engineer mentorando um júnior).`;

    const userMessageContent = `O seguinte erro ocorreu no terminal de execução:
\`\`\`
${this.sanitizePrompt(terminalOutput)}
\`\`\`
${this.formatEditorContextText(context)}
Ajude-me a entender e diagnosticar a causa deste erro.`;

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessageContent }
    ];

    return await provider.streamChat({
      messages,
      onChunk,
      signal,
      temperature: 0.2
    });
  }

  /**
   * Dispara streaming da Válvula de Escape anti-pânico (solução imediata comentada)
   */
  public async streamEmergencyBypass(params: {
    reason?: string;
    context: EditorContext;
    onChunk?: (chunk: string) => void;
    signal?: AbortSignal;
  }): Promise<string> {
    const { reason, context, onChunk, signal } = params;
    const provider = this.getActiveProvider();

    const systemPrompt = `Você é o AprendeAI atuando na Válvula de Escape Anti-Pânico.
O aluno chegou ao limite de frustração e acionou o desbloqueio imediato.
REGRAS:
1. Seja altamente empático, acolhedor e normalize a dificuldade. Bloqueios fazem parte da rotina de qualquer engenheiro de software.
2. Forneça a solução direta, correta e limpa para o problema, com código executável e comentários didáticos explicativos.
3. Termine com uma reflexão sênior pós-resolução: o que impediu o progresso e qual padrão arquitetural evitará esse bloqueio no futuro.`;

    const userMessageContent = `O aluno acionou a Válvula de Escape pelo seguinte motivo: "${reason || 'Bloqueio de progresso'}".
${this.formatEditorContextText(context)}
Por favor, forneça a solução comentada e o desbloqueio pedagógico.`;

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: this.sanitizePrompt(userMessageContent) }
    ];

    return await provider.streamChat({
      messages,
      onChunk,
      signal,
      temperature: 0.2
    });
  }

  /**
   * Streaming de chat interativo livre com o mascote Byte (estilo chat de conversa natural)
   */
  public async streamChat(params: {
    text: string;
    history: ChatMessage[];
    context: EditorContext;
    hintLevel: HintLevel;
    onChunk?: (chunk: string) => void;
    signal?: AbortSignal;
  }): Promise<string> {
    const { text, history, context, hintLevel, onChunk, signal } = params;
    const provider = this.getActiveProvider();

    const systemPrompt = this.buildConversationalCatSystemPrompt(context.studentProfile, hintLevel);

    // Mapeia histórico recente (até 12 mensagens para manter fluidez conversacional)
    const recentHistory = history.slice(-12).map((m) => ({
      role: m.sender === 'user' ? ('user' as const) : ('assistant' as const),
      content: this.sanitizePrompt(m.content)
    }));

    const editorContextText = this.formatEditorContextText(context);
    const contextualBackground = editorContextText
      ? `[Contexto opcional do editor caso o aluno faça referência ao código aberto]\n${editorContextText}\n\n`
      : '';

    const currentPromptWithContext = `${contextualBackground}Mensagem do aluno no chat: ${this.sanitizePrompt(text)}`;

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      ...recentHistory,
      { role: 'user', content: currentPromptWithContext }
    ];

    return await provider.streamChat({
      messages,
      onChunk,
      signal,
      temperature: 0.65
    });
  }

  /**
   * Constrói o System Prompt do Mascote Byte para bate-papo conversacional autêntico
   */
  private buildConversationalCatSystemPrompt(profile?: StudentProfileContext, hintLevel?: HintLevel): string {
    const studentName = profile?.name?.trim() || 'dev';
    const experienceLevel = profile?.experienceLevel || 'intermediate';
    const goal = profile?.currentGoal || 'aprender programação e evoluir minhas habilidades';
    const language = profile?.targetLanguage || 'TypeScript';

    let blindSpotsText = '';
    if (profile?.blindSpots && profile.blindSpots.length > 0) {
      blindSpotsText = profile.blindSpots.join(', ');
    }

    return `Você é "Byte" (🐱🐾), o gato mascote tutor e fiel companheiro de programação do aluno no AprendeAI.
Você conversa com o aluno (${studentName}) DIRETAMENTE em uma janela de chat de conversa, exatamente como um bate-papo real entre dois amigos programadores (estilo ChatGPT, Claude ou Slack com um pair programming partner).

COMO VOCÊ SE COMPORTA NESTE CHAT DE CONVERSA:
1. FLUIDEZ NATURAL DE BATE-PAPO:
   - Converse como em uma conversa de verdade! Não responda como um robô corporativo nem tente transformar qualquer "oi" ou conversa informal em uma lição obrigatória ou lista mecânica.
   - Se o aluno mandar um "oi", "boa tarde", "fala Byte!", "como você tá?", "bora codar?", etc., responda amigavelmente de volta, cumprimente pelo nome (${studentName}), comente com animação e pergunte no que vocês vão trabalhar ou tirar dúvidas hoje!
   - Se o aluno estiver cansado, estressado ou feliz com um avanço, seja empático, comemore conquistas ou ofereça um "ronrom" de apoio.

2. PERSONALIDADE FELINA CARISMÁTICA (BYTE):
   - Você é um cyber-cat esperto, afetuoso, bem-humorado e fera em código.
   - Solte de forma natural expressões felinas leves e divertidas (ex: "Miau! 🐾", "Ronrom...", "Meus bigodes sentiram um bug por aqui!", "Pronto pra caçar esse erro juntos!").
   - Fale sempre em primeira pessoa amigável ("eu acho", "bora dar uma olhada", "vamos ver juntos", "o que você acha de...?").

3. PARCERIA DE PAIR PROGRAMMING PEDAGÓGICO:
   - Quando o aluno fizer perguntas técnicas, debater código ou pedir ajuda com erros:
     * Converse com ele como um Tech Lead / Senior Developer amigo e acolhedor.
     * Explique com clareza, analogias intuitivas e raciocínio lógico.
     * Use a maiêutica socrática de forma natural na conversa: ajude o aluno a pensar e descobrir a resposta com boas perguntas, sem dar spoiler precipitado a menos que ele peça a solução.
     * Se ele pedir código diretamente ou exemplos práticos, forneça código limpo, moderno e didático em Markdown com explicações claras.
     * Adapte a profundidade ao nível ${experienceLevel.toUpperCase()} do aluno e à meta dele: "${goal}" (Linguagem: ${language}).
     ${blindSpotsText ? `* Preste atenção especial para reforçar com paciência conceitos de [${blindSpotsText}] caso apareçam na conversa.` : ''}

4. FORMATO DAS MENSAGENS:
   - Formate o texto com Markdown limpo (negrito para destaque, listas curtas e blocos de código com linguagem).
   - Seja conciso e estimule a continuidade da conversa (faça perguntas de volta quando fizer sentido, ex: "Fez sentido para você?", "O que acha da gente tentar esse passo agora? Miau! 🐾").`;
  }

  /**
   * Constrói o System Prompt Socrático com regras anti-spoiler por nível e calibração ZPD
   */
  private buildSocraticSystemPrompt(level: HintLevel, profile?: StudentProfileContext): string {
    let studentBlock = '';
    if (profile) {
      const styleMap: Record<string, string> = {
        'step_by_step_practical': 'Passo a Passo Prático com Pseudocódigo',
        'visual_analogies': 'Analogias Intuitivas do Mundo Real & Modelos Visuais',
        'rigorous_architectural': 'Rigor Arquitetural, Tipagem Estrita e Design Patterns'
      };
      const styleDesc = styleMap[profile.preferredStyle] || profile.preferredStyle;
      const blindSpotsText = profile.blindSpots && profile.blindSpots.length > 0
        ? profile.blindSpots.join('; ')
        : 'Nenhum ponto cego crítico registrado no momento';

      studentBlock = `
<student_profile>
- Nível de Experiência: ${profile.experienceLevel.toUpperCase()}
- Autonomia Cognitiva (BKT): ${profile.bktScore}%
- Meta de Aprendizado: ${profile.currentGoal}
- Estilo Cognitivo Preferido: ${styleDesc}
- Pontos Cegos Recorrentes: ${blindSpotsText}
- Linguagem Principal: ${profile.targetLanguage || 'TypeScript'}
</student_profile>

<pedagogical_calibration>
1. CALIBRAÇÃO ZPD: O aluno está no nível ${profile.experienceLevel.toUpperCase()} (${profile.bktScore}% de autonomia). Adapte a densidade de jargão à sua senioridade sem subestimá-lo nem gerar sobrecarga cognitiva.
2. ATENÇÃO A PONTOS CEGOS: Se a dúvida tangenciar [${blindSpotsText}], estimule-o com perguntas socráticas direcionadas a essa lacuna.
3. ESTILO PREFERIDO: Conduza as orientações priorizando ${styleDesc}.
</pedagogical_calibration>
`;
    }

    const studentName = profile?.name?.trim() || 'dev';
    const basePrompt = `Você é "Byte" (🐱🐾), o gato tutor e fiel mascote de pair programming do AprendeAI.
Você é um cyber-cat carismático, curioso, afetuoso e especialista em engenharia de software.
Sua missão não é apenas responder, mas ser um verdadeiro tutor felino e companheiro de código para o aluno (${studentName}).
À medida que conversam, você se adapta ao ritmo e ao estilo dele, tornando a sessão de programação leve, instigante e muito agradável.

PERSONALIDADE DO GATO TUTOR BYTE:
- Chame o aluno amigavelmente pelo nome (${studentName}) quando natural.
- Você é um gato desenvolvedor: solte de vez em quando um amigável "Miau! 🐾", ou um ronrom de satisfação quando um bug for solucionado ou um raciocínio estiver no caminho certo!
- Seja caloroso, encorajador e acolhedor: valorize o esforço, brinque de forma descontraída com bugs e celebre os passos certos como um gatinho orgulhoso.
- Pratique a Maiêutica Socrática com simpatia felina: ajude o aluno a construir o raciocínio com perguntas inteligentes, analogias do mundo real e pistas progressivas sem entregar spoilers precoces.
- Mantenha tom leve e descontraído, mas com altíssimo padrão de engenharia de software limpa.
${studentBlock}
DIRETRIZES DE COMUNICAÇÃO:
- Português natural, fluido e empático.
- Use markdown limpo, listas e código bem formatado.
`;

    switch (level) {
      case 1:
        return `${basePrompt}
REGRA ANTI-SPOILER NÍVEL 1 (CONCEITUAL):
- NUNCA forneça código, sintaxe ou nomes de funções da solução.
- Explique o modelo mental intuitivo e os conceitos fundamentais envolvidos.
- Use analogias do mundo real para ilustrar como o fluxo de dados ou a arquitetura se comporta.
- Termine com uma pergunta socrática que faça o aluno refletir sobre a entrada e a saída esperadas.`;

      case 2:
        return `${basePrompt}
REGRA ANTI-SPOILER NÍVEL 2 (DIRECIONAL):
- NUNCA forneça código completo pronto para copiar.
- Estruture os passos lógicos necessários em uma sequência ordenada (passo 1, passo 2, etc.) ou pseudocódigo de alto nível.
- Aponte os casos de borda que o aluno precisa considerar (ex: listas vazias, nulos, concorrência).
- Pergunte qual dessas etapas parece mais desafiadora no momento.`;

      case 3:
        return `${basePrompt}
REGRA ANTI-SPOILER NÍVEL 3 (ESPECÍFICO):
- Forneça a sintaxe exata ou métodos da biblioteca/linguagem que resolvem a dor (ex: métodos de array, promises, tipos TypeScript).
- Apresente um esqueleto de código parcial com lacunas ou comentários do tipo '// Seu raciocínio aqui' ou '// Trate a condição aqui'.
- NÃO entregue a regra de negócio completa resolvida. Instigue o aluno a preencher a lacuna.`;

      case 4:
        return `${basePrompt}
REGRA NÍVEL 4 (SOLUÇÃO COMPLETA COM REFLEXÃO):
- Forneça a implementação de produção limpa, eficiente e tipada.
- OBRIGATORIAMENTE explique linha a linha o racional de engenharia que justifica essa solução.
- Inclua 2 perguntas reflexivas profundas ao final para testar se o aluno realmente compreendeu os trade-offs da solução ou se apenas leu o código.`;
    }
  }

  private formatEditorContextText(context?: EditorContext): string {
    if (!context) {
      return '';
    }

    const parts: string[] = [];
    if (context.fileName) {
      parts.push(`Arquivo ativo: \`${context.fileName}\` (${context.languageId || 'desconhecido'})`);
    }
    if (context.selectionStartLine && context.selectionEndLine) {
      parts.push(`Linhas selecionadas: ${context.selectionStartLine} a ${context.selectionEndLine}`);
    }
    if (context.selectedText) {
      parts.push(`Trecho de código selecionado:\n\`\`\`${context.languageId || 'plaintext'}\n${context.selectedText}\n\`\`\``);
    }

    if (context.pathwayContext) {
      parts.push(`--- TRILHA DE APRENDIZADO ATIVA (O QUE ENSINAR) ---`);
      parts.push(`Módulo Atual: ${context.pathwayContext.moduleTitle}`);
      parts.push(`Tópico em Foco: ${context.pathwayContext.moduleTopic}`);
      parts.push(`Objetivo Didático: ${context.pathwayContext.objective}`);
      parts.push(`Diretriz do Mentor: Direcione perguntas socráticas e modelos mentais especificamente para consolidar esta habilidade da trilha.`);
    }

    if (context.studentProfile) {
      const p = context.studentProfile;
      parts.push(`--- DOSSIÊ COGNITIVO DO ALUNO (MODELO LOCAL) ---`);
      parts.push(`Senioridade: ${p.experienceLevel.toUpperCase()} | Autonomia: ${p.bktScore}%`);
      parts.push(`Meta Atual: ${p.currentGoal}`);
      if (p.blindSpots && p.blindSpots.length > 0) {
        parts.push(`Pontos Cegos: ${p.blindSpots.join(', ')}`);
      }
      parts.push(`Diretriz: Adapte as respostas ao estilo ${p.preferredStyle}. Mantenha atrito pedagógico proporcional.`);
    }

    return parts.length > 0 ? `\n--- Contexto Pedagógico & do Editor ---\n${parts.join('\n')}\n---------------------------------------` : '';
  }

  private formatContextualPrompt(params: {
    taskDescription: string;
    context: EditorContext;
    userPrompt?: string;
  }): string {
    const { taskDescription, context, userPrompt } = params;
    let result = taskDescription;

    const contextText = this.formatEditorContextText(context);
    if (contextText) {
      result += `\n${contextText}`;
    }

    if (userPrompt && userPrompt.trim()) {
      result += `\n\nDúvida adicional do aluno: "${userPrompt}"`;
    }

    return result;
  }

  /**
   * Obtém as configurações salvas e modelos sugeridos para um determinado provedor
   */
  public getProviderConfigData(provider: LLMProviderType): {
    apiKey: string;
    model: string;
    baseUrl?: string;
    availableModels: string[];
    temperature: number;
    maxTokens: number;
    topP: number;
    pedagogicalMode: string;
    autoGenerateNotes: boolean;
    productiveFriction: boolean;
  } {
    const config = vscode.workspace.getConfiguration('aprendeai');
    const temperature = config.get<number>('temperature', 0.3);
    const maxTokens = config.get<number>('maxTokens', 2048);
    const topP = config.get<number>('topP', 0.9);
    const pedagogicalMode = config.get<string>('pedagogicalMode', 'guided_mentor');
    const autoGenerateNotes = config.get<boolean>('autoGenerateNotes', true);
    const productiveFriction = config.get<boolean>('productiveFriction', true);

    const baseData = {
      temperature,
      maxTokens,
      topP,
      pedagogicalMode,
      autoGenerateNotes,
      productiveFriction
    };

    switch (provider) {
      case 'openai':
        return {
          ...baseData,
          apiKey: config.get<string>('openai.apiKey', ''),
          model: config.get<string>('openai.model', 'gpt-4o-mini'),
          availableModels: ['gpt-4o-mini', 'gpt-4o', 'o1-mini', 'o1-preview', 'gpt-4-turbo', 'gpt-3.5-turbo']
        };
      case 'gemini':
        return {
          ...baseData,
          apiKey: config.get<string>('gemini.apiKey', ''),
          model: config.get<string>('gemini.model', 'gemini-1.5-flash'),
          availableModels: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash', 'gemini-1.5-flash-8b']
        };
      case 'claude':
        return {
          ...baseData,
          apiKey: config.get<string>('claude.apiKey', ''),
          model: config.get<string>('claude.model', 'claude-3-5-sonnet-20241022'),
          availableModels: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229']
        };
      case 'ollama':
      default:
        return {
          ...baseData,
          apiKey: '',
          baseUrl: config.get<string>('ollama.baseUrl', 'http://localhost:11434'),
          model: config.get<string>('ollama.model', 'qwen2.5-coder:7b'),
          availableModels: ['qwen2.5-coder:7b', 'llama3.2', 'deepseek-coder:6.7b', 'codellama']
        };
    }
  }

  /**
   * Salva configurações do provedor de IA no VS Code settings
   */
  public async saveProviderConfig(params: {
    provider: LLMProviderType;
    apiKey?: string;
    model: string;
    baseUrl?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    pedagogicalMode?: string;
    autoGenerateNotes?: boolean;
    productiveFriction?: boolean;
  }): Promise<{ success: boolean; message: string }> {
    const {
      provider,
      apiKey,
      model,
      baseUrl,
      temperature,
      maxTokens,
      topP,
      pedagogicalMode,
      autoGenerateNotes,
      productiveFriction
    } = params;
    const config = vscode.workspace.getConfiguration('aprendeai');

    try {
      await config.update('provider', provider, vscode.ConfigurationTarget.Global);

      if (temperature !== undefined) {
        await config.update('temperature', temperature, vscode.ConfigurationTarget.Global);
      }
      if (maxTokens !== undefined) {
        await config.update('maxTokens', maxTokens, vscode.ConfigurationTarget.Global);
      }
      if (topP !== undefined) {
        await config.update('topP', topP, vscode.ConfigurationTarget.Global);
      }
      if (pedagogicalMode !== undefined) {
        await config.update('pedagogicalMode', pedagogicalMode, vscode.ConfigurationTarget.Global);
      }
      if (autoGenerateNotes !== undefined) {
        await config.update('autoGenerateNotes', autoGenerateNotes, vscode.ConfigurationTarget.Global);
      }
      if (productiveFriction !== undefined) {
        await config.update('productiveFriction', productiveFriction, vscode.ConfigurationTarget.Global);
      }

      switch (provider) {
        case 'openai':
          if (apiKey !== undefined) {
            await config.update('openai.apiKey', apiKey.trim(), vscode.ConfigurationTarget.Global);
          }
          if (model) {
            await config.update('openai.model', model.trim(), vscode.ConfigurationTarget.Global);
          }
          break;
        case 'gemini':
          if (apiKey !== undefined) {
            await config.update('gemini.apiKey', apiKey.trim(), vscode.ConfigurationTarget.Global);
          }
          if (model) {
            await config.update('gemini.model', model.trim(), vscode.ConfigurationTarget.Global);
          }
          break;
        case 'claude':
          if (apiKey !== undefined) {
            await config.update('claude.apiKey', apiKey.trim(), vscode.ConfigurationTarget.Global);
          }
          if (model) {
            await config.update('claude.model', model.trim(), vscode.ConfigurationTarget.Global);
          }
          break;
        case 'ollama':
          if (baseUrl) {
            await config.update('ollama.baseUrl', baseUrl.trim(), vscode.ConfigurationTarget.Global);
          }
          if (model) {
            await config.update('ollama.model', model.trim(), vscode.ConfigurationTarget.Global);
          }
          break;
      }

      return {
        success: true,
        message: `Configuração do provedor ${provider.toUpperCase()} e preferências avançadas atualizadas com sucesso.`
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: `Falha ao salvar configurações: ${msg}`
      };
    }
  }

  /**
   * Consulta a API do provedor e busca automaticamente a lista de modelos disponíveis
   */
  public async fetchAvailableModels(params: {
    provider: LLMProviderType;
    apiKey?: string;
    baseUrl?: string;
  }): Promise<string[]> {
    const { provider, apiKey, baseUrl } = params;
    const config = vscode.workspace.getConfiguration('aprendeai');

    switch (provider) {
      case 'ollama': {
        const url = (baseUrl || config.get<string>('ollama.baseUrl', 'http://localhost:11434')).replace(/\/+$/, '');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
          const res = await fetch(`${url}/api/tags`, { signal: controller.signal }).finally(() => clearTimeout(timeout));
          if (!res.ok) {
            throw new Error(`Ollama retornou status ${res.status}`);
          }
          const data = (await res.json()) as { models?: Array<{ name?: string }> };
          const models = (data.models || []).map((m) => m.name || '').filter(Boolean);
          if (models.length > 0) {
            return models;
          }
          return ['qwen2.5-coder:7b', 'llama3.2', 'deepseek-coder:6.7b', 'codellama'];
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`Não foi possível conectar ao Ollama em ${url}: ${msg}. Certifique-se de que o Ollama está rodando localmente.`);
        }
      }

      case 'gemini': {
        const key = (apiKey ?? config.get<string>('gemini.apiKey', '')).trim();
        if (!key) {
          throw new Error('Insira a chave de API do Google Gemini para buscar os modelos.');
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 7000);
        try {
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;
          const res = await fetch(endpoint, { signal: controller.signal }).finally(() => clearTimeout(timeout));
          if (!res.ok) {
            const errText = await res.text().catch(() => '');
            throw new Error(`Erro na API do Gemini (${res.status}): ${errText || res.statusText}`);
          }
          const data = (await res.json()) as {
            models?: Array<{
              name?: string;
              supportedGenerationMethods?: string[];
            }>;
          };
          const models = (data.models || [])
            .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
            .map((m) => (m.name || '').replace(/^models\//, ''))
            .filter(Boolean);

          if (models.length > 0) {
            return models;
          }
          return ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash', 'gemini-1.5-flash-8b'];
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`Falha ao buscar modelos do Gemini: ${msg}`);
        }
      }

      case 'openai': {
        const key = (apiKey ?? config.get<string>('openai.apiKey', '')).trim();
        if (!key) {
          throw new Error('Insira a chave de API da OpenAI para buscar os modelos.');
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 7000);
        try {
          const res = await fetch('https://api.openai.com/v1/models', {
            headers: {
              Authorization: `Bearer ${key}`
            },
            signal: controller.signal
          }).finally(() => clearTimeout(timeout));

          if (!res.ok) {
            const errText = await res.text().catch(() => '');
            throw new Error(`Erro na API da OpenAI (${res.status}): ${errText || res.statusText}`);
          }

          const data = (await res.json()) as { data?: Array<{ id?: string }> };
          const allModels = (data.data || []).map((m) => m.id || '').filter(Boolean);

          // Filtra modelos relevantes para chat de programação
          const chatModels = allModels.filter((id) => {
            const lower = id.toLowerCase();
            return (
              (lower.startsWith('gpt-') || lower.startsWith('o1-') || lower.startsWith('o3-') || lower.startsWith('chatgpt-')) &&
              !lower.includes('realtime') &&
              !lower.includes('audio') &&
              !lower.includes('transcription') &&
              !lower.includes('tts')
            );
          });

          // Ordenação priorizando os mais novos e populares
          const priority = ['gpt-4o-mini', 'gpt-4o', 'o1-mini', 'o1-preview', 'gpt-4-turbo', 'gpt-3.5-turbo'];
          chatModels.sort((a, b) => {
            const indexA = priority.indexOf(a);
            const indexB = priority.indexOf(b);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return a.localeCompare(b);
          });

          return chatModels.length > 0 ? chatModels : priority;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`Falha ao buscar modelos da OpenAI: ${msg}`);
        }
      }

      case 'claude': {
        const key = (apiKey ?? config.get<string>('claude.apiKey', '')).trim();
        if (!key) {
          throw new Error('Insira a chave de API da Anthropic Claude para buscar os modelos.');
        }

        const fallbackClaudeModels = [
          'claude-3-5-sonnet-20241022',
          'claude-3-5-haiku-20241022',
          'claude-3-opus-20240229',
          'claude-3-sonnet-20240229',
          'claude-3-haiku-20240307'
        ];

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 7000);
        try {
          const res = await fetch('https://api.anthropic.com/v1/models', {
            headers: {
              'x-api-key': key,
              'anthropic-version': '2023-06-01',
              'anthropic-beta': 'models-2024-06-20'
            },
            signal: controller.signal
          }).finally(() => clearTimeout(timeout));

          if (res.ok) {
            const data = (await res.json()) as { data?: Array<{ id?: string }> };
            const models = (data.data || []).map((m) => m.id || '').filter(Boolean);
            if (models.length > 0) {
              return models;
            }
          }

          // Se a API não listar por falta de permissão ou endpoint, valida se a chave funciona enviando 1 token
          const testRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-api-key': key,
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
              model: 'claude-3-5-haiku-20241022',
              max_tokens: 1,
              messages: [{ role: 'user', content: 'hi' }]
            })
          });

          if (testRes.ok || testRes.status === 429) {
            return fallbackClaudeModels;
          }

          const errText = await testRes.text().catch(() => '');
          throw new Error(`Chave da Anthropic inválida (${testRes.status}): ${errText}`);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`Falha ao validar/buscar modelos da Anthropic Claude: ${msg}`);
        }
      }
    }
  }
}

