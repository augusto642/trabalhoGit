import { ConnectionTestResult, ILLMProvider, LLMRequestOptions } from './types';
import { LLMProviderType } from '../../shared/messages';

export class OllamaProvider implements ILLMProvider {
  public readonly id: LLMProviderType = 'ollama';
  public readonly name = 'Ollama Local';

  constructor(
    private readonly baseUrl: string = 'http://localhost:11434',
    private readonly model: string = 'qwen2.5-coder:7b'
  ) {}

  public async streamChat(options: LLMRequestOptions): Promise<string> {
    const cleanBaseUrl = this.baseUrl.replace(/\/+$/, '');
    const endpoint = `${cleanBaseUrl}/api/chat`;

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          messages: options.messages.map((m) => ({
            role: m.role,
            content: m.content
          })),
          stream: true,
          options: {
            temperature: options.temperature ?? 0.2,
            num_predict: options.maxTokens ?? 2048
          }
        }),
        signal: options.signal
      });
    } catch (err: unknown) {
      if (options.signal?.aborted) {
        throw new Error('Operação cancelada.');
      }
      const errorMsg = err instanceof Error ? err.message : String(err);
      throw new Error(`Falha ao conectar com o Ollama (${cleanBaseUrl}): ${errorMsg}. Certifique-se de que o Ollama está em execução.`);
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`Erro do Ollama HTTP ${response.status}: ${errorBody || response.statusText}`);
    }

    if (!response.body) {
      throw new Error('Resposta do Ollama vazia ou stream indisponível.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let accumulatedText = '';

    try {
      while (true) {
        if (options.signal?.aborted) {
          await reader.cancel();
          throw new Error('Operação cancelada.');
        }

        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            continue;
          }

          try {
            const parsed = JSON.parse(trimmed) as {
              message?: { content?: string };
              done?: boolean;
            };

            const token = parsed.message?.content;
            if (token) {
              accumulatedText += token;
              options.onChunk?.(token);
            }

            if (parsed.done) {
              break;
            }
          } catch {
            // Ignora linhas que ainda não completaram JSON
          }
        }
      }

      // Processa sobra no buffer se houver
      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer.trim()) as {
            message?: { content?: string };
          };
          const token = parsed.message?.content;
          if (token) {
            accumulatedText += token;
            options.onChunk?.(token);
          }
        } catch {
          // Ignora
        }
      }
    } finally {
      reader.releaseLock();
    }

    return accumulatedText;
  }

  public async testConnection(): Promise<ConnectionTestResult> {
    const cleanBaseUrl = this.baseUrl.replace(/\/+$/, '');
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(`${cleanBaseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal
      }).finally(() => clearTimeout(timeoutId));

      if (!res.ok) {
        return {
          ok: false,
          message: `Ollama respondeu com status ${res.status}: ${res.statusText}`
        };
      }

      const data = (await res.json()) as { models?: Array<{ name?: string }> };
      const modelNames = (data.models || []).map((m) => m.name || '');
      const hasConfiguredModel = modelNames.some((n) =>
        n.toLowerCase().startsWith(this.model.toLowerCase()) || this.model.toLowerCase().startsWith(n.toLowerCase())
      );

      if (hasConfiguredModel) {
        return {
          ok: true,
          message: `Ollama pronto (${this.model})`
        };
      } else {
        return {
          ok: true,
          message: `Ollama online, mas modelo "${this.model}" não encontrado localmente (execute: ollama pull ${this.model})`
        };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        message: `Não foi possível conectar ao Ollama em ${cleanBaseUrl}: ${msg}`
      };
    }
  }
}
