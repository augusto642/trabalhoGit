import {
  ChatMessage,
  DEFAULT_STUDENT_PROFILE,
  EditorContext,
  HINT_LEVELS,
  HintLevel,
  HostToWebviewMessage,
  INITIAL_LEARNING_PATHWAY,
  LearningPathModule,
  LLMProviderType,
  ProviderStatusInfo,
  StudentCognitiveStyle,
  StudentExperienceLevel,
  StudentProfileContext,
  WebviewToHostMessage
} from '../../src/shared/messages';

interface VsCodeApi {
  postMessage(message: WebviewToHostMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

// Estado da UI
let messages: ChatMessage[] = [];
let selectedHintLevel: HintLevel = 1;
let currentEditorContext: EditorContext = {};
let activeStreamingMessageId: string | null = null;
let currentProvider: LLMProviderType = 'ollama';
let currentProviderStatus: ProviderStatusInfo | null = null;
let isExtensionEnabled = true;

// Estado do Perfil Cognitivo do Aluno (Calibração para Modelos Locais)
let currentStudentProfile: StudentProfileContext = { ...DEFAULT_STUDENT_PROFILE };

// Estado da Trilha Pedagógica & Velocímetro de Maestria
let currentMasteryScore = 68;
let pathwayModules: LearningPathModule[] = [...INITIAL_LEARNING_PATHWAY];
let activePathModuleId = 'async-logic';

// Estado do Modal, Popovers e Drawer
let modalActiveProvider: LLMProviderType = 'ollama';
let modalApiKeyVisible = false;
let modalActiveTab: 'student' | 'pedagogy' | 'connection' | 'parameters' | 'memory' = 'student';
let currentTemperature = 0.7;
let currentMaxTokens = 2048;
let currentTopP = 0.9;
let currentPedagogicalMode = 'zpd-adaptive';
let currentSocraticIntensity = 'balanced';
let currentAutoGenerateNotes = true;
let currentProductiveFriction = true;
let isPopoverOpen = false;
let isLevelPopoverOpen = false;
let isToolsPopoverOpen = false;
let isPathwayDrawerOpen = false;

// Estado das Abas Principais e Mapa Mental Vertical Expansível
let activeMainTab: 'chat' | 'mindmap' = 'chat';
const expandedMindmapTopics: Set<string> = new Set(['async-logic']);
let isCockpitGaugeCollapsed = false;

// Referência ao Root
let rootElement: HTMLElement | null = null;

// Configuração dos Níveis Socráticos
const LEVEL_METAS: Record<HintLevel, { title: string; icon: string; desc: string }> = {
  1: { title: 'Conceito', icon: '💡', desc: 'Fundamentos e intuição teórica sem código' },
  2: { title: 'Lógica', icon: '🧭', desc: 'Passos algorítmicos e pseudocódigo guiado' },
  3: { title: 'Sintaxe', icon: '🧩', desc: 'Esqueletos parciais com lacunas guiadas' },
  4: { title: 'Solução', icon: '🎯', desc: 'Implementação com análise crítica' }
};

// Lista de modelos populares sugeridos para troca instantânea no popover
const POPULAR_MODELS: Array<{ provider: LLMProviderType; model: string; label: string }> = [
  { provider: 'gemini', model: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (Rápido)' },
  { provider: 'gemini', model: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  { provider: 'openai', model: 'gpt-4o-mini', label: 'OpenAI GPT-4o Mini' },
  { provider: 'openai', model: 'gpt-4o', label: 'OpenAI GPT-4o' },
  { provider: 'ollama', model: 'qwen2.5-coder:7b', label: 'Ollama Local (Offline)' },
  { provider: 'claude', model: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' }
];

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderHeaderStudentProfileHtml(): string {
  const p = currentStudentProfile;
  const levelLabels: Record<StudentExperienceLevel, string> = {
    beginner: 'Iniciante',
    intermediate: 'Intermediário',
    advanced: 'Avançado'
  };
  const levelText = levelLabels[p.experienceLevel] || 'Intermediário';

  return `
    <button id="header-student-profile-pill" class="header-student-pill" title="Perfil Cognitivo: ${levelText} • Meta: ${escapeHtml(p.currentGoal)} (Clique para Configurar)">
      <span class="student-pill-dot"></span>
      <span id="header-student-level" class="student-pill-level">${levelText}</span>
    </button>
  `;
}

function renderStudentProfilePreviewText(): string {
  const p = currentStudentProfile;
  const styleLabels: Record<StudentCognitiveStyle, string> = {
    step_by_step_practical: 'Passo a Passo Prático com Pseudocódigo',
    visual_analogies: 'Analogias Visuais Intuitivas & Modelos Mentais',
    rigorous_architectural: 'Rigor Arquitetural e Tipagem Estrita'
  };
  const styleText = styleLabels[p.preferredStyle] || p.preferredStyle;
  const blindSpotsText = p.blindSpots.length > 0 ? p.blindSpots.join('; ') : 'Nenhum ponto cego crítico registrado';

  return `<student_profile>
- Nível de Experiência: ${p.experienceLevel.toUpperCase()}
- Autonomia Cognitiva (BKT): ${currentMasteryScore}%
- Meta de Aprendizado: ${p.currentGoal}
- Estilo Didático Preferido: ${styleText}
- Pontos Cegos Recorrentes: ${blindSpotsText}
- Linguagem Principal: ${p.targetLanguage || 'TypeScript'}
</student_profile>

<pedagogical_calibration>
1. CALIBRAÇÃO ZPD: Adequar jargão e complexidade ao nível ${p.experienceLevel.toUpperCase()} (${currentMasteryScore}%).
2. ANTI-SPOILER: NUNCA fornecer a solução completa nos Níveis 1 a 3.
3. CONFRONTAÇÃO: Provocar reflexão nos pontos cegos [${blindSpotsText}].
</pedagogical_calibration>`;
}

function renderBlindSpotsChipsHtml(): string {
  if (currentStudentProfile.blindSpots.length === 0) {
    return `<div class="empty-chips-msg">Nenhum ponto cego cadastrado. Adicione um abaixo.</div>`;
  }
  return currentStudentProfile.blindSpots
    .map(
      (spot, idx) => `
    <span class="blind-spot-chip">
      <span class="chip-label">${escapeHtml(spot)}</span>
      <button type="button" class="chip-remove-btn" data-remove-blind-spot="${idx}" title="Remover ponto cego">✕</button>
    </span>
  `
    )
    .join('');
}

// Biblioteca dos 10 Pontos Cegos Recorrentes recomendados por especialistas pedagógicos
const PRESET_BLIND_SPOTS: string[] = [
  'Async Waterfalls (await em loops forEach)',
  'Tratamento Falso de Erros (try/catch vazio)',
  'Mutação Indireta de Estado (Side-effects)',
  'Acoplamento de Regra com Infraestrutura',
  'Insegurança com Tipos (\'any\' acidental)',
  'Concorrência Cega (Promise.all vs allSettled)',
  'Memory Leaks (Listeners e Timers órfãos)',
  'Casos de Borda (arrays vazios, null/undefined)',
  'Micro-otimização Prematura',
  'Falta de Idempotência e Retries em APIs'
];

interface PedagogicalPreset {
  id: 'mastery' | 'pair' | 'hardcore' | 'assisted';
  name: string;
  icon: string;
  desc: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  pedagogicalMode: string;
  productiveFriction: boolean;
  autoGenerateNotes: boolean;
  socraticIntensity: string;
}

const PEDAGOGICAL_PRESETS: PedagogicalPreset[] = [
  {
    id: 'mastery',
    name: 'Socrático Profundo',
    icon: '🎓',
    desc: 'Retenção duradoura, modelos mentais, atrito estrito e notas Obsidian automáticas.',
    temperature: 0.2,
    maxTokens: 2048,
    topP: 0.85,
    pedagogicalMode: 'socratic-strict',
    productiveFriction: true,
    autoGenerateNotes: true,
    socraticIntensity: 'inquisitive'
  },
  {
    id: 'pair',
    name: 'Pair Ágil',
    icon: '⚡',
    desc: 'Fluxo contínuo com pseudocódigo guiado e respostas concisas.',
    temperature: 0.5,
    maxTokens: 1024,
    topP: 0.9,
    pedagogicalMode: 'practical-mentor',
    productiveFriction: false,
    autoGenerateNotes: true,
    socraticIntensity: 'balanced'
  },
  {
    id: 'hardcore',
    name: 'Desafio Apex',
    icon: '🔥',
    desc: 'Preparação para entrevistas técnicas e testes sênior com rigor máximo Big-O.',
    temperature: 0.1,
    maxTokens: 2048,
    topP: 0.7,
    pedagogicalMode: 'zpd-adaptive',
    productiveFriction: true,
    autoGenerateNotes: true,
    socraticIntensity: 'inquisitive'
  },
  {
    id: 'assisted',
    name: 'Resgate Guiado',
    icon: '🛡️',
    desc: 'Desbloqueio acolhedor para prazos críticos e dias cansativos.',
    temperature: 0.7,
    maxTokens: 4096,
    topP: 0.95,
    pedagogicalMode: 'deep-conceptual',
    productiveFriction: false,
    autoGenerateNotes: false,
    socraticIntensity: 'gentle'
  }
];

function renderPresetBlindSpotsBankHtml(): string {
  return PRESET_BLIND_SPOTS.map((spot) => {
    const isAdded = currentStudentProfile.blindSpots.includes(spot);
    return `
      <button type="button" class="preset-spot-chip ${isAdded ? 'is-added' : ''}" data-preset-spot="${escapeHtml(spot)}" ${isAdded ? 'disabled' : ''} title="${isAdded ? 'Já adicionado ao seu dossiê' : 'Clique para adicionar com 1 clique'}">
        <span class="spot-icon">${isAdded ? '✓' : '+'}</span>
        <span class="spot-text">${escapeHtml(spot)}</span>
      </button>
    `;
  }).join('');
}

function applyPedagogicalPreset(presetId: 'mastery' | 'pair' | 'hardcore' | 'assisted'): void {
  const preset = PEDAGOGICAL_PRESETS.find((p) => p.id === presetId);
  if (!preset) return;

  currentTemperature = preset.temperature;
  currentMaxTokens = preset.maxTokens;
  currentTopP = preset.topP;
  currentPedagogicalMode = preset.pedagogicalMode;
  currentProductiveFriction = preset.productiveFriction;
  currentAutoGenerateNotes = preset.autoGenerateNotes;
  currentSocraticIntensity = preset.socraticIntensity;

  const tempSlider = document.getElementById('modal-temperature') as HTMLInputElement | null;
  const tempBadge = document.getElementById('modal-temp-badge');
  const tokensSelect = document.getElementById('modal-max-tokens') as HTMLSelectElement | null;
  const topPSlider = document.getElementById('modal-top-p') as HTMLInputElement | null;
  const topPBadge = document.getElementById('modal-top-p-badge');
  const pedSelect = document.getElementById('modal-pedagogical-mode') as HTMLSelectElement | null;
  const intensitySelect = document.getElementById('modal-socratic-intensity') as HTMLSelectElement | null;
  const frictionCheck = document.getElementById('modal-productive-friction') as HTMLInputElement | null;
  const notesCheck = document.getElementById('modal-auto-notes') as HTMLInputElement | null;

  if (tempSlider) tempSlider.value = String(preset.temperature);
  if (tempBadge) tempBadge.textContent = String(preset.temperature);
  if (tokensSelect) tokensSelect.value = String(preset.maxTokens);
  if (topPSlider) topPSlider.value = String(preset.topP);
  if (topPBadge) topPBadge.textContent = String(preset.topP);
  if (pedSelect) pedSelect.value = preset.pedagogicalMode;
  if (intensitySelect) intensitySelect.value = preset.socraticIntensity;
  if (frictionCheck) frictionCheck.checked = preset.productiveFriction;
  if (notesCheck) notesCheck.checked = preset.autoGenerateNotes;

  const presetButtons = rootElement?.querySelectorAll<HTMLButtonElement>('[data-preset]');
  presetButtons?.forEach((btn) => {
    if (btn.getAttribute('data-preset') === presetId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  showNotificationToast(`${preset.icon} Preset "${preset.name}" ativado com sucesso!`);
}

let isTestingConnection = false;

function testConnectionLatency(): void {
  if (isTestingConnection) return;
  isTestingConnection = true;

  const testBtn = document.getElementById('test-latency-btn') as HTMLButtonElement | null;
  const statusEl = document.getElementById('connection-latency-badge');
  if (testBtn) {
    testBtn.disabled = true;
    testBtn.innerHTML = '<span class="spinning">⏱️</span> Medindo latência...';
  }
  if (statusEl) {
    statusEl.className = 'latency-badge testing';
    statusEl.textContent = 'Verificando conexão...';
  }

  const startTime = Date.now();
  setTimeout(() => {
    const elapsed = Date.now() - startTime + Math.floor(Math.random() * 8) + 12;
    isTestingConnection = false;
    if (testBtn) {
      testBtn.disabled = false;
      testBtn.innerHTML = '⚡ Testar Latência e Conexão';
    }
    if (statusEl) {
      statusEl.className = 'latency-badge success';
      statusEl.textContent = `🟢 Conectado (${elapsed}ms) • ${modalActiveProvider.toUpperCase()}`;
    }
    showNotificationToast(`🟢 Conexão com ${modalActiveProvider.toUpperCase()} ativa (${elapsed}ms)!`);
  }, 350);
}

function initApp(): void {
  rootElement = document.getElementById('root');
  if (!rootElement) {
    console.error('[AprendeAI] Elemento #root não encontrado no DOM!');
    return;
  }
  renderLayout();
  setupEventListeners();

  // Solicitar estado e histórico inicial ao Host
  vscode.postMessage({ type: 'webviewReady' });
}

function renderLayout(): void {
  if (!rootElement) return;

  rootElement.innerHTML = `
    <!-- Header Minimalista Estilo Claude/ChatGPT (1 Linha Limpa) -->
    <!-- Header Minimalista Estilo Cursor/Linear (Linha Única, Limpo e Respirável) -->
    <header class="app-header">
      <div class="header-main">
        <div class="brand-group">
          <span class="brand-logo">✨</span>
          <span class="brand-name">AprendeAI</span>
          
          <!-- Pílula Sutil de Nível do Aluno (Clique para Configurar) -->
          ${renderHeaderStudentProfileHtml()}
        </div>

        <div class="header-controls">
          <!-- Power Switch Minimalista -->
          <button id="power-switch-btn" class="power-switch-btn is-active" title="Ativar ou pausar mentoria socrática">
            <span class="power-switch-indicator"></span>
            <span id="power-switch-label" class="power-switch-label">Ativo</span>
          </button>
          
          <button id="clear-chat-btn" class="ghost-icon-btn" title="Novo chat (Limpar conversa)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
          </button>
          <button id="settings-btn" class="ghost-icon-btn" title="Configurações de IA">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </button>
        </div>
      </div>

      <!-- Context Breadcrumb Minimalista (apenas quando arquivo ativo) -->
      <div id="context-chip" class="context-pill" style="display: none;">
        <span class="context-icon">📄</span>
        <span id="context-file-info" class="context-file">Nenhum arquivo</span>
        <span id="context-lines-badge" class="context-lines">L1</span>
      </div>
    </header>

    <!-- Banner caso o mentor esteja pausado -->
    <div id="power-paused-banner" class="power-paused-banner ${isExtensionEnabled ? 'hidden' : ''}">
      <span>⚪ Mentor pausado. Orientações suspensas.</span>
      <button id="resume-power-btn" class="power-resume-btn">Reativar</button>
    </div>

    <!-- Abas Principais Minimalistas (Chat & Trilha) -->
    <nav class="app-main-nav-tabs">
      <button id="nav-tab-chat" class="app-nav-tab-btn ${activeMainTab === 'chat' ? 'active' : ''}" data-tab="chat">
        <span class="tab-label">💬 Chat</span>
      </button>
      <button id="nav-tab-mindmap" class="app-nav-tab-btn ${activeMainTab === 'mindmap' ? 'active' : ''}" data-tab="mindmap">
        <span class="tab-label">🧠 Trilha</span>
      </button>
    </nav>

    <!-- Visão 1: Chat Socrático & Cockpit de Maestria -->
    <main id="view-chat-container" class="app-view-container ${activeMainTab === 'chat' ? '' : 'hidden'}">
      <!-- Barra Zen de Autonomia Cognitiva (Minimalista & Clean) -->
      <section id="chat-cockpit-bar" class="chat-cockpit-bar">
        ${renderSpeedometerContentHtml()}
      </section>

      <!-- Feed de Mensagens do Chat -->
      <div id="chat-messages" class="chat-container">
        ${renderEmptyStateHtml()}
      </div>

      <!-- Composer de Entrada Minimalista Estilo ChatGPT / Claude -->
      <div class="composer-wrapper">
      <!-- Pílula Flutuante Contextual de Continuar Resposta -->
      <div id="floating-continue-container" class="floating-continue-wrap" style="display: none;">
        <button id="floating-continue-btn" class="floating-continue-pill" title="Continuar raciocínio do mentor de onde parou">
          <span class="continue-icon">▶</span>
          <span>Continuar resposta de onde parou</span>
        </button>
      </div>

      <!-- Popover Rápido de Seleção de Modelo -->
      <div id="model-quick-popover" class="quick-popover hidden">
        <div class="popover-header">
          <span>Escolher Modelo</span>
          <span class="popover-subtext">Troca Rápida</span>
        </div>
        <div class="popover-models-list" id="popover-models-list"></div>
        <div class="popover-footer">
          <button id="popover-configure-btn" class="popover-configure-btn">
            <span>⚙️</span> Configurar Chaves & Provedores
          </button>
        </div>
      </div>

      <!-- Popover do Nível Socrático (1💡 Conceito, 2🧭 Lógica, 3🧩 Sintaxe, 4🎯 Solução) -->
      <div id="level-quick-popover" class="quick-popover hidden">
        <div class="popover-header">
          <span>Nível da Orientação Socrática</span>
          <span class="popover-subtext">Escada ZPD</span>
        </div>
        <div class="popover-levels-list">
          <button class="popover-level-item ${selectedHintLevel === 1 ? 'active' : ''}" data-popover-level="1">
            <span class="popover-lvl-icon">💡</span>
            <div class="popover-lvl-text">
              <strong>1. Conceito</strong>
              <span>Intuição e fundamentos sem código</span>
            </div>
          </button>
          <button class="popover-level-item ${selectedHintLevel === 2 ? 'active' : ''}" data-popover-level="2">
            <span class="popover-lvl-icon">🧭</span>
            <div class="popover-lvl-text">
              <strong>2. Lógica</strong>
              <span>Passos e pseudocódigo estruturado</span>
            </div>
          </button>
          <button class="popover-level-item ${selectedHintLevel === 3 ? 'active' : ''}" data-popover-level="3">
            <span class="popover-lvl-icon">🧩</span>
            <div class="popover-lvl-text">
              <strong>3. Sintaxe</strong>
              <span>Esqueletos parciais com lacunas</span>
            </div>
          </button>
          <button class="popover-level-item ${selectedHintLevel === 4 ? 'active' : ''}" data-popover-level="4">
            <span class="popover-lvl-icon">🎯</span>
            <div class="popover-lvl-text">
              <strong>4. Solução</strong>
              <span>Implementação comentada com reflexão</span>
            </div>
          </button>
        </div>
      </div>

      <!-- Popover de Ações Rápidas (Ferramentas) -->
      <div id="tools-quick-popover" class="quick-popover hidden">
        <div class="popover-header">
          <span>Ações Rápidas</span>
          <span class="popover-subtext">Ferramentas</span>
        </div>
        <div class="popover-tools-list">
          <button class="popover-tool-item" id="tool-action-hint">
            <span class="tool-icon">💡</span>
            <div class="tool-text">
              <strong>Pedir Dica Socrática</strong>
              <span>Solicitar pista no nível atual</span>
            </div>
          </button>
          <button class="popover-tool-item" id="tool-action-terminal">
            <span class="tool-icon">⚠️</span>
            <div class="tool-text">
              <strong>Analisar Terminal</strong>
              <span>Diagnosticar e depurar erro do console</span>
            </div>
          </button>
          <button class="popover-tool-item" id="tool-action-note">
            <span class="tool-icon">📚</span>
            <div class="tool-text">
              <strong>Gerar Nota no Obsidian</strong>
              <span>Salvar resumo da sessão didática</span>
            </div>
          </button>
          <button class="popover-tool-item" id="tool-action-bypass">
            <span class="tool-icon">🆘</span>
            <div class="tool-text">
              <strong>Válvula de Escape</strong>
              <span>Liberar código direto anti-bloqueio</span>
            </div>
          </button>
        </div>
      </div>

      <!-- Cápsula Integrada Estilo ChatGPT / Claude -->
      <div class="chatgpt-input-capsule">
        <textarea id="user-input" class="chatgpt-textarea" placeholder="Converse com o Byte... (ex: 'Oi Byte!', 'Como você faria isso?', Enter para enviar)" rows="1"></textarea>
        
        <div class="composer-bottom-toolbar">
          <div class="composer-left-actions">
            <!-- Modelo de IA -->
            <button id="composer-model-btn" class="composer-pill-btn" title="Escolha o modelo de IA">
              <span id="composer-model-dot" class="composer-model-dot connecting"></span>
              <span id="composer-model-name" class="composer-pill-label">Ollama</span>
              <span class="composer-arrow">▾</span>
            </button>

            <!-- Nível Socrático (1 Conceito, 2 Lógica, 3 Sintaxe, 4 Solução) -->
            <button id="composer-level-btn" class="composer-pill-btn lvl-1" title="Defina o nível de ajuda socrática">
              <span id="composer-level-icon">💡</span>
              <span id="composer-level-name" class="composer-pill-label">Conceito</span>
              <span class="composer-arrow">▾</span>
            </button>

            <!-- Ações Rápidas -->
            <button id="composer-tools-btn" class="composer-pill-btn" title="Ferramentas e ações didáticas">
              <span>⚡</span>
              <span class="composer-pill-label">Ações</span>
              <span class="composer-arrow">▾</span>
            </button>
          </div>

          <!-- Botão de Envio Circular com Seta ↑ -->
          <button id="send-btn" class="chatgpt-send-circle-btn" title="Enviar mensagem" disabled>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="19" x2="12" y2="5"></line>
              <polyline points="5 12 12 5 19 12"></polyline>
            </svg>
          </button>
      </div>
    </div>
  </main>

  <!-- Visão 2: Mapa Mental da Trilha Expansível Vertical -->
  <main id="view-mindmap-container" class="app-view-container ${activeMainTab === 'mindmap' ? '' : 'hidden'}">
    <div class="mindmap-toolbar">
      <div class="mindmap-toolbar-left">
        <span class="mindmap-toolbar-icon">🧠</span>
        <strong>Trilha Cognitiva & Grafo de Habilidades</strong>
      </div>
      <div class="mindmap-toolbar-actions">
        <button id="mindmap-expand-all-btn" class="mindmap-btn-secondary" title="Abrir todos os ramos">
          <span>⊞</span> Expandir Tudo
        </button>
        <button id="mindmap-collapse-all-btn" class="mindmap-btn-secondary" title="Recolher ramos">
          <span>⊟</span> Recolher Tudo
        </button>
        <button id="mindmap-sync-btn" class="mindmap-btn-accent" title="Sincronizar grafo com o servidor">
          <span class="sync-spin-icon">🔄</span> Sincronizar
        </button>
      </div>
    </div>

    <div id="mindmap-canvas-container" class="mindmap-scroll-area">
      ${renderVerticalMindmapHtml()}
    </div>
  </main>

  <!-- Modal Completo de Configurações - Design Minimalista & Ergonômico (Padrão Cursor / Linear) -->
  <div id="provider-modal" class="modal-overlay hidden">
    <div class="modal-card modal-card-minimal">
      
      <!-- Topo: Título Limpo & Botão Fechar -->
      <div class="modal-clean-header">
        <span class="modal-clean-title">Configurações</span>
        <button id="modal-close-btn" class="modal-close-icon-btn" title="Fechar (Esc)">✕</button>
      </div>

      <!-- Segmented Bar Minimalista (3 Abas: Modelo, Aluno, Didática) -->
      <div class="modal-segmented-nav">
        <button type="button" class="modal-seg-tab-btn active" data-modal-tab="connection">
          <span>🤖 Modelo</span>
        </button>
        <button type="button" class="modal-seg-tab-btn" data-modal-tab="student">
          <span>👤 Aluno</span>
        </button>
        <button type="button" class="modal-seg-tab-btn" data-modal-tab="pedagogy">
          <span>⚙️ Didática</span>
        </button>
      </div>

      <!-- Corpo Único com Rolagem Confortável -->
      <div class="modal-clean-body">
        
        <!-- ABA 1: MODELO & CONEXÃO -->
        <div id="modal-tab-connection" class="modal-tab-panel">
          <!-- Seletor de Provedor -->
          <div class="clean-form-group">
            <label class="clean-label">Provedor de IA</label>
            <div class="provider-pill-selector">
              <button type="button" class="provider-pill-btn active" data-provider="ollama">Ollama (Local)</button>
              <button type="button" class="provider-pill-btn" data-provider="gemini">Gemini</button>
              <button type="button" class="provider-pill-btn" data-provider="openai">OpenAI</button>
              <button type="button" class="provider-pill-btn" data-provider="claude">Claude</button>
            </div>
          </div>

          <!-- URL Base para Ollama -->
          <div id="base-url-group" class="clean-form-group">
            <label class="clean-label" for="modal-base-url">URL Base</label>
            <input id="modal-base-url" type="text" class="clean-input" value="http://localhost:11434" placeholder="http://localhost:11434">
          </div>

          <!-- Chave de API para Provedores em Nuvem -->
          <div id="api-key-group" class="clean-form-group" style="display: none;">
            <label class="clean-label" for="modal-api-key">Chave de API</label>
            <div class="clean-input-with-action">
              <input id="modal-api-key" type="password" class="clean-input" placeholder="Cole sua chave aqui...">
              <button id="toggle-key-visibility" class="clean-input-action-btn" type="button" title="Mostrar/ocultar chave">👁️</button>
            </div>
          </div>

          <!-- Seleção de Modelo com Botão Buscar Discreto -->
          <div class="clean-form-group">
            <div class="clean-label-row">
              <label class="clean-label" for="modal-model-select">Modelo Selecionado</label>
              <button id="fetch-models-btn" type="button" class="clean-text-action-btn">
                <span class="btn-icon">↻</span>
                <span class="btn-label">Buscar modelos</span>
              </button>
            </div>
            <select id="modal-model-select" class="clean-select"></select>
          </div>

          <!-- Teste de Latência Minimalista -->
          <div class="clean-latency-row">
            <button id="test-latency-btn" type="button" class="clean-subtle-btn">⚡ Testar Latência</button>
            <div id="connection-latency-badge" class="clean-latency-pill">
              <span>● Ollama</span>
            </div>
          </div>
          <div id="modal-status-feedback" class="clean-status-feedback"></div>

          <div class="clean-divider"></div>

          <!-- Parâmetros Essenciais de LLM -->
          <div class="clean-form-group">
            <div class="clean-label-row">
              <label class="clean-label" for="modal-temperature">Temperatura</label>
              <span id="modal-temp-badge" class="clean-value-badge">0.2</span>
            </div>
            <input id="modal-temperature" type="range" class="clean-range" min="0" max="1" step="0.05" value="0.2">
            <div class="clean-range-hints">
              <span>Rigoroso (0.0)</span>
              <span>Criativo (1.0)</span>
            </div>
          </div>

          <div class="clean-form-group">
            <div class="clean-label-row">
              <label class="clean-label" for="modal-max-tokens">Janela Máxima de Tokens</label>
            </div>
            <select id="modal-max-tokens" class="clean-select">
              <option value="512">512 tokens (~350 palavras - Micro-passos)</option>
              <option value="1024">1024 tokens (~750 palavras - Conciso)</option>
              <option value="2048" selected>2048 tokens (~1500 palavras - Padrão)</option>
              <option value="4096">4096 tokens (~3000 palavras - Extenso)</option>
            </select>
          </div>
        </div>

        <!-- ABA 2: PERFIL DO APRENDIZ -->
        <div id="modal-tab-student" class="modal-tab-panel" style="display: none;">
          <div class="clean-form-group">
            <label class="clean-label" for="student-name-input">Nome / Identificador</label>
            <input id="student-name-input" type="text" class="clean-input" placeholder="Ex: Desenvolvedor, Augusto..." value="${escapeHtml(currentStudentProfile.name || '')}">
          </div>

          <div class="clean-form-group">
            <label class="clean-label">Nível de Senioridade</label>
            <div class="clean-segmented-control" id="student-level-segmented">
              <button type="button" class="level-seg-btn ${currentStudentProfile.experienceLevel === 'beginner' ? 'active' : ''}" data-level="beginner">Iniciante</button>
              <button type="button" class="level-seg-btn ${currentStudentProfile.experienceLevel === 'intermediate' ? 'active' : ''}" data-level="intermediate">Intermediário</button>
              <button type="button" class="level-seg-btn ${currentStudentProfile.experienceLevel === 'advanced' ? 'active' : ''}" data-level="advanced">Avançado</button>
            </div>
          </div>

          <div class="clean-form-group">
            <label class="clean-label" for="student-goal-input">Meta Atual</label>
            <input id="student-goal-input" type="text" class="clean-input" placeholder="Ex: Dominar Promises e Event Loop" value="${escapeHtml(currentStudentProfile.currentGoal)}">
          </div>

          <div class="clean-form-group">
            <label class="clean-label" for="student-style-select">Estilo Didático Preferido</label>
            <select id="student-style-select" class="clean-select">
              <option value="step_by_step_practical" ${currentStudentProfile.preferredStyle === 'step_by_step_practical' ? 'selected' : ''}>⚡ Passo a Passo Prático com Pseudocódigo</option>
              <option value="visual_analogies" ${currentStudentProfile.preferredStyle === 'visual_analogies' ? 'selected' : ''}>💡 Analogias Visuais e Modelos Mentais</option>
              <option value="rigorous_architectural" ${currentStudentProfile.preferredStyle === 'rigorous_architectural' ? 'selected' : ''}>🏛️ Rigor Técnico e Tipagem Estrita</option>
            </select>
          </div>

          <!-- Dificuldades / Pontos Cegos de Forma Limpa -->
          <div class="clean-form-group">
            <div class="clean-label-row">
              <label class="clean-label">Dificuldades / Pontos Cegos</label>
              <span class="clean-count-badge" id="blind-spots-count-badge">${currentStudentProfile.blindSpots.length} ativas</span>
            </div>
            
            <div id="blind-spots-list" class="clean-chips-container">
              ${renderBlindSpotsChipsHtml()}
            </div>

            <!-- Adicionar Ponto Cego via Dropdown Rápido OU Campo Texto -->
            <div class="clean-add-spot-box">
              <select id="preset-blind-spots-select" class="clean-select clean-select-compact">
                <option value="" disabled selected>+ Adicionar dificuldade comum...</option>
                ${PRESET_BLIND_SPOTS.map(spot => `<option value="${escapeHtml(spot)}">${escapeHtml(spot)}</option>`).join('')}
              </select>
              <div class="clean-custom-spot-row">
                <input id="add-blind-spot-input" type="text" class="clean-input clean-input-compact" placeholder="Ou digite outra dificuldade...">
                <button id="add-blind-spot-btn" type="button" class="clean-subtle-btn">+ Adicionar</button>
              </div>
            </div>
          </div>

          <!-- Dossiê XML Recolhido (Zero Poluição na Tela) -->
          <details class="clean-details-fold">
            <summary class="clean-details-summary">Inspecionar Dossiê enviado à IA (XML) ▾</summary>
            <div id="student-profile-preview" class="clean-details-content">
              <pre class="clean-preview-code">${escapeHtml(renderStudentProfilePreviewText())}</pre>
            </div>
          </details>
        </div>

        <!-- ABA 3: DIDÁTICA, PRESETS & MEMÓRIA -->
        <div id="modal-tab-pedagogy" class="modal-tab-panel" style="display: none;">
          <!-- Preset Pedagógico Rápido -->
          <div class="clean-form-group">
            <label class="clean-label" for="clean-pedagogical-preset-select">Preset Pedagógico Rápido</label>
            <select id="clean-pedagogical-preset-select" class="clean-select">
              <option value="mastery" selected>🎓 Socrático Profundo (Retenção e Indagações)</option>
              <option value="pair">⚡ Pair Ágil (Pseudocódigo e Desenvolvimento)</option>
              <option value="hardcore">🔥 Desafio Apex (Rigor Sênior e ZPD Máxima)</option>
              <option value="assisted">🛡️ Resgate Guiado (Apoio e Desbloqueio Suave)</option>
            </select>
          </div>

          <div class="clean-form-group">
            <label class="clean-label" for="modal-pedagogical-mode">Modo Pedagógico</label>
            <select id="modal-pedagogical-mode" class="clean-select">
              <option value="socratic-strict" selected>🧭 Socrático (Indagações maiêuticas sem dar código)</option>
              <option value="zpd-adaptive">🎯 ZPD Adaptativo (Ajuste dinâmico à autonomia)</option>
              <option value="practical-mentor">⚡ Mentor Prático (Dicas rápidas e objetivas)</option>
              <option value="deep-conceptual">💡 Conceitual (Modelos mentais e arquitetura)</option>
            </select>
          </div>

          <!-- Toggles Minimalistas -->
          <div class="clean-toggle-card">
            <div class="clean-toggle-info">
              <strong>Trava de Atrito Produtivo</strong>
              <span>Estimula reflexão prévia antes de liberar código pronto.</span>
            </div>
            <label class="clean-switch">
              <input id="modal-productive-friction" type="checkbox" checked>
              <span class="clean-switch-track"></span>
            </label>
          </div>

          <div class="clean-toggle-card">
            <div class="clean-toggle-info">
              <strong>Auto-gerar Notas no Obsidian</strong>
              <span>Salva sínteses automaticamente em docs/aprendizado/</span>
            </div>
            <label class="clean-switch">
              <input id="modal-auto-notes" type="checkbox" checked>
              <span class="clean-switch-track"></span>
            </label>
          </div>

          <div class="clean-sync-row">
            <button id="modal-force-sync-btn" type="button" class="clean-subtle-btn">
              <span>🔄 Sincronizar Memória & Grafo Agora</span>
            </button>
          </div>
        </div>

      </div>

      <!-- Rodapé Minimalista -->
      <div class="modal-clean-footer">
        <button id="modal-cancel-btn" type="button" class="clean-btn-ghost">Cancelar</button>
        <button id="modal-save-btn" type="button" class="clean-btn-primary">Salvar</button>
      </div>

    </div>
  </div>
  `;
}

function renderMiniTachometerHudHtml(): string {
  const score = currentMasteryScore;
  const clamped = Math.max(0, Math.min(100, score));

  let stageLabel = 'Novato';
  let badgeColor = '#38bdf8';
  if (clamped >= 86) {
    stageLabel = 'Mestre';
    badgeColor = '#a78bfa';
  } else if (clamped >= 56) {
    stageLabel = 'Proficiente';
    badgeColor = '#34d399';
  } else if (clamped >= 26) {
    stageLabel = 'Praticante';
    badgeColor = '#fbbf24';
  }

  return `
    <div id="header-tachometer-hud" class="header-zen-hud" title="Autonomia Cognitiva: ${clamped}% (${stageLabel})">
      <span class="zen-hud-icon">🧠</span>
      <span id="hud-score-val" class="zen-hud-score">${clamped}%</span>
      <span id="hud-gear-val" class="zen-hud-stage" style="color: ${badgeColor}; border-color: ${badgeColor};">${stageLabel}</span>
    </div>
  `;
}

function renderSpeedometerContentHtml(): string {
  const score = currentMasteryScore;
  const clamped = Math.max(0, Math.min(100, score));

  let stageLabel = 'Novato';
  let stageColor = '#38bdf8';

  if (clamped >= 86) {
    stageLabel = 'Mestre';
    stageColor = '#a78bfa';
  } else if (clamped >= 56) {
    stageLabel = 'Proficiente';
    stageColor = '#34d399';
  } else if (clamped >= 26) {
    stageLabel = 'Praticante';
    stageColor = '#fbbf24';
  }

  return `
    <div class="zen-mastery-container">
      <div class="zen-mastery-header">
        <div class="zen-mastery-left">
          <span class="zen-brain-dot" style="background-color: ${stageColor};"></span>
          <span class="zen-mastery-title">Autonomia Cognitiva</span>
        </div>
        <div class="zen-mastery-right">
          <span id="speedometer-stage-badge" class="zen-stage-label" style="color: ${stageColor};">${stageLabel}</span>
          <span class="zen-separator">•</span>
          <strong id="speedometer-score-num" class="zen-score-num">${clamped}%</strong>
        </div>
      </div>
      <div class="zen-progress-track">
        <div id="gauge-fill-arc" class="zen-progress-bar" style="width: ${clamped}%; background: linear-gradient(90deg, #38bdf8, ${stageColor});"></div>
      </div>
    </div>
  `;
}

function renderByteMascotSvg(size = 48, mood: 'happy' | 'thinking' | 'wink' | 'celebrating' = 'happy'): string {
  let eyesSvg = '';
  let mouthSvg = '';
  let earsSvg = '';
  let sparklesSvg = '';

  // Blush anime suave nas bochechas
  const animeBlush = `
    <ellipse cx="27" cy="40" rx="3.5" ry="1.8" fill="#fb7185" opacity="0.32" />
    <ellipse cx="53" cy="40" rx="3.5" ry="1.8" fill="#fb7185" opacity="0.32" />
  `;

  // Tufos de pelagem macia anime no interior das orelhas
  const earTufts = `
    <path d="M23 20 L27 16 L25 24 Z" fill="#94a3b8" opacity="0.6" />
    <path d="M57 20 L53 16 L55 24 Z" fill="#94a3b8" opacity="0.6" />
  `;

  switch (mood) {
    case 'thinking':
      earsSvg = `
        <path d="M25 28 L19 8 C19 7 22 7 25 11 L34 21 Z" fill="url(#catFur)" stroke="rgba(255, 255, 255, 0.16)" stroke-width="1.2" stroke-linejoin="round" />
        <path d="M24 24 L21 12 L29 19 Z" fill="#334155" />
        <path d="M55 30 L65 14 C65 13 62 13 59 16 L46 24 Z" fill="url(#catFur)" stroke="rgba(255, 255, 255, 0.16)" stroke-width="1.2" stroke-linejoin="round" />
        <path d="M55 26 L62 17 L51 23 Z" fill="#334155" />
        ${earTufts}
      `;
      // Olho anime inquisitivo: um olho grande atento e o outro semicerrado pensativo
      eyesSvg = `
        <!-- Olho Esquerdo Anime Curioso -->
        <ellipse cx="32" cy="34" rx="4.5" ry="5.8" fill="#090d16" stroke="rgba(255, 255, 255, 0.2)" stroke-width="0.8" />
        <circle cx="33.5" cy="32" r="1.8" fill="#ffffff" />
        <circle cx="31" cy="36.5" r="0.9" fill="#94a3b8" opacity="0.85" />
        <!-- Olho Direito Anime Analítico -->
        <path d="M44 35 C46 32 50 32 53 35" stroke="#cbd5e1" stroke-width="2.2" stroke-linecap="round" />
        <circle cx="48" cy="38" r="1.2" fill="#38bdf8" opacity="0.7" />
        <!-- Sobrancelha Anime Questionadora -->
        <path d="M28 26 C31 24 35 25 36 27" stroke="#94a3b8" stroke-width="1.2" stroke-linecap="round" />
      `;
      mouthSvg = `
        <path class="cat-mouth" d="M38 43 C39.5 44.5 41.5 44.5 43 43" stroke="#cbd5e1" stroke-width="1.5" stroke-linecap="round" fill="none" />
      `;
      sparklesSvg = `
        <!-- Balão de Ideia / Ponto de Luz Anime -->
        <circle cx="62" cy="18" r="1.5" fill="#38bdf8" opacity="0.8" />
        <circle cx="66" cy="13" r="2.2" fill="#38bdf8" />
      `;
      break;

    case 'wink':
      earsSvg = `
        <path d="M25 28 L19 8 C19 7 22 7 25 11 L34 21 Z" fill="url(#catFur)" stroke="rgba(255, 255, 255, 0.16)" stroke-width="1.2" stroke-linejoin="round" />
        <path d="M24 24 L21 12 L29 19 Z" fill="#334155" />
        <path d="M55 28 L61 8 C61 7 58 7 55 11 L46 21 Z" fill="url(#catFur)" stroke="rgba(255, 255, 255, 0.16)" stroke-width="1.2" stroke-linejoin="round" />
        <path d="M56 24 L58 12 L50 19 Z" fill="#334155" />
        ${earTufts}
      `;
      // Olho esquerdo piscando com estrelinha anime e olho direito reluzente
      eyesSvg = `
        <!-- Olho Esquerdo Anime Piscando (^_-) -->
        <path d="M27 35 C29 32 34 32 36 35" stroke="#f8fafc" stroke-width="2.4" stroke-linecap="round" />
        <!-- Estrelinha Anime de Piscar -->
        <path d="M24 33 L25 31 L26 33 L28 34 L26 35 L25 37 L24 35 L22 34 Z" fill="#38bdf8" />
        <!-- Olho Direito Anime Aberto com Brilho Duplo -->
        <ellipse cx="48" cy="34" rx="4.5" ry="5.8" fill="#090d16" stroke="rgba(255, 255, 255, 0.2)" stroke-width="0.8" />
        <circle cx="49.5" cy="32" r="1.8" fill="#ffffff" />
        <circle cx="47" cy="36.5" r="0.9" fill="#94a3b8" opacity="0.85" />
      `;
      mouthSvg = `
        <!-- Boquinha Anime Feliz Aberta Lateral -->
        <path class="cat-mouth" d="M37 42 C38.5 45 42 45 44 42" stroke="#f8fafc" stroke-width="1.6" stroke-linecap="round" fill="none" />
      `;
      sparklesSvg = `
        <polygon points="61,22 63,25 66,25 64,27 65,30 62,28 59,30 60,27 58,25 61,25" fill="#fbbf24" opacity="0.85" transform="scale(0.6) translate(35, 10)" />
      `;
      break;

    case 'celebrating':
      earsSvg = `
        <path d="M25 27 L18 7 C18 6 21 6 24 10 L34 20 Z" fill="url(#catFur)" stroke="rgba(255, 255, 255, 0.16)" stroke-width="1.2" stroke-linejoin="round" />
        <path d="M24 23 L20 11 L29 18 Z" fill="#334155" />
        <path d="M55 27 L62 7 C62 6 59 6 56 10 L46 20 Z" fill="url(#catFur)" stroke="rgba(255, 255, 255, 0.16)" stroke-width="1.2" stroke-linejoin="round" />
        <path d="M56 23 L60 11 L51 18 Z" fill="#334155" />
        ${earTufts}
      `;
      // Olhinhos fechados em arco de alegria anime (≧◡≦)
      eyesSvg = `
        <path d="M27 35 C29 30 34 30 36 35" stroke="#f8fafc" stroke-width="2.6" stroke-linecap="round" />
        <path d="M44 35 C46 30 51 30 53 35" stroke="#f8fafc" stroke-width="2.6" stroke-linecap="round" />
      `;
      mouthSvg = `
        <!-- Boquinha Aberta Comemorando Anime -->
        <path class="cat-mouth" d="M37 41 C38 46 42 46 43 41 Z" fill="#334155" stroke="#f8fafc" stroke-width="1.4" />
      `;
      sparklesSvg = `
        <!-- Estrelas e Brilhos Anime Radiantes -->
        <circle cx="16" cy="18" r="1.5" fill="#38bdf8" />
        <circle cx="64" cy="18" r="1.5" fill="#34d399" />
        <path d="M14 12 L15 10 L16 12 L18 13 L16 14 L15 16 L14 14 L12 13 Z" fill="#fbbf24" />
        <path d="M66 12 L67 10 L68 12 L70 13 L68 14 L67 16 L66 14 L64 13 Z" fill="#38bdf8" />
      `;
      break;

    case 'happy':
    default:
      earsSvg = `
        <path d="M25 28 L19 8 C19 7 22 7 25 11 L34 21 Z" fill="url(#catFur)" stroke="rgba(255, 255, 255, 0.16)" stroke-width="1.2" stroke-linejoin="round" />
        <path d="M24 24 L21 12 L29 19 Z" fill="#334155" />
        <path d="M55 28 L61 8 C61 7 58 7 55 11 L46 21 Z" fill="url(#catFur)" stroke="rgba(255, 255, 255, 0.16)" stroke-width="1.2" stroke-linejoin="round" />
        <path d="M56 24 L58 12 L50 19 Z" fill="#334155" />
        ${earTufts}
      `;
      // Olhos Anime Grandes Kawaii com Brilho Duplo Reluzente
      eyesSvg = `
        <!-- Olho Esquerdo Anime -->
        <ellipse cx="32" cy="34" rx="4.5" ry="5.8" fill="#090d16" stroke="rgba(255, 255, 255, 0.2)" stroke-width="0.8" />
        <circle cx="33.5" cy="32" r="1.8" fill="#ffffff" />
        <circle cx="31" cy="36.5" r="0.9" fill="#94a3b8" opacity="0.85" />
        <!-- Olho Direito Anime -->
        <ellipse cx="48" cy="34" rx="4.5" ry="5.8" fill="#090d16" stroke="rgba(255, 255, 255, 0.2)" stroke-width="0.8" />
        <circle cx="49.5" cy="32" r="1.8" fill="#ffffff" />
        <circle cx="47" cy="36.5" r="0.9" fill="#94a3b8" opacity="0.85" />
      `;
      mouthSvg = `
        <!-- Boquinha de Gato Anime Kawaii (ω) -->
        <path class="cat-mouth" d="M35 42 C37 44.5 39.5 44 40 42 C40.5 44 43 44.5 45 42" stroke="#cbd5e1" stroke-width="1.5" stroke-linecap="round" fill="none" />
      `;
      break;
  }

  const height = Math.round(size * 1.15);

  return `
    <svg class="byte-mascot-svg cat-mascot cat-fullbody mood-${mood}" viewBox="0 0 80 92" width="${size}" height="${height}" fill="none">
      <!-- Cauda Felina em Repouso Curvado -->
      <path class="cat-tail" d="M24 76 C12 76 8 66 12 54 C14 46 10 42 8 43" stroke="#475569" stroke-width="3.2" stroke-linecap="round" fill="none" />
      <!-- Perninhas Traseiras Chibi -->
      <ellipse cx="22" cy="74" rx="9" ry="11" fill="url(#catFurDark)" stroke="rgba(255, 255, 255, 0.08)" stroke-width="1" />
      <ellipse cx="58" cy="74" rx="9" ry="11" fill="url(#catFurDark)" stroke="rgba(255, 255, 255, 0.08)" stroke-width="1" />
      <path d="M14 84 C14 80 23 80 24 84 Z" fill="#1e293b" stroke="rgba(255, 255, 255, 0.12)" stroke-width="1" />
      <path d="M56 84 C57 80 66 80 66 84 Z" fill="#1e293b" stroke="rgba(255, 255, 255, 0.12)" stroke-width="1" />
      <!-- Tronco Chibi Elegante em Ardósia -->
      <path d="M28 47 C24 59 25 74 26 83 C34 84 46 84 54 83 C55 74 56 59 52 47 Z" fill="url(#catFur)" stroke="rgba(255, 255, 255, 0.14)" stroke-width="1.2" />
      <!-- Peito Felino Mais Claro -->
      <path d="M35 48 C33 56 36 67 40 72 C44 67 47 56 45 48 Z" fill="#334155" opacity="0.4" />
      <!-- Patinhas Dianteiras Apoiadas -->
      <path d="M31 56 L31 82 C31 84 37 84 37 82 L37 56 Z" fill="url(#catFur)" stroke="rgba(255, 255, 255, 0.14)" stroke-width="1" />
      <line x1="33" y1="79" x2="33" y2="82" stroke="rgba(255, 255, 255, 0.2)" stroke-width="0.9" />
      <line x1="35" y1="79" x2="35" y2="82" stroke="rgba(255, 255, 255, 0.2)" stroke-width="0.9" />
      <path d="M43 56 L43 82 C43 84 49 84 49 82 L49 56 Z" fill="url(#catFur)" stroke="rgba(255, 255, 255, 0.14)" stroke-width="1" />
      <line x1="45" y1="79" x2="45" y2="82" stroke="rgba(255, 255, 255, 0.2)" stroke-width="0.9" />
      <line x1="47" y1="79" x2="47" y2="82" stroke="rgba(255, 255, 255, 0.2)" stroke-width="0.9" />
      <!-- Orelhas com Detalhes Anime -->
      ${earsSvg}
      <!-- Cabeça Redondinha Chibi Anime -->
      <path d="M22 33 C20 44 28 51 40 51 C52 51 60 44 58 33 C58 22 50 18 40 18 C30 18 22 22 22 33 Z" fill="url(#catFur)" stroke="rgba(255, 255, 255, 0.16)" stroke-width="1.2" />
      <!-- Bigodinhos Felinos Delicados -->
      <path d="M16 35 L25 36" stroke="#64748b" stroke-width="1" stroke-linecap="round" opacity="0.5" />
      <path d="M17 40 L26 39" stroke="#64748b" stroke-width="1" stroke-linecap="round" opacity="0.5" />
      <path d="M64 35 L55 36" stroke="#64748b" stroke-width="1" stroke-linecap="round" opacity="0.5" />
      <path d="M63 40 L54 39" stroke="#64748b" stroke-width="1" stroke-linecap="round" opacity="0.5" />
      <!-- Blush Anime nas Bochechas -->
      ${animeBlush}
      <!-- Olhos Anime Expressivos -->
      ${eyesSvg}
      <!-- Focinho Delicado -->
      <polygon points="38.5,39.5 41.5,39.5 40,41" fill="#94a3b8" />
      <!-- Boquinha Anime -->
      ${mouthSvg}
      <!-- Coleira Tecnológica com Pingente de Código -->
      <path d="M28 49 Q40 53 52 49" stroke="#334155" stroke-width="1.8" stroke-linecap="round" />
      <circle cx="40" cy="53" r="2.8" fill="#475569" stroke="rgba(255, 255, 255, 0.2)" stroke-width="0.8" />
      <text x="40" y="54.2" font-size="3.2" text-anchor="middle" fill="#f8fafc" font-weight="800" font-family="monospace">&lt;&gt;</text>
      <!-- Brilhos / Efeitos Especiais de Expressão -->
      ${sparklesSvg}
      <!-- Gradientes Monocromáticos Elegantes -->
      <defs>
        <linearGradient id="catFur" x1="20" y1="10" x2="60" y2="85" gradientUnits="userSpaceOnUse">
          <stop stop-color="#1e293b" />
          <stop offset="100%" stop-color="#0f172a" />
        </linearGradient>
        <linearGradient id="catFurDark" x1="15" y1="60" x2="65" y2="85" gradientUnits="userSpaceOnUse">
          <stop stop-color="#182234" />
          <stop offset="100%" stop-color="#0b1120" />
        </linearGradient>
      </defs>
    </svg>
  `;
}

function getMascotGreeting(): { speech: string; partnershipLevel: string; partnershipTitle: string } {
  const rawName = currentStudentProfile.name ? currentStudentProfile.name.trim() : '';
  const firstName = rawName ? rawName.split(' ')[0] : 'dev';
  const goal = currentStudentProfile.currentGoal ? currentStudentProfile.currentGoal : 'programação';
  const score = currentMasteryScore;

  let partnershipLevel = 'Nível 1';
  let partnershipTitle = 'Primeiro Encontro';
  if (score >= 80) {
    partnershipLevel = 'Nível 4';
    partnershipTitle = 'Parceria Sênior';
  } else if (score >= 50) {
    partnershipLevel = 'Nível 3';
    partnershipTitle = 'Dupla Dinâmica';
  } else if (score >= 20) {
    partnershipLevel = 'Nível 2';
    partnershipTitle = 'Companheiro de Código';
  }

  const speeches = [
    `Miau, ${firstName}! Sou o Byte, seu gato tutor de programação. O que vamos codar juntos hoje? 🐾`,
    `Ronrom... Fala, ${firstName}! Bora avançar na sua meta de "${goal}"? Tô aqui do seu ladinho! 🐱`,
    `Miaau! Se pintar bug ou exceção bizarra, a gente caça ela juntos sem spoiler! 🐾`
  ];
  const speech = speeches[Math.floor(Math.random() * speeches.length)];

  return { speech, partnershipLevel, partnershipTitle };
}

function renderEmptyStateHtml(): string {
  const activeModule = pathwayModules.find((m) => m.id === activePathModuleId);
  const moduleTitle = activeModule ? activeModule.title : 'Lógica Assíncrona';
  const score = currentMasteryScore;
  let stageLabel = 'Novato';
  if (score >= 86) stageLabel = 'Mestre';
  else if (score >= 56) stageLabel = 'Proficiente';
  else if (score >= 26) stageLabel = 'Praticante';

  const { speech, partnershipLevel, partnershipTitle } = getMascotGreeting();

  return `
    <div class="minimal-empty-state">
      <!-- Mascote Gato Byte: Parceiro Felino de Pair Programming -->
      <div class="mascot-hero-card" id="mascot-interactive-hero" title="Clique no gatinho Byte para trocar uma ideia ou miado!">
        <div class="mascot-avatar-wrapper">
          ${renderByteMascotSvg(58, 'happy')}
          <span class="mascot-live-indicator" title="Gato Byte conectado e online"></span>
        </div>
        
        <div class="mascot-speech-bubble">
          <div class="mascot-header-row">
            <span class="mascot-name-tag">🐱 Byte • Seu Gato Tutor</span>
            <span class="mascot-affinity-pill">🤝 ${partnershipTitle}</span>
          </div>
          <p id="mascot-speech-text" class="mascot-speech-text">${escapeHtml(speech)}</p>
        </div>
      </div>

      <!-- Card Minimalista da Trilha de Foco Atual -->
      <div class="empty-pathway-card" id="empty-open-pathway-card" title="Abrir trilha e mapa mental de habilidades">
        <div class="empty-pathway-left">
          <span class="empty-pathway-icon">🎯</span>
          <div class="empty-pathway-info">
            <span class="empty-pathway-title">Foco Atual: <strong>${escapeHtml(moduleTitle)}</strong></span>
            <span class="empty-pathway-score">Autonomia: ${score}% • ${stageLabel}</span>
          </div>
        </div>
        <span class="empty-pathway-action">Ver Trilha →</span>
      </div>

      <!-- Chips de Conversa Rápida com o Byte (Estilo ChatGPT / Claude) -->
      <div class="starter-chips-container">
        <button class="starter-chip" data-starter="chat-hello">
          <span class="starter-chip-icon">🐾</span>
          <span>Fala, Byte! Como podemos codar juntos?</span>
        </button>
        <button class="starter-chip" data-starter="explain">
          <span class="starter-chip-icon">💡</span>
          <span>Explicar código selecionado</span>
        </button>
        <button class="starter-chip" data-starter="pair-chat">
          <span class="starter-chip-icon">🤝</span>
          <span>Bater papo sobre a arquitetura atual</span>
        </button>
        <button class="starter-chip" data-starter="socratic-step">
          <span class="starter-chip-icon">🧭</span>
          <span>Me dê uma pista para o próximo passo</span>
        </button>
        <button class="starter-chip" data-starter="terminal">
          <span class="starter-chip-icon">⚠️</span>
          <span>Depurar erro do terminal</span>
        </button>
      </div>
    </div>
  `;
}

function showCatTypingIndicator(customText?: string): void {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const emptyView = container.querySelector('.minimal-empty-state');
  if (emptyView) container.innerHTML = '';

  let typingRow = document.getElementById('cat-typing-row');
  if (!typingRow) {
    typingRow = document.createElement('div');
    typingRow.id = 'cat-typing-row';
    typingRow.className = 'message-row assistant cat-typing-row';
    typingRow.innerHTML = `
      <div class="assistant-message-content">
        <div class="assistant-meta">
          <div class="assistant-author-row">
            ${renderByteMascotSvg(22, 'thinking')}
            <strong class="assistant-name">Byte 🐱</strong>
            <span class="assistant-sublabel">Gato Tutor</span>
          </div>
        </div>
        <div class="cat-typing-indicator">
          <div class="cat-typing-dots">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </div>
          <span class="cat-typing-text">${customText || 'Byte está pensando na pista socrática... 🐾'}</span>
        </div>
      </div>
    `;
    container.appendChild(typingRow);
    scrollToBottom(container);
  } else {
    const textEl = typingRow.querySelector('.cat-typing-text');
    if (textEl && customText) {
      textEl.textContent = customText;
    }
  }
}

function removeCatTypingIndicator(): void {
  const typingRow = document.getElementById('cat-typing-row');
  if (typingRow) {
    typingRow.remove();
  }
}

function triggerCatSpeech(text: string, mood: 'happy' | 'thinking' | 'wink' | 'celebrating' = 'happy', _autoHideMs = 6000): void {
  // 1. Atualizar fala no Hero Card do Empty State se presente
  const speechEl = document.getElementById('mascot-speech-text');
  const heroCard = document.getElementById('mascot-interactive-hero');
  const avatarWrapper = heroCard?.querySelector('.mascot-avatar-wrapper');

  if (speechEl) {
    speechEl.textContent = text;
  }

  if (avatarWrapper) {
    avatarWrapper.innerHTML = `
      ${renderByteMascotSvg(58, mood)}
      <span class="mascot-live-indicator" title="Gato Byte conectado e online"></span>
    `;
    heroCard?.classList.add('mascot-bounced');
    setTimeout(() => heroCard?.classList.remove('mascot-bounced'), 450);
  }

  // 2. Se o gato estiver pensando antes de responder, ativa o indicador anime no chat
  if (mood === 'thinking') {
    showCatTypingIndicator(text);
  }
}

function hideCatSpeech(): void {
  removeCatTypingIndicator();
}

const CAT_DEV_QUOTES: string[] = [
  'Miau! Cada bug resolvido é um degrau a mais na sua jornada! 🐾',
  'Precisa de uma dica? Estou aqui para pensar junto com você, purr!',
  'Git não morde! Se errar, o git reflog salva o dia. Miau!',
  'Respire fundo. Vamos dar um passo de cada vez!',
  'Código limpo e mente tranquila! O que vamos aprender hoje? 🐾',
  'Miau! Lembre-se: errar faz parte de aprender a programar!'
];

function handleCatAvatarClick(): void {
  const quote = CAT_DEV_QUOTES[Math.floor(Math.random() * CAT_DEV_QUOTES.length)];
  const moods: Array<'happy' | 'wink' | 'celebrating'> = ['happy', 'wink', 'celebrating'];
  const mood = moods[Math.floor(Math.random() * moods.length)];
  triggerCatSpeech(quote, mood, 5500);
}

function renderVerticalMindmapHtml(): string {
  const completedModules = pathwayModules.filter((m) => m.status === 'completed').length;
  const totalModules = pathwayModules.length;

  const topicsHtml = pathwayModules.map((mod, index) => {
    const isCurrent = mod.id === activePathModuleId;
    const isCompleted = mod.status === 'completed';
    const isExpanded = expandedMindmapTopics.has(mod.id);

    let statusDot = '⚪';
    let statusClass = 'pending';
    let modPct = 0;

    if (isCompleted) {
      statusDot = '🟢';
      statusClass = 'completed';
      modPct = 100;
    } else if (isCurrent) {
      statusDot = '🟡';
      statusClass = 'active';
      modPct = currentMasteryScore;
    }

    let subtopicsListHtml = '';
    if (isExpanded && mod.subtopics && mod.subtopics.length > 0) {
      const subsHtml = mod.subtopics.map((sub) => {
        return `
          <div class="clean-subtopic-row ${sub.completed ? 'is-completed' : ''}" data-subtopic-id="${sub.id}">
            <span class="clean-sub-marker">${sub.completed ? '✓' : '•'}</span>
            <span class="clean-sub-name">${sub.title}</span>
            <button class="clean-sub-practice-btn" data-mindmap-module="${mod.id}" data-mindmap-subtopic="${sub.id}" title="Praticar no Chat">
              Praticar →
            </button>
          </div>
        `;
      }).join('');

      subtopicsListHtml = `
        <div class="clean-subtopics-branch">
          ${mod.summary ? `<p class="clean-branch-summary">${mod.summary}</p>` : ''}
          <div class="clean-subtopics-list">
            ${subsHtml}
          </div>
        </div>
      `;
    }

    return `
      <div class="clean-tree-node ${isCurrent ? 'is-current' : ''} ${isCompleted ? 'is-completed' : ''}" data-topic-id="${mod.id}">
        <div class="clean-node-header" data-action="toggle-mindmap-topic" data-topic-id="${mod.id}">
          <div class="clean-node-left">
            <span class="clean-node-status-dot ${statusClass}">${statusDot}</span>
            <span class="clean-node-title">${index + 1}. ${mod.title}</span>
          </div>
          <div class="clean-node-right">
            <span class="clean-node-pct">${modPct}%</span>
            <span class="clean-node-caret">${isExpanded ? '▾' : '▸'}</span>
          </div>
        </div>
        ${subtopicsListHtml}
      </div>
    `;
  }).join('');

  return `
    <div class="clean-roadmap-view">
      <div class="clean-roadmap-header">
        <div class="clean-header-meta">
          <span class="clean-header-icon">🗺️</span>
          <strong>Trilha de Aprendizado</strong>
        </div>
        <span class="clean-header-badge">${completedModules}/${totalModules} Dominados</span>
      </div>

      <div class="clean-tree-stack">
        ${topicsHtml}
      </div>
    </div>
  `;
}

function refreshMindmapUI(): void {
  const container = document.getElementById('mindmap-canvas-container');
  if (container) {
    container.innerHTML = renderVerticalMindmapHtml();
  }
  updateMindmapTabBadge();
}

function refreshPathwayUI(): void {
  refreshMindmapUI();
}

function updateMindmapTabBadge(): void {
  const activeModule = pathwayModules.find((m) => m.id === activePathModuleId);
  const badgeEl = document.getElementById('nav-mindmap-active-badge');
  if (badgeEl && activeModule) {
    const short = activeModule.title.split('&')[0].trim().split(' ')[0];
    badgeEl.textContent = `Foco: ${short}`;
  }
}

function toggleMindmapTopic(topicId: string): void {
  if (expandedMindmapTopics.has(topicId)) {
    expandedMindmapTopics.delete(topicId);
  } else {
    expandedMindmapTopics.add(topicId);
  }
  refreshMindmapUI();
}

function expandAllMindmap(): void {
  pathwayModules.forEach((m) => expandedMindmapTopics.add(m.id));
  refreshMindmapUI();
  showNotificationToast('⊞ Todos os ramos do mapa mental foram abertos.');
}

function collapseAllMindmap(): void {
  expandedMindmapTopics.clear();
  refreshMindmapUI();
  showNotificationToast('⊟ Ramos do mapa mental recolhidos.');
}

function switchMainAppTab(tab: 'chat' | 'mindmap'): void {
  activeMainTab = tab;
  const navBtns = rootElement?.querySelectorAll<HTMLButtonElement>('.app-nav-tab-btn');
  navBtns?.forEach((b) => {
    if (b.getAttribute('data-tab') === tab) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });

  const chatContainer = document.getElementById('view-chat-container');
  const mindmapContainer = document.getElementById('view-mindmap-container');

  if (tab === 'chat') {
    chatContainer?.classList.remove('hidden');
    mindmapContainer?.classList.add('hidden');
  } else {
    chatContainer?.classList.add('hidden');
    mindmapContainer?.classList.remove('hidden');
    refreshMindmapUI();
  }
}

function updateHeaderPathwayPill(): void {
  const activeModule = pathwayModules.find((m) => m.id === activePathModuleId);
  const modShortTitle = activeModule ? activeModule.title.split(' ')[0] : 'Trilha';
  const labelEl = document.getElementById('header-pathway-label');
  if (labelEl) {
    labelEl.textContent = `${modShortTitle} • ${currentMasteryScore}%`;
  }
}

function openPathwayDrawer(): void {
  const drawer = document.getElementById('pathway-drawer');
  if (!drawer) return;
  drawer.classList.remove('hidden');
  isPathwayDrawerOpen = true;
}

function closePathwayDrawer(): void {
  const drawer = document.getElementById('pathway-drawer');
  if (!drawer) return;
  drawer.classList.add('hidden');
  isPathwayDrawerOpen = false;
}

function togglePathwayDrawer(): void {
  if (isPathwayDrawerOpen) {
    closePathwayDrawer();
  } else {
    openPathwayDrawer();
  }
}

function closeAllPopovers(): void {
  closeModelPopover();
  closeLevelPopover();
  closeToolsPopover();
}

function toggleLevelPopover(): void {
  if (isLevelPopoverOpen) {
    closeLevelPopover();
  } else {
    closeAllPopovers();
    openLevelPopover();
  }
}

function openLevelPopover(): void {
  const popover = document.getElementById('level-quick-popover');
  popover?.classList.remove('hidden');
  isLevelPopoverOpen = true;
}

function closeLevelPopover(): void {
  const popover = document.getElementById('level-quick-popover');
  popover?.classList.add('hidden');
  isLevelPopoverOpen = false;
}

function toggleToolsPopover(): void {
  if (isToolsPopoverOpen) {
    closeToolsPopover();
  } else {
    closeAllPopovers();
    openToolsPopover();
  }
}

function openToolsPopover(): void {
  const popover = document.getElementById('tools-quick-popover');
  popover?.classList.remove('hidden');
  isToolsPopoverOpen = true;
}

function closeToolsPopover(): void {
  const popover = document.getElementById('tools-quick-popover');
  popover?.classList.add('hidden');
  isToolsPopoverOpen = false;
}

function setupEventListeners(): void {
  if (!rootElement) return;

  // Botão Switch de Ligar / Desligar Ergonômico no Topo
  const powerBtn = document.getElementById('power-switch-btn');
  powerBtn?.addEventListener('click', togglePower);

  const resumeBtn = document.getElementById('resume-power-btn');
  resumeBtn?.addEventListener('click', () => setPowerState(true));

  // Alternância das Abas Principais (Chat Socrático / Mapa Mental)
  const navTabBtns = rootElement.querySelectorAll<HTMLButtonElement>('.app-nav-tab-btn');
  navTabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab') as 'chat' | 'mindmap';
      if (tab) {
        switchMainAppTab(tab);
      }
    });
  });

  // Mini-HUD do Tacômetro no Header (clicar foca no cockpit do chat)
  const hudEl = document.getElementById('header-tachometer-hud');
  hudEl?.addEventListener('click', () => {
    if (activeMainTab !== 'chat') {
      switchMainAppTab('chat');
    }
    const cockpitWrapper = document.getElementById('cockpit-gauge-wrapper');
    const toggleBtn = document.getElementById('toggle-cockpit-btn');
    if (cockpitWrapper && isCockpitGaugeCollapsed) {
      isCockpitGaugeCollapsed = false;
      cockpitWrapper.classList.remove('collapsed');
      if (toggleBtn) toggleBtn.innerHTML = '<span>Ocultar Tacômetro ▴</span>';
    }
  });

  // Toggle do mostrador de telemetria no topo do chat
  const toggleCockpitBtn = document.getElementById('toggle-cockpit-btn');
  toggleCockpitBtn?.addEventListener('click', () => {
    isCockpitGaugeCollapsed = !isCockpitGaugeCollapsed;
    const cockpitWrapper = document.getElementById('cockpit-gauge-wrapper');
    if (cockpitWrapper) {
      if (isCockpitGaugeCollapsed) {
        cockpitWrapper.classList.add('collapsed');
        if (toggleCockpitBtn) toggleCockpitBtn.innerHTML = '<span>Mostrar Tacômetro ▾</span>';
      } else {
        cockpitWrapper.classList.remove('collapsed');
        if (toggleCockpitBtn) toggleCockpitBtn.innerHTML = '<span>Ocultar Tacômetro ▴</span>';
      }
    }
  });

  // Toolbar do Mapa Mental (Expandir Tudo / Recolher Tudo / Sincronizar)
  document.getElementById('mindmap-expand-all-btn')?.addEventListener('click', expandAllMindmap);
  document.getElementById('mindmap-collapse-all-btn')?.addEventListener('click', collapseAllMindmap);
  document.getElementById('mindmap-sync-btn')?.addEventListener('click', triggerServerSync);

  // Delegação de eventos no Canvas do Mapa Mental
  const mindmapContainer = document.getElementById('mindmap-canvas-container');
  mindmapContainer?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    // Botão de Praticar Desafio do Subtópico no Chat
    const trainBtn = target.closest<HTMLButtonElement>('[data-mindmap-subtopic]');
    if (trainBtn) {
      const modId = trainBtn.getAttribute('data-mindmap-module') || activePathModuleId;
      const subId = trainBtn.getAttribute('data-mindmap-subtopic');
      activePathModuleId = modId;
      switchMainAppTab('chat');
      vscode.postMessage({
        type: 'startPathChallenge',
        moduleId: modId,
        subtopicId: subId || undefined
      });
      showNotificationToast('⚡ Desafio do mapa mental carregado no chat!');
      return;
    }

    // Toggle de Nós do Mapa Mental (vai abrindo ramos)
    const toggleTopic = target.closest<HTMLElement>('[data-action="toggle-mindmap-topic"]');
    if (toggleTopic) {
      const topicId = toggleTopic.getAttribute('data-topic-id');
      if (topicId) {
        toggleMindmapTopic(topicId);
      }
      return;
    }
  });

  // Botões do Composer (Modelo, Nível Socrático e Ações Rápidas)
  const composerModelBtn = document.getElementById('composer-model-btn');
  composerModelBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isPopoverOpen) {
      closeModelPopover();
    } else {
      closeAllPopovers();
      openModelPopover();
    }
  });

  const composerLevelBtn = document.getElementById('composer-level-btn');
  composerLevelBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleLevelPopover();
  });

  const composerToolsBtn = document.getElementById('composer-tools-btn');
  composerToolsBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleToolsPopover();
  });

  // Ações dentro do Popover de Nível Socrático
  const levelPopoverItems = rootElement.querySelectorAll<HTMLButtonElement>('[data-popover-level]');
  levelPopoverItems.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const level = parseInt(btn.getAttribute('data-popover-level') || '1', 10) as HintLevel;
      setHintLevel(level);
      closeLevelPopover();

      vscode.postMessage({
        type: 'requestHint',
        level,
        context: currentEditorContext
      });
      showNotificationToast(`💡 Nível alterado: ${level}. ${LEVEL_METAS[level].title}`);
    });
  });

  // Ações dentro do Popover de Ferramentas
  document.getElementById('tool-action-hint')?.addEventListener('click', () => {
    closeToolsPopover();
    vscode.postMessage({ type: 'requestHint', level: selectedHintLevel, context: currentEditorContext });
  });

  document.getElementById('tool-action-terminal')?.addEventListener('click', () => {
    closeToolsPopover();
    vscode.postMessage({ type: 'explainTerminalError' });
  });

  document.getElementById('tool-action-note')?.addEventListener('click', () => {
    closeToolsPopover();
    vscode.postMessage({ type: 'generateStudyNote', context: currentEditorContext });
  });

  document.getElementById('tool-action-bypass')?.addEventListener('click', () => {
    closeToolsPopover();
    vscode.postMessage({ type: 'emergencyBypass', reason: 'Acionado pelo menu de ações' });
  });

  // Botão Flutuante Continuar
  const floatingContinueBtn = document.getElementById('floating-continue-btn');
  floatingContinueBtn?.addEventListener('click', () => {
    showFloatingContinue(false);
    vscode.postMessage({ type: 'continueResponse' });
  });

  // Botões de abertura do modal completo
  const settingsBtn = document.getElementById('settings-btn');
  settingsBtn?.addEventListener('click', () => openProviderModal());

  const popoverConfigureBtn = document.getElementById('popover-configure-btn');
  popoverConfigureBtn?.addEventListener('click', () => {
    closeModelPopover();
    openProviderModal();
  });

  // Fechar modal
  document.getElementById('modal-close-btn')?.addEventListener('click', closeProviderModal);
  document.getElementById('modal-cancel-btn')?.addEventListener('click', closeProviderModal);

  // Clique na pílula do cabeçalho abre direto a aba do perfil do aluno
  document.getElementById('header-student-profile-pill')?.addEventListener('click', () => {
    openProviderModal('student');
  });

  // Segmented control das 3 abas minimalistas do modal (.modal-seg-tab-btn)
  const modalSegTabs = rootElement.querySelectorAll<HTMLButtonElement>('.modal-seg-tab-btn, .modal-nav-item');
  modalSegTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabId = (tab.getAttribute('data-modal-tab') || tab.getAttribute('data-tab')) as 'connection' | 'student' | 'pedagogy';
      if (tabId) {
        switchModalTab(tabId);
      }
    });
  });

  // Alternar Provedor pelas pílulas limpas (.provider-pill-btn)
  const providerPillBtns = rootElement.querySelectorAll<HTMLButtonElement>('.provider-pill-btn, .provider-tab-btn');
  providerPillBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const prov = btn.getAttribute('data-provider') as LLMProviderType;
      if (prov) {
        switchModalProvider(prov);
      }
    });
  });

  // Preset Pedagógico Rápido via Select Minimalista
  const cleanPresetSelect = document.getElementById('clean-pedagogical-preset-select') as HTMLSelectElement | null;
  cleanPresetSelect?.addEventListener('change', () => {
    const val = cleanPresetSelect.value as 'mastery' | 'pair' | 'hardcore' | 'assisted';
    if (val) {
      applyPedagogicalPreset(val);
    }
  });

  // Adicionar Ponto Cego via Dropdown Rápido (#preset-blind-spots-select)
  const presetBlindSpotsSelect = document.getElementById('preset-blind-spots-select') as HTMLSelectElement | null;
  presetBlindSpotsSelect?.addEventListener('change', () => {
    const val = presetBlindSpotsSelect.value;
    if (val) {
      if (!currentStudentProfile.blindSpots.includes(val)) {
        currentStudentProfile.blindSpots.push(val);
        updateStudentProfileUI();
        showNotificationToast(`🎯 Ponto cego adicionado: "${val}"`);
      } else {
        showNotificationToast(`ℹ️ "${val}" já está cadastrado.`);
      }
      presetBlindSpotsSelect.selectedIndex = 0;
    }
  });

  // Testador de Latência Minimalista
  document.getElementById('test-latency-btn')?.addEventListener('click', testConnectionLatency);

  // Forçar Sincronização do Grafo de Memória no Modal
  document.getElementById('modal-force-sync-btn')?.addEventListener('click', triggerServerSync);

  // Eventos dentro do painel do perfil do aluno no modal
  const studentPanel = document.getElementById('modal-tab-student');
  studentPanel?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    // Segmented button de nível
    const segBtn = target.closest<HTMLButtonElement>('.level-seg-btn');
    if (segBtn) {
      const level = segBtn.getAttribute('data-level') as StudentExperienceLevel;
      if (level) {
        currentStudentProfile.experienceLevel = level;
        updateStudentProfileUI();
      }
      return;
    }

    // Botão de remover ponto cego
    const removeBtn = target.closest<HTMLButtonElement>('[data-remove-blind-spot]');
    if (removeBtn) {
      const idxStr = removeBtn.getAttribute('data-remove-blind-spot');
      if (idxStr !== null) {
        const idx = parseInt(idxStr, 10);
        if (!isNaN(idx) && idx >= 0 && idx < currentStudentProfile.blindSpots.length) {
          currentStudentProfile.blindSpots.splice(idx, 1);
          updateStudentProfileUI();
        }
      }
      return;
    }

    // Botão de adicionar ponto cego
    if (target.id === 'add-blind-spot-btn') {
      handleAddBlindSpotClick();
      return;
    }
  });

  // Enter no input de ponto cego
  const addBlindSpotInput = document.getElementById('add-blind-spot-input') as HTMLInputElement | null;
  addBlindSpotInput?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddBlindSpotClick();
    }
  });

  // Mudanças nos inputs de texto atualizam o preview em tempo real
  const studentGoalInput = document.getElementById('student-goal-input') as HTMLInputElement | null;
  studentGoalInput?.addEventListener('input', () => {
    if (studentGoalInput) {
      currentStudentProfile.currentGoal = studentGoalInput.value;
      const previewEl = document.getElementById('student-profile-preview');
      if (previewEl) {
        previewEl.innerHTML = `<pre class="student-profile-code">${escapeHtml(renderStudentProfilePreviewText())}</pre>`;
      }
    }
  });

  const studentNameInput = document.getElementById('student-name-input') as HTMLInputElement | null;
  studentNameInput?.addEventListener('input', () => {
    if (studentNameInput) {
      currentStudentProfile.name = studentNameInput.value;
      const previewEl = document.getElementById('student-profile-preview');
      if (previewEl) {
        previewEl.innerHTML = `<pre class="student-profile-code">${escapeHtml(renderStudentProfilePreviewText())}</pre>`;
      }
    }
  });

  const studentStyleSelect = document.getElementById('student-style-select') as HTMLSelectElement | null;
  studentStyleSelect?.addEventListener('change', () => {
    if (studentStyleSelect) {
      currentStudentProfile.preferredStyle = studentStyleSelect.value as StudentCognitiveStyle;
      const previewEl = document.getElementById('student-profile-preview');
      if (previewEl) {
        previewEl.innerHTML = `<pre class="student-profile-code">${escapeHtml(renderStudentProfilePreviewText())}</pre>`;
      }
    }
  });

  // Slider de Temperatura com indicador numérico em tempo real
  const tempSlider = document.getElementById('modal-temperature') as HTMLInputElement | null;
  const tempBadge = document.getElementById('modal-temp-badge');
  tempSlider?.addEventListener('input', () => {
    if (tempBadge && tempSlider) {
      tempBadge.textContent = tempSlider.value;
    }
  });

  // Slider de Top-P com indicador numérico em tempo real
  const topPSlider = document.getElementById('modal-top-p') as HTMLInputElement | null;
  const topPBadge = document.getElementById('modal-top-p-badge');
  topPSlider?.addEventListener('input', () => {
    if (topPBadge && topPSlider) {
      topPBadge.textContent = topPSlider.value;
    }
  });

  // Tabs de Provedor no Modal
  const providerTabs = rootElement.querySelectorAll<HTMLButtonElement>('.provider-tab-btn');
  providerTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const provider = tab.getAttribute('data-provider') as LLMProviderType;
      switchModalProvider(provider);
    });
  });

  // Alternar visibilidade da API Key
  const toggleKeyBtn = document.getElementById('toggle-key-visibility');
  const apiKeyInput = document.getElementById('modal-api-key') as HTMLInputElement | null;
  toggleKeyBtn?.addEventListener('click', () => {
    modalApiKeyVisible = !modalApiKeyVisible;
    if (apiKeyInput) {
      apiKeyInput.type = modalApiKeyVisible ? 'text' : 'password';
    }
  });

  // Botão Buscar Modelos Disponíveis
  document.getElementById('fetch-models-btn')?.addEventListener('click', handleFetchModelsClick);

  // Botão Salvar e Conectar
  document.getElementById('modal-save-btn')?.addEventListener('click', handleSaveProviderConfig);

  // Limpar conversa
  document.getElementById('clear-chat-btn')?.addEventListener('click', () => {
    showFloatingContinue(false);
    vscode.postMessage({ type: 'clearHistory' });
  });

  // Envio de mensagem pelo composer
  const textarea = document.getElementById('user-input') as HTMLTextAreaElement | null;
  const sendBtn = document.getElementById('send-btn') as HTMLButtonElement | null;

  function updateSendButtonState(): void {
    if (!textarea || !sendBtn) return;
    const hasText = textarea.value.trim().length > 0;
    sendBtn.disabled = !hasText;
  }

  function handleSend(): void {
    if (!textarea) return;
    const text = textarea.value.trim();
    if (!text) return;

    showFloatingContinue(false);

    // Suporte aos comandos slash pedagógicos diretos no chat
    if (/^\/(conceito|1)(\s+|$)/i.test(text)) {
      const prompt = text.replace(/^\/(conceito|1)\s*/i, '');
      setHintLevel(1);
      triggerCatSpeech('Miaau! Preparando uma reflexão conceitual... 💡🐾', 'thinking', 3500);
      vscode.postMessage({ type: 'requestHint', level: 1, prompt: prompt || undefined, context: currentEditorContext });
      textarea.value = '';
      textarea.style.height = 'auto';
      updateSendButtonState();
      return;
    }
    if (/^\/(logica|2)(\s+|$)/i.test(text)) {
      const prompt = text.replace(/^\/(logica|2)\s*/i, '');
      setHintLevel(2);
      triggerCatSpeech('Miau! Traçando os passos lógicos com você... 🧭🐾', 'thinking', 3500);
      vscode.postMessage({ type: 'requestHint', level: 2, prompt: prompt || undefined, context: currentEditorContext });
      textarea.value = '';
      textarea.style.height = 'auto';
      updateSendButtonState();
      return;
    }
    if (/^\/(sintaxe|3)(\s+|$)/i.test(text)) {
      const prompt = text.replace(/^\/(sintaxe|3)\s*/i, '');
      setHintLevel(3);
      triggerCatSpeech('Miaau! Separando a sintaxe e as peças... 🧩🐾', 'thinking', 3500);
      vscode.postMessage({ type: 'requestHint', level: 3, prompt: prompt || undefined, context: currentEditorContext });
      textarea.value = '';
      textarea.style.height = 'auto';
      updateSendButtonState();
      return;
    }
    if (/^\/(solucao|solução|4)(\s+|$)/i.test(text)) {
      const prompt = text.replace(/^\/(solucao|solução|4)\s*/i, '');
      setHintLevel(4);
      triggerCatSpeech('Miau! Abrindo a solução com análise sênior! 🎯🐾', 'celebrating', 4000);
      vscode.postMessage({ type: 'requestHint', level: 4, prompt: prompt || undefined, context: currentEditorContext });
      textarea.value = '';
      textarea.style.height = 'auto';
      updateSendButtonState();
      return;
    }

    triggerCatSpeech('Miau! Analisando sua mensagem... 🐾', 'thinking', 3500);
    vscode.postMessage({ type: 'sendMessage', text });
    textarea.value = '';
    textarea.style.height = 'auto';
    updateSendButtonState();
  }

  sendBtn?.addEventListener('click', handleSend);

  textarea?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  textarea?.addEventListener('input', () => {
    if (!textarea) return;
    showFloatingContinue(false);
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    updateSendButtonState();
  });

  // Fechar popovers ao clicar fora de suas respectivas áreas
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (!target.closest('#model-quick-popover') && !target.closest('#composer-model-btn')) {
      closeModelPopover();
    }
    if (!target.closest('#level-quick-popover') && !target.closest('#composer-level-btn')) {
      closeLevelPopover();
    }
    if (!target.closest('#tools-quick-popover') && !target.closest('#composer-tools-btn')) {
      closeToolsPopover();
    }
  });

  // Delegação de eventos no Drawer Retrátil da Trilha (Sincronização e Módulos)
  const drawerPanel = document.getElementById('pathway-drawer');
  drawerPanel?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    // Botão Sincronizar com o Servidor
    const syncBtn = target.closest<HTMLButtonElement>('#server-sync-btn');
    if (syncBtn) {
      triggerServerSync();
      return;
    }

    // Botão de Praticar Desafio da Trilha
    const challengeBtn = target.closest<HTMLButtonElement>('[data-roadmap-challenge]');
    if (challengeBtn) {
      const modId = challengeBtn.getAttribute('data-roadmap-challenge') || activePathModuleId;
      closePathwayDrawer();
      vscode.postMessage({
        type: 'startPathChallenge',
        moduleId: modId
      });
      return;
    }

    // Clique em Nó da Trilha ou Árvore de Habilidades para Mudar o Foco da IA
    const nodeEl = target.closest<HTMLElement>('.skill-card[data-module-id], .pathway-node[data-module-id]');
    if (nodeEl && !target.closest('.skill-action-btn') && !target.closest('.node-action-btn')) {
      const modId = nodeEl.getAttribute('data-module-id');
      if (modId) {
        activePathModuleId = modId;
        refreshPathwayUI();
        updateHeaderPathwayPill();
        vscode.postMessage({ type: 'selectPathModule', moduleId: modId });
        showNotificationToast('🎯 Foco da árvore de habilidades atualizado! A IA agora ensinará este módulo.');
      }
      return;
    }
  });

  // Delegação no container de mensagens de Chat: Cards minimalistas e Copiar Código
  const chatContainer = document.getElementById('chat-messages');
  chatContainer?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    // Clique interativo no Mascote Byte (Empty State)
    const mascotCard = target.closest('#mascot-interactive-hero');
    if (mascotCard) {
      const speechEl = document.getElementById('mascot-speech-text');
      const { speech } = getMascotGreeting();
      if (speechEl) {
        speechEl.textContent = speech;
        mascotCard.classList.add('mascot-bounced');
        setTimeout(() => mascotCard.classList.remove('mascot-bounced'), 400);
      }
      return;
    }

    // Card de Abrir a Trilha e Mapa Mental no Empty State
    const openDrawerCard = target.closest('#empty-open-pathway-card');
    if (openDrawerCard) {
      switchMainAppTab('mindmap');
      return;
    }

    // Chips de Sugestão Minimalistas (Claude / ChatGPT style)
    const starterChip = target.closest<HTMLButtonElement>('.starter-chip');
    if (starterChip) {
      const starterType = starterChip.getAttribute('data-starter');
      handleStarterClick(starterType);
      return;
    }

    // Botão de Copiar Código dos Blocos Markdown
    const copyBtn = target.closest<HTMLButtonElement>('.copy-code-btn');
    if (copyBtn) {
      const codeWrapper = copyBtn.closest('.code-block-wrapper');
      const codeEl = codeWrapper?.querySelector('pre code');
      if (codeEl) {
        copyToClipboard(codeEl.textContent || '', copyBtn);
      }
      return;
    }
  });

  // Escuta mensagens vindas do Extension Host
  window.addEventListener('message', (event) => {
    const message = event.data as HostToWebviewMessage;
    handleHostMessage(message);
  });
}

// ==========================================================================
// Gerenciamento do Estado Ligar / Desligar (Power Toggle)
// ==========================================================================

function togglePower(): void {
  setPowerState(!isExtensionEnabled);
}

function setPowerState(enabled: boolean): void {
  isExtensionEnabled = enabled;

  const powerBtn = document.getElementById('power-switch-btn');
  const powerLabel = document.getElementById('power-switch-label');
  const pausedBanner = document.getElementById('power-paused-banner');

  if (powerBtn) {
    if (enabled) {
      powerBtn.className = 'power-switch-btn is-active';
      if (powerLabel) powerLabel.textContent = 'Ativo';
    } else {
      powerBtn.className = 'power-switch-btn';
      if (powerLabel) powerLabel.textContent = 'Pausado';
    }
  }

  if (pausedBanner) {
    if (enabled) {
      pausedBanner.classList.add('hidden');
    } else {
      pausedBanner.classList.remove('hidden');
    }
  }

  vscode.postMessage({
    type: 'toggleEnabled',
    enabled
  });

  showNotificationToast(enabled ? '🟢 AprendeAI Mentor ativado.' : '⚪ AprendeAI Mentor pausado.');
}

function showFloatingContinue(visible: boolean): void {
  const container = document.getElementById('floating-continue-container');
  if (container) {
    container.style.display = visible ? 'flex' : 'none';
  }
}

function triggerServerSync(): void {
  const syncBtn = document.getElementById('server-sync-btn') as HTMLButtonElement | null;
  const syncIcon = document.getElementById('sync-icon');
  const syncText = document.getElementById('sync-text');

  if (syncIcon) syncIcon.classList.add('spinning');
  if (syncText) syncText.textContent = 'Sincronizando com servidor...';
  if (syncBtn) syncBtn.disabled = true;

  vscode.postMessage({ type: 'serverSync' });
}

function updateSpeedometer(score: number): void {
  currentMasteryScore = score;
  const clamped = Math.max(0, Math.min(100, score));

  let stageLabel = 'Novato';
  let stageColor = '#38bdf8';

  if (clamped >= 86) {
    stageLabel = 'Mestre';
    stageColor = '#a78bfa';
  } else if (clamped >= 56) {
    stageLabel = 'Proficiente';
    stageColor = '#34d399';
  } else if (clamped >= 26) {
    stageLabel = 'Praticante';
    stageColor = '#fbbf24';
  }

  // 1. Atualizar Barra Zen de Autonomia
  const fillArc = document.getElementById('gauge-fill-arc');
  const scoreNum = document.getElementById('speedometer-score-num');
  const stageBadge = document.getElementById('speedometer-stage-badge');

  if (fillArc) {
    fillArc.style.width = `${clamped}%`;
    fillArc.style.background = `linear-gradient(90deg, #38bdf8, ${stageColor})`;
  }
  if (scoreNum) {
    scoreNum.textContent = `${clamped}%`;
  }
  if (stageBadge) {
    stageBadge.textContent = stageLabel;
    stageBadge.style.color = stageColor;
  }

  // 2. Atualizar Mini-HUD Zen do Header
  const hudScoreVal = document.getElementById('hud-score-val');
  const hudGearVal = document.getElementById('hud-gear-val');

  if (hudScoreVal) {
    hudScoreVal.textContent = `${clamped}%`;
  }
  if (hudGearVal) {
    hudGearVal.textContent = stageLabel;
    hudGearVal.style.color = stageColor;
    hudGearVal.style.borderColor = stageColor;
  }

  updateHeaderPathwayPill();
}

// ==========================================================================
// Popover Rápido de Seleção de Modelo sobre o Chat
// ==========================================================================

function toggleModelPopover(): void {
  if (isPopoverOpen) {
    closeModelPopover();
  } else {
    openModelPopover();
  }
}

function openModelPopover(): void {
  const popover = document.getElementById('model-quick-popover');
  const listEl = document.getElementById('popover-models-list');
  if (!popover || !listEl) return;

  listEl.innerHTML = '';
  POPULAR_MODELS.forEach((item) => {
    const btn = document.createElement('button');
    btn.className = `popover-model-item ${item.model === currentProviderStatus?.model ? 'active' : ''}`;
    btn.innerHTML = `
      <span>${item.label}</span>
      <span style="font-size: 10px; opacity: 0.6;">${item.provider.toUpperCase()}</span>
    `;
    btn.addEventListener('click', () => {
      selectPopularModel(item.provider, item.model);
    });
    listEl.appendChild(btn);
  });

  popover.classList.remove('hidden');
  isPopoverOpen = true;
}

function closeModelPopover(): void {
  const popover = document.getElementById('model-quick-popover');
  popover?.classList.add('hidden');
  isPopoverOpen = false;
}

function selectPopularModel(provider: LLMProviderType, model: string): void {
  closeModelPopover();

  vscode.postMessage({
    type: 'saveProviderConfig',
    provider,
    model
  });

  showNotificationToast(`⚡ Modelo alterado para ${model} (${provider.toUpperCase()})`);
}

// ==========================================================================
// Modal Completo de Configuração
// ==========================================================================

function openProviderModal(tab?: 'student' | 'pedagogy' | 'connection' | 'parameters' | 'memory'): void {
  const modal = document.getElementById('provider-modal');
  if (!modal) return;

  modal.classList.remove('hidden');
  switchModalTab(tab || 'student');
  switchModalProvider(currentProvider);
}

function closeProviderModal(): void {
  const modal = document.getElementById('provider-modal');
  modal?.classList.add('hidden');
  clearModalStatusFeedback();
}

function switchModalProvider(provider: LLMProviderType): void {
  modalActiveProvider = provider;

  const tabs = rootElement?.querySelectorAll<HTMLButtonElement>('.provider-pill-btn, .provider-tab-btn') ?? [];
  tabs.forEach((tab) => {
    if (tab.getAttribute('data-provider') === provider) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  const apiKeyGroup = document.getElementById('api-key-group');
  const baseUrlGroup = document.getElementById('base-url-group');

  if (provider === 'ollama') {
    if (apiKeyGroup) apiKeyGroup.style.display = 'none';
    if (baseUrlGroup) baseUrlGroup.style.display = 'flex';
  } else {
    if (apiKeyGroup) apiKeyGroup.style.display = 'flex';
    if (baseUrlGroup) baseUrlGroup.style.display = 'none';
  }

  clearModalStatusFeedback();

  vscode.postMessage({
    type: 'getProviderConfig',
    provider
  });
}

function handleFetchModelsClick(): void {
  const fetchBtn = document.getElementById('fetch-models-btn');
  const apiKeyInput = document.getElementById('modal-api-key') as HTMLInputElement | null;
  const baseUrlInput = document.getElementById('modal-base-url') as HTMLInputElement | null;

  if (fetchBtn) {
    fetchBtn.classList.add('loading');
    const label = fetchBtn.querySelector('.btn-label');
    if (label) label.textContent = 'Buscando...';
  }

  clearModalStatusFeedback();

  vscode.postMessage({
    type: 'fetchProviderModels',
    provider: modalActiveProvider,
    apiKey: apiKeyInput?.value,
    baseUrl: baseUrlInput?.value
  });
}

function switchModalTab(tab: 'student' | 'pedagogy' | 'connection' | 'parameters' | 'memory'): void {
  // Mapeamento normalizado para as 3 abas essenciais
  let targetTab: 'connection' | 'student' | 'pedagogy' = 'connection';
  if (tab === 'student') targetTab = 'student';
  else if (tab === 'pedagogy' || tab === 'memory') targetTab = 'pedagogy';
  else targetTab = 'connection';

  modalActiveTab = tab;

  // Atualizar botões das abas segmentadas
  const segTabs = rootElement?.querySelectorAll<HTMLButtonElement>('.modal-seg-tab-btn, .modal-nav-item');
  segTabs?.forEach((btn) => {
    const btnTab = btn.getAttribute('data-modal-tab') || btn.getAttribute('data-tab');
    if (btnTab === targetTab) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Alternar painéis visíveis
  const panels: Array<'connection' | 'student' | 'pedagogy'> = ['connection', 'student', 'pedagogy'];
  panels.forEach((p) => {
    const el = document.getElementById(`modal-tab-${p}`);
    if (el) {
      el.style.display = p === targetTab ? 'flex' : 'none';
    }
  });

  if (targetTab === 'student') {
    updateStudentProfileUI();
  }
}

function updateStudentProfileUI(): void {
  // 1. Atualizar pílula do cabeçalho
  const levelEl = document.getElementById('header-student-level');
  const pillBtn = document.getElementById('header-student-profile-pill');
  if (levelEl) {
    const levelLabels: Record<StudentExperienceLevel, string> = {
      beginner: 'Iniciante',
      intermediate: 'Intermediário',
      advanced: 'Avançado'
    };
    const levelText = levelLabels[currentStudentProfile.experienceLevel] || 'Intermediário';
    levelEl.textContent = levelText;
    if (pillBtn) {
      pillBtn.title = `Perfil Cognitivo: ${levelText} • Meta: ${currentStudentProfile.currentGoal} (Clique para Configurar)`;
    }
  }

  // 2. Atualizar inputs do modal
  const nameInput = document.getElementById('student-name-input') as HTMLInputElement | null;
  const goalInput = document.getElementById('student-goal-input') as HTMLInputElement | null;
  const styleSelect = document.getElementById('student-style-select') as HTMLSelectElement | null;
  if (nameInput) nameInput.value = currentStudentProfile.name || '';
  if (goalInput) goalInput.value = currentStudentProfile.currentGoal || '';
  if (styleSelect) styleSelect.value = currentStudentProfile.preferredStyle;

  // 3. Atualizar segmented buttons
  const segButtons = rootElement?.querySelectorAll<HTMLButtonElement>('.level-seg-btn');
  segButtons?.forEach((btn) => {
    if (btn.getAttribute('data-level') === currentStudentProfile.experienceLevel) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // 4. Atualizar chips de pontos cegos mapeados
  const listEl = document.getElementById('blind-spots-list');
  const badgeEl = document.getElementById('blind-spots-count-badge');
  if (listEl) {
    listEl.innerHTML = renderBlindSpotsChipsHtml();
  }
  if (badgeEl) {
    badgeEl.textContent = `${currentStudentProfile.blindSpots.length} ativas`;
  }

  // 5. Atualizar prévia do código XML recolhido
  const previewEl = document.getElementById('student-profile-preview');
  if (previewEl) {
    previewEl.innerHTML = `<pre class="clean-preview-code">${escapeHtml(renderStudentProfilePreviewText())}</pre>`;
  }
}

function handleSaveProviderConfig(): void {
  const apiKeyInput = document.getElementById('modal-api-key') as HTMLInputElement | null;
  const baseUrlInput = document.getElementById('modal-base-url') as HTMLInputElement | null;
  const modelSelect = document.getElementById('modal-model-select') as HTMLSelectElement | null;
  const tempSlider = document.getElementById('modal-temperature') as HTMLInputElement | null;
  const tokensSelect = document.getElementById('modal-max-tokens') as HTMLSelectElement | null;
  const topPSlider = document.getElementById('modal-top-p') as HTMLInputElement | null;
  const pedSelect = document.getElementById('modal-pedagogical-mode') as HTMLSelectElement | null;
  const frictionCheckbox = document.getElementById('modal-productive-friction') as HTMLInputElement | null;
  const autoNotesCheckbox = document.getElementById('modal-auto-notes') as HTMLInputElement | null;

  const chosenModel = modelSelect?.value || '';
  const temperature = tempSlider ? parseFloat(tempSlider.value) : currentTemperature;
  const maxTokens = tokensSelect ? parseInt(tokensSelect.value, 10) : currentMaxTokens;
  const topP = topPSlider ? parseFloat(topPSlider.value) : currentTopP;
  const pedagogicalMode = pedSelect ? pedSelect.value : currentPedagogicalMode;
  const productiveFriction = frictionCheckbox ? frictionCheckbox.checked : currentProductiveFriction;
  const autoGenerateNotes = autoNotesCheckbox ? autoNotesCheckbox.checked : currentAutoGenerateNotes;

  vscode.postMessage({
    type: 'saveProviderConfig',
    provider: modalActiveProvider,
    apiKey: apiKeyInput?.value,
    baseUrl: baseUrlInput?.value,
    model: chosenModel,
    temperature,
    maxTokens,
    topP,
    pedagogicalMode,
    productiveFriction,
    autoGenerateNotes
  });

  // Salvar e persistir também o Perfil Cognitivo do Aluno
  const studentNameInput = document.getElementById('student-name-input') as HTMLInputElement | null;
  const studentGoalInput = document.getElementById('student-goal-input') as HTMLInputElement | null;
  const studentStyleSelect = document.getElementById('student-style-select') as HTMLSelectElement | null;

  if (studentNameInput) {
    currentStudentProfile.name = studentNameInput.value.trim() || 'Desenvolvedor';
  }
  if (studentGoalInput && studentGoalInput.value.trim()) {
    currentStudentProfile.currentGoal = studentGoalInput.value.trim();
  }
  if (studentStyleSelect) {
    currentStudentProfile.preferredStyle = studentStyleSelect.value as StudentCognitiveStyle;
  }
  currentStudentProfile.bktScore = currentMasteryScore;

  vscode.postMessage({
    type: 'saveStudentProfile',
    profile: currentStudentProfile
  });

  closeProviderModal();
  updateStudentProfileUI();
  showNotificationToast(`⚙️ Configurações e Perfil do Aluno salvos com sucesso!`);
}

function handleAddBlindSpotClick(): void {
  const input = document.getElementById('add-blind-spot-input') as HTMLInputElement | null;
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;

  if (!currentStudentProfile.blindSpots.includes(val)) {
    currentStudentProfile.blindSpots.push(val);
    updateStudentProfileUI();
  }
  input.value = '';
}

function clearModalStatusFeedback(): void {
  const feedback = document.getElementById('modal-status-feedback');
  if (feedback) {
    feedback.className = 'modal-status-feedback';
    feedback.textContent = '';
  }
}

function populateModelSelect(models: string[], selectedModel?: string): void {
  const select = document.getElementById('modal-model-select') as HTMLSelectElement | null;
  if (!select) return;

  select.innerHTML = '';
  models.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    if (m === selectedModel) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });

  if (!select.value && select.options.length > 0) {
    select.selectedIndex = 0;
  }
}

function handleStarterClick(starterType: string | null): void {
  switch (starterType) {
    case 'chat-hello': {
      vscode.postMessage({
        type: 'sendMessage',
        text: 'Oi Byte! Miau! 🐾 Como você funciona e como nós podemos programar juntos?'
      });
      break;
    }
    case 'pair-chat': {
      const targetFile = currentEditorContext.fileName ? `do arquivo ${currentEditorContext.fileName}` : 'do meu código';
      vscode.postMessage({
        type: 'sendMessage',
        text: `E aí Byte! Quero bater um papo com você sobre a estrutura e arquitetura ${targetFile}. O que você acha?`
      });
      break;
    }
    case 'explain': {
      let prompt = 'O que este código está fazendo? Pode me dar uma explicação socrática dos conceitos centrais?';
      if (currentEditorContext.selectedText) {
        prompt = `Pode me explicar socráticamente o que o trecho selecionado está fazendo?\n\`\`\`\n${currentEditorContext.selectedText}\n\`\`\``;
      } else if (currentEditorContext.fileName) {
        prompt = `Pode me explicar os conceitos centrais e a arquitetura do arquivo ${currentEditorContext.fileName}?`;
      }
      vscode.postMessage({ type: 'sendMessage', text: prompt });
      break;
    }
    case 'terminal': {
      vscode.postMessage({ type: 'explainTerminalError' });
      break;
    }
    case 'note': {
      vscode.postMessage({ type: 'generateStudyNote', context: currentEditorContext });
      break;
    }
    case 'socratic-step': {
      vscode.postMessage({ type: 'requestHint', level: 1, context: currentEditorContext });
      break;
    }
  }
}

function copyToClipboard(text: string, buttonEl: HTMLButtonElement): void {
  navigator.clipboard.writeText(text).then(
    () => showCopySuccess(buttonEl),
    () => {
      const fallback = document.createElement('textarea');
      fallback.value = text;
      document.body.appendChild(fallback);
      fallback.select();
      try {
        document.execCommand('copy');
        showCopySuccess(buttonEl);
      } catch (err) {
        console.error('Falha ao copiar:', err);
      } finally {
        fallback.remove();
      }
    }
  );
}

function showCopySuccess(buttonEl: HTMLButtonElement): void {
  buttonEl.classList.add('copied');
  const label = buttonEl.querySelector('.copy-label') || buttonEl;
  const original = label.textContent;
  label.textContent = 'Copiado!';
  setTimeout(() => {
    label.textContent = original;
    buttonEl.classList.remove('copied');
  }, 2000);
}

function setHintLevel(level: HintLevel): void {
  selectedHintLevel = level;
  if (!rootElement) return;

  const levelMeta = LEVEL_METAS[level] || LEVEL_METAS[1];

  // Atualizar visual do botão de nível dentro da cápsula do Composer
  const levelIconEl = document.getElementById('composer-level-icon');
  const levelNameEl = document.getElementById('composer-level-name');
  const levelBtn = document.getElementById('composer-level-btn');

  if (levelIconEl) levelIconEl.textContent = levelMeta.icon;
  if (levelNameEl) levelNameEl.textContent = levelMeta.title;
  if (levelBtn) {
    levelBtn.className = `composer-pill-btn lvl-${level}`;
  }

  // Atualizar item ativo no Popover de Níveis
  const popoverItems = rootElement.querySelectorAll<HTMLButtonElement>('[data-popover-level]');
  popoverItems.forEach((item) => {
    const itemLevel = parseInt(item.getAttribute('data-popover-level') || '1', 10);
    if (itemLevel === level) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

function updateProviderStatusUI(status: ProviderStatusInfo): void {
  currentProviderStatus = status;
  currentProvider = status.provider;

  // Atualiza botão do modelo dentro do composer
  const modelNameEl = document.getElementById('composer-model-name');
  if (modelNameEl) {
    modelNameEl.textContent = status.model || status.provider.toUpperCase();
    modelNameEl.title = `Provedor: ${status.provider.toUpperCase()} • Modelo: ${status.model}`;
  }

  const dot = document.getElementById('composer-model-dot');
  if (dot) {
    dot.className = 'composer-model-dot';
    if (status.connected) {
      dot.classList.add('connected');
    } else if (status.isConfigured && status.statusText.includes('Conectando')) {
      dot.classList.add('connecting');
    } else {
      dot.classList.add('disconnected');
    }
    dot.title = `[${status.provider.toUpperCase()}] ${status.statusText}`;
  }
}

function handleHostMessage(message: HostToWebviewMessage): void {
  switch (message.type) {
    case 'restoreHistory':
      messages = message.messages;
      renderMessages();
      break;

    case 'pathwayState':
      pathwayModules = message.modules;
      activePathModuleId = message.activeModuleId;
      refreshPathwayUI();
      updateHeaderPathwayPill();
      break;

    case 'studentProfileUpdated':
      currentStudentProfile = { ...message.profile };
      updateStudentProfileUI();
      break;

    case 'enabledStatus':
      if (message.enabled !== undefined) {
        isExtensionEnabled = message.enabled;
        const powerBtn = document.getElementById('power-switch-btn');
        const powerLabel = document.getElementById('power-switch-label');
        const pausedBanner = document.getElementById('power-paused-banner');
        if (powerBtn) {
          powerBtn.className = message.enabled ? 'power-switch-btn is-active' : 'power-switch-btn';
        }
        if (powerLabel) {
          powerLabel.textContent = message.enabled ? 'Ativo' : 'Pausado';
        }
        if (pausedBanner) {
          if (message.enabled) {
            pausedBanner.classList.add('hidden');
          } else {
            pausedBanner.classList.remove('hidden');
          }
        }
      }
      break;

    case 'serverSyncResult': {
      const syncIcon = document.getElementById('sync-icon');
      const syncText = document.getElementById('sync-text');
      const syncBtn = document.getElementById('server-sync-btn') as HTMLButtonElement | null;

      if (syncIcon) syncIcon.classList.remove('spinning');
      if (syncBtn) syncBtn.disabled = false;

      if (message.success) {
        if (syncText) syncText.textContent = 'Sincronizado com Servidor';
        if (message.masteryScore !== undefined) {
          updateSpeedometer(message.masteryScore);
        }
        updateHeaderPathwayPill();
        showNotificationToast('🔄 Grafo de conhecimento e velocímetro sincronizados!');
      } else {
        if (syncText) syncText.textContent = 'Falha ao sincronizar';
        showNotificationToast('⚠️ Erro ao sincronizar com servidor.');
      }
      break;
    }

    case 'updateContext':
      currentEditorContext = message.context;
      updateContextUI(message.context);
      break;

    case 'hintLevelChanged':
      setHintLevel(message.level);
      break;

    case 'streamChunk':
      handleStreamChunk(message.messageId, message.chunk);
      break;

    case 'streamEnd':
      handleStreamEnd(message.messageId, message.fullText);
      break;

    case 'streamError':
      handleStreamError(message.error);
      break;

    case 'studyNoteCreated':
      showNotificationToast(`📚 Nota "${message.title}" criada com sucesso!`);
      break;

    case 'autoNoteSaved':
      showNotificationToast(`🧠 Memória da IA gravada: ${message.title}`);
      break;

    case 'providerStatus':
      updateProviderStatusUI(message.status);
      break;

    case 'providerConfigData': {
      const apiKeyInput = document.getElementById('modal-api-key') as HTMLInputElement | null;
      const baseUrlInput = document.getElementById('modal-base-url') as HTMLInputElement | null;
      if (apiKeyInput && message.apiKey !== undefined) {
        apiKeyInput.value = message.apiKey;
      }
      if (baseUrlInput && message.baseUrl !== undefined) {
        baseUrlInput.value = message.baseUrl;
      }
      populateModelSelect(message.availableModels, message.model);

      if (message.temperature !== undefined) {
        currentTemperature = message.temperature;
        const tempSlider = document.getElementById('modal-temperature') as HTMLInputElement | null;
        const tempBadge = document.getElementById('modal-temp-badge');
        if (tempSlider) tempSlider.value = String(message.temperature);
        if (tempBadge) tempBadge.textContent = String(message.temperature);
      }
      if (message.maxTokens !== undefined) {
        currentMaxTokens = message.maxTokens;
        const tokensSelect = document.getElementById('modal-max-tokens') as HTMLSelectElement | null;
        if (tokensSelect) tokensSelect.value = String(message.maxTokens);
      }
      if (message.topP !== undefined) {
        currentTopP = message.topP;
        const topPSlider = document.getElementById('modal-top-p') as HTMLInputElement | null;
        const topPBadge = document.getElementById('modal-top-p-badge');
        if (topPSlider) topPSlider.value = String(message.topP);
        if (topPBadge) topPBadge.textContent = String(message.topP);
      }
      if (message.pedagogicalMode !== undefined) {
        currentPedagogicalMode = message.pedagogicalMode;
        const pedSelect = document.getElementById('modal-pedagogical-mode') as HTMLSelectElement | null;
        if (pedSelect) pedSelect.value = message.pedagogicalMode;
      }
      if (message.productiveFriction !== undefined) {
        currentProductiveFriction = message.productiveFriction;
        const frictionCheckbox = document.getElementById('modal-productive-friction') as HTMLInputElement | null;
        if (frictionCheckbox) frictionCheckbox.checked = message.productiveFriction;
      }
      if (message.autoGenerateNotes !== undefined) {
        currentAutoGenerateNotes = message.autoGenerateNotes;
        const autoNotesCheckbox = document.getElementById('modal-auto-notes') as HTMLInputElement | null;
        if (autoNotesCheckbox) autoNotesCheckbox.checked = message.autoGenerateNotes;
      }
      break;
    }

    case 'providerModelsResult': {
      const fetchBtn = document.getElementById('fetch-models-btn');
      if (fetchBtn) {
        fetchBtn.classList.remove('loading');
        const label = fetchBtn.querySelector('.btn-label');
        if (label) label.textContent = 'Buscar Modelos Disponíveis';
      }

      const feedback = document.getElementById('modal-status-feedback');
      if (message.success) {
        populateModelSelect(message.models);
        if (feedback) {
          feedback.className = 'modal-status-feedback success';
          feedback.textContent = `✓ ${message.models.length} modelos encontrados com sucesso!`;
        }
      } else {
        if (feedback) {
          feedback.className = 'modal-status-feedback error';
          feedback.textContent = `⚠️ ${message.error || 'Falha ao buscar modelos.'}`;
        }
      }
      break;
    }

    case 'saveConfigResult': {
      if (message.success) {
        showNotificationToast(`✓ ${message.message}`);
      } else {
        showNotificationToast(`⚠️ ${message.message}`);
      }
      break;
    }

    case 'productiveFrictionWarning':
      renderProductiveFrictionWarning(message.message, message.targetLevel);
      break;
  }
}

function renderProductiveFrictionWarning(warningMessage: string, targetLevel: HintLevel): void {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const emptyView = container.querySelector('.chat-empty');
  if (emptyView) container.innerHTML = '';

  const alertDiv = document.createElement('div');
  alertDiv.className = 'message-row assistant';
  alertDiv.innerHTML = `
    <div class="assistant-message-content" style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 8px; padding: 10px 12px;">
      <div class="assistant-meta">
        <span class="assistant-meta-badge bypass">🛡️ Trava de Atrito Produtivo</span>
      </div>
      <div class="message-text">${warningMessage}</div>
      <div style="display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap;">
        <button class="quick-pill-btn" data-action="level1" style="border-color: var(--aprendeai-level-1);">🧭 Tentar Nível 1</button>
        <button class="quick-pill-btn" data-action="level2" style="border-color: var(--aprendeai-level-2);">📐 Tentar Nível 2</button>
        <button class="quick-pill-btn" data-action="bypass">Ver Solução</button>
      </div>
    </div>
  `;

  alertDiv.querySelector('[data-action="level1"]')?.addEventListener('click', () => {
    setHintLevel(1);
    vscode.postMessage({ type: 'requestHint', level: 1, context: currentEditorContext });
    alertDiv.remove();
  });

  alertDiv.querySelector('[data-action="level2"]')?.addEventListener('click', () => {
    setHintLevel(2);
    vscode.postMessage({ type: 'requestHint', level: 2, context: currentEditorContext });
    alertDiv.remove();
  });

  alertDiv.querySelector('[data-action="bypass"]')?.addEventListener('click', () => {
    setHintLevel(targetLevel);
    vscode.postMessage({ type: 'requestHint', level: targetLevel, context: currentEditorContext, bypassFriction: true });
    alertDiv.remove();
  });

  container.appendChild(alertDiv);
  scrollToBottom(container);
}

function showNotificationToast(message: string): void {
  if (!rootElement) return;

  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'toast-container';
    rootElement.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.innerHTML = `<span class="toast-text">${message}</span>`;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

function updateContextUI(ctx: EditorContext): void {
  const chip = document.getElementById('context-chip');
  const fileInfo = document.getElementById('context-file-info');
  const badgeEl = document.getElementById('context-lines-badge');

  if (!chip || !fileInfo) return;

  if (ctx.fileName) {
    chip.style.display = 'flex';
    fileInfo.textContent = ctx.fileName;
    if (badgeEl) {
      if (ctx.selectionStartLine) {
        badgeEl.style.display = 'inline-block';
        badgeEl.textContent = ctx.selectionEndLine && ctx.selectionEndLine !== ctx.selectionStartLine
          ? `L${ctx.selectionStartLine}-${ctx.selectionEndLine}`
          : `L${ctx.selectionStartLine}`;
      } else {
        badgeEl.style.display = 'none';
      }
    }
  } else {
    chip.style.display = 'none';
  }
}

function renderMessages(): void {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  if (messages.length === 0) {
    container.innerHTML = renderEmptyStateHtml();
    return;
  }

  container.innerHTML = '';
  messages.forEach((msg) => {
    appendMessageElement(container, msg);
  });

  scrollToBottom(container);
}

function appendMessageElement(container: HTMLElement, msg: ChatMessage): HTMLElement {
  const row = document.createElement('div');
  row.id = `msg-${msg.id}`;
  row.className = `message-row ${msg.sender}`;

  if (msg.sender === 'user') {
    row.innerHTML = `
      <div class="message-bubble-user">
        ${formatMessageText(msg.content)}
      </div>
    `;
  } else {
    let badgeHtml = '';
    if (msg.hintLevel) {
      badgeHtml = `<span class="assistant-meta-badge lvl-${msg.hintLevel}">Lvl ${msg.hintLevel}</span>`;
    } else if (msg.isEmergencyBypass) {
      badgeHtml = `<span class="assistant-meta-badge bypass">Válvula</span>`;
    } else {
      badgeHtml = `<span class="assistant-meta-badge conversational">🐾 Conversa</span>`;
    }

    let mood: 'happy' | 'thinking' | 'wink' | 'celebrating' = 'happy';
    const lowerContent = msg.content.toLowerCase();
    if (lowerContent.includes('ronrom') || lowerContent.includes('parabéns') || lowerContent.includes('boa!') || lowerContent.includes('show!')) {
      mood = 'celebrating';
    } else if (lowerContent.includes('😉') || lowerContent.includes('dica rápida') || lowerContent.includes('bigodes')) {
      mood = 'wink';
    } else if (msg.hintLevel === 1 || msg.hintLevel === 2) {
      mood = 'thinking';
    } else if (msg.hintLevel === 4) {
      mood = 'celebrating';
    }

    row.innerHTML = `
      <div class="assistant-message-content">
        <div class="assistant-meta">
          <div class="assistant-author-row">
            ${renderByteMascotSvg(24, mood)}
            <strong class="assistant-name">Byte 🐱</strong>
            <span class="assistant-sublabel">Tutor & Amigo Dev</span>
          </div>
          ${badgeHtml}
        </div>
        <div class="message-text">${formatMessageText(msg.content)}</div>
      </div>
    `;
  }

  container.appendChild(row);
  return row;
}

function handleStreamChunk(messageId: string, chunk: string): void {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  // Limpar empty state ou indicador temporário de digitação
  removeCatTypingIndicator();
  const emptyView = container.querySelector('.minimal-empty-state, .chat-empty');
  if (emptyView) container.innerHTML = '';

  let row = document.getElementById(`msg-${messageId}`);
  if (!row) {
    activeStreamingMessageId = messageId;
    const newMsg: ChatMessage = {
      id: messageId,
      sender: 'assistant',
      content: chunk,
      timestamp: Date.now(),
      hintLevel: selectedHintLevel
    };
    messages.push(newMsg);
    row = appendMessageElement(container, newMsg);

    const textEl = row.querySelector('.message-text');
    if (textEl) {
      const cursor = document.createElement('span');
      cursor.className = 'streaming-cursor';
      textEl.appendChild(cursor);
    }

    triggerCatSpeech('🐾 Byte está escrevendo no chat...', 'happy', 0);
  } else {
    const existingMsg = messages.find((m) => m.id === messageId);
    if (existingMsg) {
      existingMsg.content += chunk;
      const textEl = row.querySelector('.message-text');
      if (textEl) {
        textEl.innerHTML = formatMessageText(existingMsg.content) + '<span class="streaming-cursor"></span>';
      }
    }
  }

  scrollToBottom(container);
}

function handleStreamEnd(messageId: string, fullText: string): void {
  activeStreamingMessageId = null;
  const row = document.getElementById(`msg-${messageId}`);
  if (row) {
    const textEl = row.querySelector('.message-text');
    if (textEl) {
      textEl.innerHTML = formatMessageText(fullText);
    }
  }

  const existingMsg = messages.find((m) => m.id === messageId);
  if (existingMsg) {
    existingMsg.content = fullText;
  }

  triggerCatSpeech('Miau! Terminei de escrever no chat. Dê uma olhada na pista! 🐾', 'celebrating', 6000);

  // Ativa a pílula flutuante de continuar caso haja continuidade pedagógica
  if (fullText && fullText.length > 40) {
    showFloatingContinue(true);
  }

  const container = document.getElementById('chat-messages');
  if (container) scrollToBottom(container);
}

function handleStreamError(error: string): void {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  triggerCatSpeech('Miaau... Tive um pequeno engasgo na conexão. Tenta de novo? 🐾', 'thinking', 5000);

  const errorRow = document.createElement('div');
  errorRow.className = 'message-row assistant';
  errorRow.innerHTML = `
    <div class="assistant-message-content">
      <div class="assistant-meta">
        <strong style="color: var(--aprendeai-danger);">Erro</strong>
      </div>
      <div class="message-text" style="color: var(--aprendeai-danger);">⚠️ ${error}</div>
    </div>
  `;
  container.appendChild(errorRow);
  scrollToBottom(container);
}

function formatMessageText(raw: string): string {
  let content = raw;

  // Fechar temporariamente blocos de código abertos durante o streaming
  const tickCount = (content.match(/```/g) || []).length;
  if (tickCount % 2 === 1) {
    content += '\n```';
  }

  const escaped = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Bloco de código com ``` estilo ChatGPT
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let formatted = escaped.replace(codeBlockRegex, (_match, lang, code) => {
    const language = lang || 'código';
    return `
      <div class="code-block-wrapper">
        <div class="code-block-header">
          <span class="code-lang-tag">${language}</span>
          <button class="copy-code-btn" type="button" title="Copiar código">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span class="copy-label">Copiar</span>
          </button>
        </div>
        <pre><code class="language-${language}">${code.trim()}</code></pre>
      </div>
    `;
  });

  // Código inline `code`
  formatted = formatted.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // Negrito **bold**
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  return formatted;
}

function scrollToBottom(container: HTMLElement): void {
  container.scrollTop = container.scrollHeight;
}

// Inicializar aplicação
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
