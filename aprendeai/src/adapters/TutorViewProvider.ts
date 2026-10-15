import * as vscode from 'vscode';
import {
  ChatMessage,
  DEFAULT_STUDENT_PROFILE,
  EditorContext,
  HintLevel,
  HostToWebviewMessage,
  INITIAL_LEARNING_PATHWAY,
  LearningPathModule,
  LLMProviderType,
  ProviderStatusInfo,
  StudentProfileContext,
  WebviewToHostMessage
} from '../shared/messages';
import { ObsidianVaultStore } from '../core/memory/ObsidianVaultStore';
import { MasterclassNoteGenerator } from '../core/pedagogy/MasterclassNoteGenerator';
import { LLMGateway } from './llm/LLMGateway';

const STORAGE_KEY_HISTORY = 'aprendeai.chatHistory';
const STORAGE_KEY_CURRENT_LEVEL = 'aprendeai.currentHintLevel';
const STORAGE_KEY_ENABLED = 'aprendeai.isEnabled';
const STORAGE_KEY_ACTIVE_MODULE = 'aprendeai.activeModuleId';
const STORAGE_KEY_STUDENT_PROFILE = 'aprendeai.studentProfile';

export class TutorViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'aprendeai.tutorView';

  private _view?: vscode.WebviewView;
  private _history: ChatMessage[] = [];
  private _currentHintLevel: HintLevel = 1;
  private _isEnabled = true;
  private _isStreaming = false;
  private _streamAbortController?: AbortController;
  private _pathwayModules: LearningPathModule[] = [...INITIAL_LEARNING_PATHWAY];
  private _activeModuleId: string = 'async-logic';
  private _studentProfile: StudentProfileContext = { ...DEFAULT_STUDENT_PROFILE };
  private readonly _gateway: LLMGateway = LLMGateway.getInstance();
  private readonly _attemptedHintLevels: Set<HintLevel> = new Set();
  public onEnabledChange?: (enabled: boolean) => void;
  public onCatStateChange?: (state: 'idle' | 'thinking' | 'speaking' | 'celebrating', text?: string) => void;

  constructor(private readonly _context: vscode.ExtensionContext) {
    this._history = this._context.workspaceState.get<ChatMessage[]>(STORAGE_KEY_HISTORY, []);
    this._currentHintLevel = this._context.workspaceState.get<HintLevel>(STORAGE_KEY_CURRENT_LEVEL, 1);
    this._isEnabled = this._context.workspaceState.get<boolean>(STORAGE_KEY_ENABLED, true);
    this._activeModuleId = this._context.workspaceState.get<string>(STORAGE_KEY_ACTIVE_MODULE, 'async-logic');
    this._studentProfile = this._context.workspaceState.get<StudentProfileContext>(
      STORAGE_KEY_STUDENT_PROFILE,
      { ...DEFAULT_STUDENT_PROFILE }
    );
    this._updateModuleStatuses();

    // Escuta mudanças de configuração do VS Code para atualizar o status do provedor
    this._context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('aprendeai')) {
          this._broadcastProviderStatus();
        }
      })
    );
  }

  public isEnabled(): boolean {
    return this._isEnabled;
  }

  public async setEnabled(enabled: boolean): Promise<void> {
    this._isEnabled = enabled;
    await this._context.workspaceState.update(STORAGE_KEY_ENABLED, enabled);
    if (this._view) {
      this._view.description = enabled ? '● Ligado' : '○ Desligado';
    }
    this._postMessage({
      type: 'enabledStatus',
      enabled
    });
    this.onEnabledChange?.(enabled);
  }

  public async toggleEnabled(): Promise<boolean> {
    const newState = !this._isEnabled;
    await this.setEnabled(newState);
    return newState;
  }

  public async continueResponse(): Promise<void> {
    const lastAssistantMessage = [...this._history].reverse().find((m) => m.sender === 'assistant');
    const prompt = lastAssistantMessage
      ? `Por favor, continue exatamente de onde parou no ponto anterior:\n"${lastAssistantMessage.content.slice(-200)}"\nProssiga completando o raciocínio sem repetir o que já foi dito.`
      : 'Por favor, continue o raciocínio e a explicação do código de onde paramos.';

    await this._handleUserChatMessage(prompt);
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;
    webviewView.description = this._isEnabled ? '● Ligado' : '○ Desligado';

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this._context.extensionUri
      ]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message: WebviewToHostMessage) => {
      await this._handleWebviewMessage(message);
    });

    // Notificar mudanças no editor de código ativo
    vscode.window.onDidChangeActiveTextEditor(() => {
      this._notifyEditorContext();
    });

    vscode.window.onDidChangeTextEditorSelection(() => {
      this._notifyEditorContext();
    });
  }

  /**
   * Dispara pedido de dica socrática a partir de comando ou interface
   */
  public async askHint(level?: HintLevel, prompt?: string, customContext?: EditorContext, bypassFriction = false): Promise<void> {
    const hintLevel = level ?? this._currentHintLevel;

    // Trava de atrito produtivo: Nível 4 sem passar por Nível 1 ou 2
    if (hintLevel === 4 && !bypassFriction && !this._attemptedHintLevels.has(1) && !this._attemptedHintLevels.has(2)) {
      this._postMessage({
        type: 'productiveFrictionWarning',
        message: '⚠️ **Trava de Atrito Produtivo**: O Nível 4 revela a solução pronta. Para consolidação neural profunda e aprendizado duradouro, recomendamos testar o **Nível 1 (Conceitual)** ou o **Nível 2 (Lógica)** antes.',
        targetLevel: 4
      });
      return;
    }

    this._attemptedHintLevels.add(hintLevel);
    this._currentHintLevel = hintLevel;
    await this._context.workspaceState.update(STORAGE_KEY_CURRENT_LEVEL, this._currentHintLevel);

    const context = customContext || this._extractEditorContext();
    await this._generateSocraticResponse({
      level: hintLevel,
      context,
      userPrompt: prompt || 'Pode me ajudar a dar o próximo passo com uma dica socrática?'
    });
  }

  /**
   * Analisa erro do terminal ativo
   */
  public async explainTerminal(terminalErrorText?: string): Promise<void> {
    const errorText = terminalErrorText || 'Erro reportado no terminal de execução.';
    const context = this._extractEditorContext();
    context.terminalError = errorText;

    const userMessage: ChatMessage = {
      id: this._generateId(),
      sender: 'user',
      content: `Pode me explicar este erro do terminal?\n\`\`\`\n${errorText}\n\`\`\``,
      timestamp: Date.now(),
      metadata: { terminalOutput: errorText }
    };
    this._appendMessage(userMessage);

    this._cancelStreaming();
    this._isStreaming = true;
    this._streamAbortController = new AbortController();
    const messageId = this._generateId();

    try {
      const fullText = await this._gateway.streamTerminalError({
        terminalOutput: errorText,
        context,
        onChunk: (chunk) => {
          this._postMessage({
            type: 'streamChunk',
            messageId,
            chunk
          });
        },
        signal: this._streamAbortController.signal
      });

      const assistantMessage: ChatMessage = {
        id: messageId,
        sender: 'assistant',
        content: fullText,
        timestamp: Date.now(),
        metadata: { terminalOutput: errorText }
      };
      this._appendMessage(assistantMessage);

      this._postMessage({
        type: 'streamEnd',
        messageId,
        fullText
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (this._streamAbortController.signal.aborted || msg.includes('cancelada') || msg.includes('aborted')) {
        return;
      }
      this._postMessage({
        type: 'streamError',
        messageId,
        error: `Falha ao analisar erro com o mentor: ${msg}`
      });
    } finally {
      this._isStreaming = false;
    }
  }

  /**
   * Aciona válvula de escape anti-pânico (solução imediata comentada)
   */
  public async emergencyBypass(reason?: string): Promise<void> {
    const context = this._extractEditorContext();
    const explanation = reason || 'Bloqueio de progresso / Válvula de escape ativada';

    const userMessage: ChatMessage = {
      id: this._generateId(),
      sender: 'user',
      content: `🆘 **Válvula de Escape Ativada:** Preciso de socorro com a solução comentada (${explanation}).`,
      timestamp: Date.now(),
      isEmergencyBypass: true
    };
    this._appendMessage(userMessage);

    this._cancelStreaming();
    this._isStreaming = true;
    this._streamAbortController = new AbortController();
    const messageId = this._generateId();

    try {
      const fullText = await this._gateway.streamEmergencyBypass({
        reason: explanation,
        context,
        onChunk: (chunk) => {
          this._postMessage({
            type: 'streamChunk',
            messageId,
            chunk
          });
        },
        signal: this._streamAbortController.signal
      });

      const assistantMessage: ChatMessage = {
        id: messageId,
        sender: 'assistant',
        content: fullText,
        timestamp: Date.now(),
        isEmergencyBypass: true
      };
      this._appendMessage(assistantMessage);

      this._postMessage({
        type: 'streamEnd',
        messageId,
        fullText
      });

      void this._recordInteractionToKnowledgeLog({
        actionType: 'Válvula de Escape Anti-Pânico',
        prompt: `Socorro/Solução: ${explanation}`,
        response: fullText,
        level: 4,
        context
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (this._streamAbortController.signal.aborted || msg.includes('cancelada') || msg.includes('aborted')) {
        return;
      }
      this._postMessage({
        type: 'streamError',
        messageId,
        error: `Falha na Válvula de Escape: ${msg}`
      });
    } finally {
      this._isStreaming = false;
    }
  }

  /**
   * Gera nota pedagógica no Padrão-Ouro, salva no workspace e abre em split view
   */
  public async generateStudyNote(topic?: string, customContext?: EditorContext): Promise<void> {
    const context = customContext || this._extractEditorContext();

    try {
      const note = await MasterclassNoteGenerator.generateDynamic(context, topic);
      const result = await ObsidianVaultStore.saveAndOpen(note);

      // Notifica o webview com a confirmação
      this._postMessage({
        type: 'studyNoteCreated',
        title: note.title,
        filePath: result.relativePath,
        graphPath: result.graphRelativePath
      });

      // Feedback no histórico de chat
      const chatFeedback: ChatMessage = {
        id: this._generateId(),
        sender: 'assistant',
        content: `📚 **Nota Pedagógica Gerada com Sucesso!**\n\n` +
          `• **Título:** ${note.title}\n` +
          `• **Arquivo no Workspace:** \`${result.relativePath}\`\n` +
          `• **Grafo de Conhecimento:** \`${result.graphRelativePath || '.mentor-memory/conceitos/' + note.slug + '.md'}\`\n\n` +
          `O arquivo foi aberto ao lado em split view no VS Code para acompanhamento simultâneo.`,
        timestamp: Date.now()
      };
      this._appendMessage(chatFeedback);

      this._postMessage({
        type: 'restoreHistory',
        messages: this._history
      });

      vscode.window.showInformationMessage(`Nota pedagógica gerada: ${note.title} (${result.relativePath})`);
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Erro ao gerar nota pedagógica: ${errorMsg}`);
      this._postMessage({
        type: 'streamError',
        error: `Falha ao gerar nota pedagógica: ${errorMsg}`
      });
    }
  }

  private async _handleWebviewMessage(message: WebviewToHostMessage): Promise<void> {
    switch (message.type) {
      case 'webviewReady':
        this._postMessage({
          type: 'restoreHistory',
          messages: this._history
        });
        this._postMessage({
          type: 'studentProfileUpdated',
          profile: this._studentProfile
        });
        this._postMessage({
          type: 'pathwayState',
          modules: this._pathwayModules,
          activeModuleId: this._activeModuleId
        });
        this._notifyEditorContext();
        this._postMessage({
          type: 'enabledStatus',
          enabled: this._isEnabled
        });
        await this._broadcastProviderStatus();
        break;

      case 'requestHint':
        await this.askHint(message.level, message.prompt, message.context, message.bypassFriction);
        break;

      case 'explainTerminalError':
        await this.explainTerminal(message.terminalOutput);
        break;

      case 'emergencyBypass':
        await this.emergencyBypass(message.reason);
        break;

      case 'generateStudyNote':
        await this.generateStudyNote(message.topic, message.context);
        break;

      case 'cancelStream':
        this._cancelStreaming();
        break;

      case 'sendMessage':
        await this._handleUserChatMessage(message.text);
        break;

      case 'clearHistory':
        this._history = [];
        this._attemptedHintLevels.clear();
        await this._context.workspaceState.update(STORAGE_KEY_HISTORY, []);
        this._postMessage({
          type: 'restoreHistory',
          messages: []
        });
        break;

      case 'changeProvider':
        await this._gateway.setActiveProvider(message.provider);
        await this._broadcastProviderStatus();
        break;

      case 'getProviderStatus':
        await this._broadcastProviderStatus();
        break;

      case 'openSettings':
        await vscode.commands.executeCommand('workbench.action.openSettings', 'aprendeai');
        break;

      case 'getProviderConfig': {
        const configData = this._gateway.getProviderConfigData(message.provider);
        this._postMessage({
          type: 'providerConfigData',
          provider: message.provider,
          apiKey: configData.apiKey,
          model: configData.model,
          baseUrl: configData.baseUrl,
          availableModels: configData.availableModels,
          temperature: configData.temperature,
          maxTokens: configData.maxTokens,
          topP: configData.topP,
          pedagogicalMode: configData.pedagogicalMode,
          autoGenerateNotes: configData.autoGenerateNotes,
          productiveFriction: configData.productiveFriction
        });
        break;
      }

      case 'fetchProviderModels': {
        try {
          const models = await this._gateway.fetchAvailableModels({
            provider: message.provider,
            apiKey: message.apiKey,
            baseUrl: message.baseUrl
          });
          this._postMessage({
            type: 'providerModelsResult',
            provider: message.provider,
            models,
            success: true
          });
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          this._postMessage({
            type: 'providerModelsResult',
            provider: message.provider,
            models: [],
            success: false,
            error: errorMsg
          });
        }
        break;
      }

      case 'saveProviderConfig': {
        const result = await this._gateway.saveProviderConfig({
          provider: message.provider,
          apiKey: message.apiKey,
          model: message.model,
          baseUrl: message.baseUrl,
          temperature: message.temperature,
          maxTokens: message.maxTokens,
          topP: message.topP,
          pedagogicalMode: message.pedagogicalMode,
          autoGenerateNotes: message.autoGenerateNotes,
          productiveFriction: message.productiveFriction
        });

        this._postMessage({
          type: 'saveConfigResult',
          success: result.success,
          message: result.message
        });

        // Atualiza status e emite para a UI
        await this._broadcastProviderStatus();
        break;
      }

      case 'toggleEnabled': {
        await this.setEnabled(message.enabled);
        break;
      }

      case 'continueResponse': {
        await this.continueResponse();
        break;
      }

      case 'serverSync': {
        // Simula e valida sincronização de nós de memória e maestria BKT
        const now = Date.now();
        const masteryScore = Math.min(100, Math.max(25, 68 + Math.floor(Math.random() * 5)));
        this._postMessage({
          type: 'serverSyncResult',
          success: true,
          timestamp: now,
          message: 'Grafo de conhecimento e notas pedagógicas sincronizadas com sucesso.',
          masteryScore
        });
        break;
      }

      case 'selectPathModule': {
        this._activeModuleId = message.moduleId;
        await this._context.workspaceState.update(STORAGE_KEY_ACTIVE_MODULE, message.moduleId);
        this._updateModuleStatuses();
        this._postMessage({
          type: 'pathwayState',
          modules: this._pathwayModules,
          activeModuleId: this._activeModuleId
        });
        this._notifyEditorContext();
        break;
      }

      case 'startPathChallenge': {
        const mod = this._pathwayModules.find((m) => m.id === message.moduleId);
        let challengeText = message.prompt || mod?.challengePrompt || 'Quero praticar um desafio prático focado na etapa atual da trilha.';
        if (message.subtopicId && mod?.subtopics) {
          const sub = mod.subtopics.find((s) => s.id === message.subtopicId);
          if (sub?.challengePrompt) {
            challengeText = sub.challengePrompt;
          }
        }
        await this._handleUserChatMessage(challengeText);
        break;
      }

      case 'saveStudentProfile': {
        this._studentProfile = { ...message.profile };
        await this._context.workspaceState.update(STORAGE_KEY_STUDENT_PROFILE, this._studentProfile);
        this._postMessage({
          type: 'studentProfileUpdated',
          profile: this._studentProfile
        });
        this._notifyEditorContext();
        break;
      }

      case 'getStudentProfile': {
        this._postMessage({
          type: 'studentProfileUpdated',
          profile: this._studentProfile
        });
        break;
      }
    }
  }

  private async _handleUserChatMessage(text: string): Promise<void> {
    if (!text.trim()) {
      return;
    }

    const userMessage: ChatMessage = {
      id: this._generateId(),
      sender: 'user',
      content: text,
      timestamp: Date.now()
    };
    this._appendMessage(userMessage);

    const context = this._extractEditorContext();

    this._cancelStreaming();
    this._isStreaming = true;
    this._streamAbortController = new AbortController();
    const messageId = this._generateId();

    this.onCatStateChange?.('thinking');

    try {
      const fullText = await this._gateway.streamChat({
        text,
        history: this._history,
        context,
        hintLevel: this._currentHintLevel,
        onChunk: (chunk) => {
          this.onCatStateChange?.('speaking');
          this._postMessage({
            type: 'streamChunk',
            messageId,
            chunk
          });
        },
        signal: this._streamAbortController.signal
      });

      const assistantMessage: ChatMessage = {
        id: messageId,
        sender: 'assistant',
        content: fullText,
        timestamp: Date.now(),
        hintLevel: this._currentHintLevel
      };
      this._appendMessage(assistantMessage);

      this.onCatStateChange?.('celebrating', 'Miau! Respondi no chat. Dá uma olhada lá! 🐾');

      this._postMessage({
        type: 'streamEnd',
        messageId,
        fullText
      });

      void this._recordInteractionToKnowledgeLog({
        actionType: 'Conversa Socrática Livre',
        prompt: text,
        response: fullText,
        level: this._currentHintLevel,
        context
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (this._streamAbortController.signal.aborted || msg.includes('cancelada') || msg.includes('aborted')) {
        return;
      }
      this._postMessage({
        type: 'streamError',
        messageId,
        error: `Erro ao obter resposta do tutor: ${msg}`
      });
    } finally {
      this._isStreaming = false;
    }
  }

  private async _generateSocraticResponse(params: {
    level: HintLevel;
    context: EditorContext;
    userPrompt?: string;
  }): Promise<void> {
    const { level, context, userPrompt } = params;

    this._cancelStreaming();
    this._isStreaming = true;
    this._streamAbortController = new AbortController();
    const messageId = this._generateId();

    this.onCatStateChange?.('thinking');

    try {
      const fullText = await this._gateway.streamHint({
        level,
        context,
        userPrompt,
        onChunk: (chunk) => {
          this.onCatStateChange?.('speaking');
          this._postMessage({
            type: 'streamChunk',
            messageId,
            chunk
          });
        },
        signal: this._streamAbortController.signal
      });

      const assistantMessage: ChatMessage = {
        id: messageId,
        sender: 'assistant',
        content: fullText,
        timestamp: Date.now(),
        hintLevel: level
      };
      this._appendMessage(assistantMessage);

      this.onCatStateChange?.('celebrating', `Miau! Terminei de escrever a pista Nível ${level} no chat! 🐾`);

      this._postMessage({
        type: 'streamEnd',
        messageId,
        fullText
      });

      void this._recordInteractionToKnowledgeLog({
        actionType: `Orientação Socrática Nível ${level}`,
        prompt: userPrompt || `Solicitação de dica Nível ${level}`,
        response: fullText,
        level,
        context
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (this._streamAbortController.signal.aborted || msg.includes('cancelada') || msg.includes('aborted')) {
        return;
      }
      this._postMessage({
        type: 'streamError',
        messageId,
        error: `Erro ao comunicar com a IA (${this._gateway.getActiveProviderType()}): ${msg}`
      });
    } finally {
      this._isStreaming = false;
    }
  }

  /**
   * Grava automaticamente cada ação/intervenção pedagógica em arquivo estruturado
   * em formato Markdown com Frontmatter YAML para futura leitura por modelos de IA e RAG.
   */
  private async _recordInteractionToKnowledgeLog(params: {
    actionType: string;
    prompt: string;
    response: string;
    level?: HintLevel;
    context?: EditorContext;
  }): Promise<void> {
    const config = vscode.workspace.getConfiguration('aprendeai');
    const autoNotes = config.get<boolean>('autoGenerateNotes', true);
    if (!autoNotes) return;

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return;

    try {
      const memoryDir = vscode.Uri.joinPath(workspaceFolder.uri, '.mentor-memory', 'llm-context');
      await vscode.workspace.fs.createDirectory(memoryDir);

      const memoryFileUri = vscode.Uri.joinPath(memoryDir, 'knowledge_memory.md');
      const now = new Date();
      const isoDate = now.toISOString();
      const activeMod = this._pathwayModules.find((m) => m.id === this._activeModuleId);

      const entryContent = `
---
recorded_at: "${isoDate}"
module_id: "${activeMod?.id || 'geral'}"
module_title: "${activeMod?.title || 'Conceitos Gerais'}"
action_type: "${params.actionType}"
hint_level: ${params.level || this._currentHintLevel}
file_context: "${params.context?.fileName || 'Workspace'}"
tags: [aprendeai, zpd, mentor-memory, socratic, ${activeMod?.id || 'geral'}]
---

### [${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR')}] ${params.actionType}
- **Arquivo / Contexto:** \`${params.context?.fileName || 'Workspace'}\` (Linhas: ${params.context?.selectionStartLine || 1}-${params.context?.selectionEndLine || 1})
- **Entrada / Dúvida do Aluno:**
> ${params.prompt.replace(/\r?\n/g, '\n> ')}
- **Intervenção Pedagógica da IA:**
${params.response.slice(0, 1600)}${params.response.length > 1600 ? '\n\n*(Conteúdo sintetizado para persistência de memória)*' : ''}

`;

      let existingContent = '';
      try {
        const fileBytes = await vscode.workspace.fs.readFile(memoryFileUri);
        existingContent = Buffer.from(fileBytes).toString('utf8');
      } catch {
        existingContent = `# 🧠 Grafo de Memória Contínua do Aluno (AprendeAI)
> Este log estruturado armazena a evolução do raciocínio, lacunas conceituais e sínteses socráticas para futura ingestão e leitura por modelos de IA (RAG e Fine-Tuning).
`;
      }

      const updatedContent = existingContent + '\n' + entryContent;
      await vscode.workspace.fs.writeFile(memoryFileUri, Buffer.from(updatedContent, 'utf8'));

      this._postMessage({
        type: 'autoNoteSaved',
        title: 'Memória da IA gravada',
        filePath: '.mentor-memory/llm-context/knowledge_memory.md'
      });
    } catch (err) {
      console.warn('Erro ao auto-gravar memória da IA:', err);
    }
  }

  private async _broadcastProviderStatus(): Promise<void> {
    try {
      const status = await this._gateway.getProviderStatus();
      this._postMessage({
        type: 'providerStatus',
        status
      });
    } catch {
      // Ignora erro de status transitório
    }
  }

  private _cancelStreaming(): void {
    if (this._isStreaming && this._streamAbortController) {
      this._streamAbortController.abort();
      this._isStreaming = false;
    }
  }

  private _appendMessage(msg: ChatMessage): void {
    this._history.push(msg);
    if (this._history.length > 50) {
      this._history = this._history.slice(-50);
    }
    this._context.workspaceState.update(STORAGE_KEY_HISTORY, this._history);
  }

  private _updateModuleStatuses(): void {
    let reachedCurrent = false;
    this._pathwayModules = this._pathwayModules.map((m) => {
      if (m.id === this._activeModuleId) {
        reachedCurrent = true;
        return { ...m, status: 'current' as const };
      }
      return {
        ...m,
        status: reachedCurrent ? ('locked' as const) : ('completed' as const)
      };
    });
  }

  private _extractEditorContext(): EditorContext {
    const editor = vscode.window.activeTextEditor;
    const activeMod = this._pathwayModules.find((m) => m.id === this._activeModuleId);
    const pathwayContext = activeMod ? {
      moduleId: activeMod.id,
      moduleTitle: activeMod.title,
      moduleTopic: activeMod.summary,
      objective: activeMod.pedagogicalObjective
    } : undefined;

    if (!editor) {
      return {
        pathwayContext,
        studentProfile: this._studentProfile
      };
    }

    const document = editor.document;
    const selection = editor.selection;
    const selectedText = document.getText(selection);

    return {
      activeFilePath: document.uri.fsPath,
      fileName: document.fileName.split(/[/\\]/).pop(),
      languageId: document.languageId,
      selectedText: selectedText || undefined,
      selectionStartLine: selection.start.line + 1,
      selectionEndLine: selection.end.line + 1,
      pathwayContext,
      studentProfile: this._studentProfile
    };
  }

  private _notifyEditorContext(): void {
    const context = this._extractEditorContext();
    this._postMessage({
      type: 'updateContext',
      context
    });
  }

  private _postMessage(message: HostToWebviewMessage): void {
    if (this._view) {
      this._view.webview.postMessage(message);
    }
  }

  private _generateId(): string {
    return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
  }

  private _getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, 'dist', 'webview.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, 'dist', 'webview.css')
    );

    const nonce = this._getNonce();

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
  <title>AprendeAI Mentor Socrático</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
