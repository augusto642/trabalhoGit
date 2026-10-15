---
name: aprendeai-extension-architecture
description: Padrões arquiteturais, receitas técnicas e boas práticas para desenvolver a extensão VS Code do AprendeAI com TypeScript, Webview e Shell Integration.
---

# AprendeAI - Arquitetura da Extensão VS Code

Este guia define a arquitetura, convenções e receitas de implementação para a extensão do VS Code do AprendeAI.

## 1. Princípios Arquiteturais

1. **Desacoplamento Hexagonal:**
   - O núcleo pedagógico e o gerenciador de memória NÃO dependem diretamente do namespace `vscode`.
   - Adaptadores de infraestrutura conectam as APIs do VS Code aos casos de uso.
2. **Performance Não-Bloqueante:**
   - A thread principal do Extension Host é sagrada.
   - Chamadas de IA, operações de arquivo e streams de terminal são 100% assíncronos (`async/await`).
3. **Resiliência Local-First:**
   - A extensão opera mesmo sem internet ou com o servidor Botkeep offline.
   - O histórico de métricas é enfileirado localmente (`.sync-queue.json`) quando a rede oscilar.

---

## 2. Padrões de Implementação

### 2.1 WebviewViewProvider com Re-hidratação de Estado
Webviews são descartadas pelo VS Code quando o usuário alterna abas da barra lateral.

```typescript
import * as vscode from 'vscode';

export class TutorViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'aprendeai.tutorView';
  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context: vscode.ExtensionContext
  ) {}

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Re-hidratar histórico do workspaceState
    const savedHistory = this._context.workspaceState.get<any[]>('tutor_history', []);
    webviewView.webview.postMessage({ type: 'restoreHistory', history: savedHistory });

    webviewView.webview.onDidReceiveMessage(async (data) => {
      // Tratar mensagens vindas da UI (postMessage)
    });
  }
}
```

### 2.2 Shell Integration do Terminal (v1.93+)
Leitura assíncrona de comandos e captura de erros de compilação/execução:

```typescript
import * as vscode from 'vscode';

export function registerTerminalWatcher(context: vscode.ExtensionContext) {
  const disposable = vscode.window.onDidEndTerminalShellExecution(async (event) => {
    const { execution, exitCode } = event;
    if (exitCode !== 0) {
      // Comando falhou! Capturar stream de saída para análise didática
      try {
        const stream = execution.read();
        let output = '';
        for await (const chunk of stream) {
          output += chunk;
        }
        // Disparar análise socrática do erro
        handleTerminalFailure(output, execution.commandLine?.value);
      } catch (err) {
        console.error('Falha ao ler stream do terminal:', err);
      }
    }
  });

  context.subscriptions.push(disposable);
}
```

### 2.3 Sanitização de Segredos (Secret Sanitizer)
Antes de enviar qualquer trecho de código ou log para a IA:

```typescript
export function sanitizeSecrets(content: string): string {
  return content
    .replace(/(api[_-]?key|secret|token|password|bearer\s+[a-zA-Z0-9_\-\.]+)/gi, '[REDACTED_SECRET]')
    .replace(/(postgres|mysql|mongodb):\/\/[^@]+@[^\s"']+/gi, '[REDACTED_DATABASE_URL]');
}
```
