import { ConnectionTestResult, ILLMProvider, LLMRequestOptions } from './types';
import { LLMProviderType } from '../../shared/messages';

export class OpenAIProvider implements ILLMProvider {
  public readonly id: LLMProviderType = 'openai';
  public readonly name = 'OpenAI';

  constructor(
    private readonly apiKey: string,
    private readonly model: string = 'gpt-4o-mini',
    private readonly baseUrl: string = 'https://api.openai.com/v1'
  ) {}

  public async streamChat(options: LLMRequestOptions): Promise<string> {
    if (!this.apiKey || !this.apiKey.trim()) {
      throw new Error('Chave de API da OpenAI não configurada. Configure em aprendeai.openai.apiKey.');
    }

    const cleanBaseUrl = this.baseUrl.replace(/\/+$/, '');
    const endpoint = `${cleanBaseUrl}/chat/completions`;

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey.trim()}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: options.messages.map((m) => ({
            role: m.role,
            content: m.content
          })),
          stream: true,
          temperature: options.temperature ?? 0.2,
          max_tokens: options.maxTokens ?? 2048
        }),
        signal: options.signal
      });
    } catch (err: unknown) {
      if (options.signal?.aborted) {
        throw new Error('Operação cancelada.');
      }
      const errorMsg = err instanceof Error ? err.message : String(err);
      throw new Error(`Falha de conexão com a OpenAI: ${errorMsg}`);
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Erro na API da OpenAI (${response.status}): ${errorText || response.statusText}`);
    }

    if (!response.body) {
      throw new Error('Stream de resposta da OpenAI indisponível.');
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
          if (!trimmed || !trimmed.startsWith('data:')) {
            continue;
          }

          const jsonPayload = trimmed.replace(/^data:\s*/, '');
          if (jsonPayload === '[DONE]') {
            break;
          }

          try {
            const parsed = JSON.parse(jsonPayload) as {
              choices?: Array<{
                delta?: { content?: string };
              }>;
            };

            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              accumulatedText += content;
              options.onChunk?.(content);
            }
          } catch {
            // Continua lendo
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return accumulatedText;
  }

  public async testConnection(): Promise<ConnectionTestResult> {
    if (!this.apiKey || !this.apiKey.trim()) {
      return {
        ok: false,
        message: 'Chave de API da OpenAI não configurada (aprendeai.openai.apiKey)'
      };
    }

    const cleanBaseUrl = this.baseUrl.replace(/\/+$/, '');
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`${cleanBaseUrl}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey.trim()}`
        },
        signal: controller.signal
      }).finally(() => clearTimeout(timeoutId));

      if (res.ok) {
        return {
          ok: true,
          message: `OpenAI conectada (${this.model})`
        };
      }

      const errText = await res.text().catch(() => '');
      return {
        ok: false,
        message: `Falha na autenticação da OpenAI (${res.status}): ${errText || res.statusText}`
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        message: `Erro ao testar conexão com OpenAI: ${msg}`
      };
    }
  }
}
