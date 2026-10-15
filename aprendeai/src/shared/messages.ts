/**
 * Protocolo Tipado IPC entre Extension Host e Webview UI
 * AprendeAI - Mentor Socrático de Programação
 */

export type HintLevel = 1 | 2 | 3 | 4;

export interface HintLevelInfo {
  level: HintLevel;
  title: string;
  description: string;
  badge: string;
}

export const HINT_LEVELS: Record<HintLevel, HintLevelInfo> = {
  1: {
    level: 1,
    title: 'Nível 1 - Conceitual',
    description: 'Aponta a direção do pensamento e conceitos fundamentais sem dar código.',
    badge: 'Conceito'
  },
  2: {
    level: 2,
    title: 'Nível 2 - Direcional',
    description: 'Estrutura lógica, pseudocódigo e estratégia passo a passo.',
    badge: 'Lógica'
  },
  3: {
    level: 3,
    title: 'Nível 3 - Específico',
    description: 'Sintaxe relevante, APIs e esqueletos parciais de código.',
    badge: 'Sintaxe'
  },
  4: {
    level: 4,
    title: 'Nível 4 - Solução Completa',
    description: 'Implementação detalhada acompanhada de perguntas reflexivas.',
    badge: 'Solução'
  }
};

export interface MindmapSubtopic {
  id: string;
  title: string;
  summary: string;
  completed?: boolean;
  stars?: number;
  challengePrompt?: string;
}

export interface LearningPathModule {
  id: string;
  order: number;
  title: string;
  summary: string;
  status: 'completed' | 'current' | 'locked';
  topics: string[];
  pedagogicalObjective: string;
  challengePrompt: string;
  tier: 1 | 2 | 3;
  parentId?: string;
  icon: string;
  stars: number;
  rank: string;
  subtopics?: MindmapSubtopic[];
}

export const INITIAL_LEARNING_PATHWAY: LearningPathModule[] = [
  {
    id: 'fundamentals',
    order: 1,
    title: 'Fundamentos & Tipagem Estrita',
    summary: 'Tipagem estática, imutabilidade e escopo léxico',
    status: 'completed',
    topics: ['Tipos Primitivos', 'Interfaces & Tipagem Estrita', 'Const vs Let & Imutabilidade'],
    pedagogicalObjective: 'Consolidar modelos mentais sobre imutabilidade e prevenção de bugs de runtime.',
    challengePrompt: 'Quero um desafio socrático sobre imutabilidade e tipagem estrita.',
    tier: 1,
    icon: '⚡',
    stars: 3,
    rank: 'Rank S',
    subtopics: [
      {
        id: 'fund-primitives',
        title: 'Tipos Primitivos & Incerteza (any vs unknown)',
        summary: 'Diferença semiótica entre any, unknown e never.',
        completed: true,
        stars: 3,
        challengePrompt: 'Me dê um desafio socrático sobre quando usar unknown em vez de any.'
      },
      {
        id: 'fund-immutability',
        title: 'Imutabilidade & Readonly Arrays',
        summary: 'Proteção contra mutação acidental de estado.',
        completed: true,
        stars: 3,
        challengePrompt: 'Como garanto que um objeto ou array complexo é profundamente imutável?'
      },
      {
        id: 'fund-interfaces',
        title: 'Contratos Estritos & Discriminated Unions',
        summary: 'Padrão type-safe com tag de união discriminada.',
        completed: true,
        stars: 3,
        challengePrompt: 'Como modelar estados de carregamento (idle, loading, success, error) com Discriminated Unions?'
      }
    ]
  },
  {
    id: 'async-logic',
    order: 2,
    title: 'Lógica & Assincronismo',
    summary: 'Promises, async/await, event loop e tratamento de erros',
    status: 'current',
    topics: ['Promises & Encadeamento', 'Async/Await & Try/Catch', 'Event Loop & Microtasks'],
    pedagogicalObjective: 'Fazer o aluno raciocinar sobre fluxos não-bloqueantes, concorrência e tratamento resiliente de erros assíncronos.',
    challengePrompt: 'Quero praticar um desafio de lógica assíncrona com Promises e tratamento robusto de erros.',
    tier: 2,
    parentId: 'fundamentals',
    icon: '🧭',
    stars: 2,
    rank: 'Rank A',
    subtopics: [
      {
        id: 'async-event-loop',
        title: 'Event Loop & Microtask Queue',
        summary: 'Ordem de execução: Call Stack vs Macrotask vs Microtask.',
        completed: true,
        stars: 3,
        challengePrompt: 'Me dê um exercício para prever a ordem de execução do console.log em timers e promises.'
      },
      {
        id: 'async-resilience',
        title: 'Resiliência com Promise.allSettled',
        summary: 'Lidar com falhas parciais sem derrubar todo o batch.',
        completed: false,
        stars: 2,
        challengePrompt: 'Como implementar uma requisição concorrente tolerante a falhas usando Promise.allSettled?'
      },
      {
        id: 'async-retry',
        title: 'Padrão Retry com Exponential Backoff',
        summary: 'Retentativas inteligentes em chamadas de rede instáveis.',
        completed: false,
        stars: 1,
        challengePrompt: 'Como estruturar uma função de retry com delay exponencial socrático?'
      }
    ]
  },
  {
    id: 'architecture',
    order: 3,
    title: 'Padrões Arquiteturais & Clean Code',
    summary: 'Clean Architecture, injeção de dependências e desacoplamento',
    status: 'locked',
    topics: ['Clean Architecture', 'Princípio da Responsabilidade Única (SRP)', 'Inversão de Dependências'],
    pedagogicalObjective: 'Orientar o aluno a desenhar módulos desacoplados e testáveis sem misturar regras de negócio e infraestrutura.',
    challengePrompt: 'Quero entender na prática como desacoplar regras de negócio usando Clean Architecture.',
    tier: 2,
    parentId: 'fundamentals',
    icon: '🧩',
    stars: 1,
    rank: 'Rank B',
    subtopics: [
      {
        id: 'arch-ports-adapters',
        title: 'Portas & Adaptadores (Hexagonal)',
        summary: 'Isolando serviços externos por interfaces abstratas.',
        completed: false,
        stars: 1,
        challengePrompt: 'Como desacoplar um cliente HTTP de terceiro do domínio central usando Ports and Adapters?'
      },
      {
        id: 'arch-dependency-injection',
        title: 'Inversão de Dependência (SOLID)',
        summary: 'Módulos de alto nível não devem depender de detalhes de baixo nível.',
        completed: false,
        stars: 0,
        challengePrompt: 'Qual a diferença entre Dependency Inversion e Dependency Injection na prática?'
      }
    ]
  },
  {
    id: 'performance',
    order: 4,
    title: 'Engenharia de Performance & Profiling',
    summary: 'Profiling de memória, testes automatizados e complexidade algorítmica',
    status: 'locked',
    topics: ['Testes Unitários', 'Complexidade de Tempo e Espaço (Big-O)', 'Memory Leaks & Profiling'],
    pedagogicalObjective: 'Instigar o aluno a medir gargalos, escrever testes de regressão e aplicar refatorações limpas.',
    challengePrompt: 'Quero refatorar um trecho de código para melhorar a performance e cobertura de testes.',
    tier: 3,
    parentId: 'async-logic',
    icon: '💎',
    stars: 0,
    rank: 'Rank Master',
    subtopics: [
      {
        id: 'perf-big-o',
        title: 'Análise de Complexidade Big-O',
        summary: 'Identificação de gargalos O(N²) e refatoração para O(N) ou O(1).',
        completed: false,
        stars: 0,
        challengePrompt: 'Como transformar uma busca aninhada em arrays em um lookup O(1) com Maps ou Sets?'
      },
      {
        id: 'perf-memory-leaks',
        title: 'Memory Leaks & Event Listeners Desconectados',
        summary: 'Prevenindo vazamento de memória em closures e referências retidas.',
        completed: false,
        stars: 0,
        challengePrompt: 'Como detectar e limpar listeners ou intervalos para evitar memory leak?'
      }
    ]
  }
];

export type StudentExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type StudentCognitiveStyle = 'step_by_step_practical' | 'visual_analogies' | 'rigorous_architectural';

export interface StudentProfileContext {
  name?: string;
  experienceLevel: StudentExperienceLevel;
  currentGoal: string;
  blindSpots: string[];
  preferredStyle: StudentCognitiveStyle;
  bktScore: number;
  targetLanguage?: string;
  notes?: string;
}

export const DEFAULT_STUDENT_PROFILE: StudentProfileContext = {
  name: 'Desenvolvedor',
  experienceLevel: 'intermediate',
  currentGoal: 'Dominar Lógica Assíncrona & Concorrência Resiliente',
  blindSpots: [
    'Esquecimento de await em loops assíncronos',
    'Tratamento de exceções com Promise.all vs Promise.allSettled'
  ],
  preferredStyle: 'step_by_step_practical',
  bktScore: 68,
  targetLanguage: 'TypeScript',
  notes: 'Priorizar pseudocódigo e modelo mental antes da sintaxe complexa.'
};

export interface EditorContext {
  activeFilePath?: string;
  fileName?: string;
  languageId?: string;
  selectedText?: string;
  selectionStartLine?: number;
  selectionEndLine?: number;
  terminalError?: string;
  pathwayContext?: {
    moduleId: string;
    moduleTitle: string;
    moduleTopic: string;
    objective: string;
  };
  studentProfile?: StudentProfileContext;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  hintLevel?: HintLevel;
  isEmergencyBypass?: boolean;
  metadata?: {
    terminalOutput?: string;
    filePath?: string;
    languageId?: string;
  };
}

export type LLMProviderType = 'ollama' | 'gemini' | 'openai' | 'claude';

export interface ProviderStatusInfo {
  provider: LLMProviderType;
  model: string;
  connected: boolean;
  statusText: string;
  isConfigured: boolean;
}

/**
 * Mensagens enviadas do Webview (Frontend) para o Host (Extension Backend)
 */
export type WebviewToHostMessage =
  | {
      type: 'requestHint';
      level: HintLevel;
      prompt?: string;
      context?: EditorContext;
      bypassFriction?: boolean;
    }
  | {
      type: 'explainTerminalError';
      terminalOutput?: string;
    }
  | {
      type: 'emergencyBypass';
      reason?: string;
    }
  | {
      type: 'cancelStream';
    }
  | {
      type: 'sendMessage';
      text: string;
    }
  | {
      type: 'clearHistory';
    }
  | {
      type: 'generateStudyNote';
      topic?: string;
      context?: EditorContext;
    }
  | {
      type: 'webviewReady';
    }
  | {
      type: 'changeProvider';
      provider: LLMProviderType;
    }
  | {
      type: 'getProviderStatus';
    }
  | {
      type: 'openSettings';
    }
  | {
      type: 'fetchProviderModels';
      provider: LLMProviderType;
      apiKey?: string;
      baseUrl?: string;
    }
  | {
      type: 'saveProviderConfig';
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
    }
  | {
      type: 'getProviderConfig';
      provider: LLMProviderType;
    }
  | {
      type: 'toggleEnabled';
      enabled: boolean;
    }
  | {
      type: 'continueResponse';
    }
  | {
      type: 'serverSync';
    }
  | {
      type: 'selectPathModule';
      moduleId: string;
      subtopicId?: string;
    }
  | {
      type: 'startPathChallenge';
      moduleId: string;
      subtopicId?: string;
      prompt?: string;
    }
  | {
      type: 'saveStudentProfile';
      profile: StudentProfileContext;
    }
  | {
      type: 'getStudentProfile';
    };

/**
 * Mensagens enviadas do Host (Extension Backend) para o Webview (Frontend)
 */
export type HostToWebviewMessage =
  | {
      type: 'streamChunk';
      messageId: string;
      chunk: string;
    }
  | {
      type: 'streamEnd';
      messageId: string;
      fullText: string;
      metadata?: Record<string, unknown>;
    }
  | {
      type: 'streamError';
      messageId?: string;
      error: string;
    }
  | {
      type: 'restoreHistory';
      messages: ChatMessage[];
    }
  | {
      type: 'updateContext';
      context: EditorContext;
    }
  | {
      type: 'studentProfileUpdated';
      profile: StudentProfileContext;
    }
  | {
      type: 'pathwayState';
      modules: LearningPathModule[];
      activeModuleId: string;
    }
  | {
      type: 'hintLevelChanged';
      level: HintLevel;
    }
  | {
      type: 'studyNoteCreated';
      title: string;
      filePath: string;
      graphPath?: string;
    }
  | {
      type: 'autoNoteSaved';
      title: string;
      filePath: string;
    }
  | {
      type: 'providerStatus';
      status: ProviderStatusInfo;
    }
  | {
      type: 'productiveFrictionWarning';
      message: string;
      targetLevel: HintLevel;
    }
  | {
      type: 'providerModelsResult';
      provider: LLMProviderType;
      models: string[];
      success: boolean;
      error?: string;
    }
  | {
      type: 'providerConfigData';
      provider: LLMProviderType;
      apiKey: string;
      model: string;
      baseUrl?: string;
      availableModels: string[];
      temperature?: number;
      maxTokens?: number;
      topP?: number;
      pedagogicalMode?: string;
      autoGenerateNotes?: boolean;
      productiveFriction?: boolean;
    }
  | {
      type: 'saveConfigResult';
      success: boolean;
      message: string;
    }
  | {
      type: 'enabledStatus';
      enabled: boolean;
    }
  | {
      type: 'serverSyncResult';
      success: boolean;
      timestamp: number;
      message: string;
      masteryScore: number;
    };

