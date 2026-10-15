import { ConnectionTestResult, ILLMProvider, LLMMessage, LLMRequestOptions } from './types';
import { LLMProviderType } from '../../shared/messages';

export class ClaudeProvider implements ILLMProvider {
  public readonly id: LLMProviderType = 'claude';
  public readonly name = 'Anthropic Claude';

  constructor(
    private readonly apiKey: string,
    private readonly model: string = 'claude-3-5-sonnet-20241022',
    private readonly baseUrl: string = 'https://api.anthropic.com/v1'
  ) {}

  public async streamChat(options: LLMRequestOptions): Promise<string> {
    if (!this.apiKey || !this.apiKey.trim()) {
      throw new Error('Chave de API da Anthropic Claude não configurada. Configure em aprendeai.claude.apiKey.');
    }

    const cleanBaseUrl = this.baseUrl.replace(/\/+$/, '');
    const endpoint = `${cleanBaseUrl}/messages`;

    // Anthropic Messages API: instrução do sistema é separada
    const systemMessages = options.messages.filter((m) => m.role === 'system');
    const systemPrompt = systemMessages.map((m) => m.content).join('\n\n');

    // Prepara mensagens de diálogo (user e assistant)
    const rawDialogMessages = options.messages.filter((m) => m.role !== 'system');
    const dialogMessages = this.formatAnthropicMessages(rawDialogMessages, systemPrompt);

    const requestPayload: Record<string, unknown> = {
      model: this.model,
      max_tokens: options.maxTokens ?? 2048,
      temperature: options.temperature ?? 0.2,
      messages: dialogMessages,
      stream: true
    };

    if (systemPrompt.trim()) {
      requestPayload.system = systemPrompt;
    }

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey.trim(),
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(requestPayload),
        signal: options.signal
      });
    } catch (err: unknown) {
      if (options.signal?.aborted) {
        throw new Error('Operação cancelada.');
      }
      const errorMsg = err instanceof Error ? err.message : String(err);
      throw new Error(`Falha de conexão com a API da Anthropic Claude: ${errorMsg}`);
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Erro na API da Anthropic Claude (${response.status}): ${errorText || response.statusText}`);
    }

    if (!response.body) {
      throw new Error('Stream de resposta da Anthropic Claude indisponível.');
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
              type?: string;
              delta?: {
                type?: string;
                text?: string;
              };
            };

            // Evento text_delta no formato SSE da Anthropic
            const text = parsed.delta?.text;
            if (text) {
              accumulatedText += text;
              options.onChunk?.(text);
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
        message: 'Chave de API da Anthropic não configurada (aprendeai.claude.apiKey)'
      };
    }

    const cleanBaseUrl = this.baseUrl.replace(/\/+$/, '');
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      // Validação rápida enviando ping com 1 token
      const res = await fetch(`${cleanBaseUrl}/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey.trim(),
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }]
        }),
        signal: controller.signal
      }).finally(() => clearTimeout(timeoutId));

      if (res.ok) {
        return {
          ok: true,
          message: `Anthropic Claude conectada (${this.model})`
        };
      }

      const errText = await res.text().catch(() => '');
      return {
        ok: false,
        message: `Falha na autenticação Claude (${res.status}): ${errText || res.statusText}`
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        message: `Erro ao testar conexão com Anthropic Claude: ${msg}`
      };
    }
  }

  /**
   * Garante que mensagens adjacentes do mesmo papel sejam combinadas
   * e que a lista comece com role 'user' conforme exigência da Anthropic
   */
  private formatAnthropicMessages(messages: LLMMessage[], fallbackSystem: string): Array<{ role: 'user' | 'assistant'; content: string }> {
    const valid = messages.filter((m) => m.role === 'user' || m.role === 'assistant') as Array<{
      role: 'user' | 'assistant';
      content: string;
    }>;

    if (valid.length === 0) {
      return [{ role: 'user', content: fallbackSystem || 'Olá' }];
    }

    const merged: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    for (const msg of valid) {
      const last = merged[merged.length - 1];
      if (last && last.role === msg.role) {
        last.content += `\n\n${msg.content}`;
      } else {
        merged.push({ role: msg.role, content: msg.content });
      }
    }

    // Claude requer que a primeira mensagem seja 'user'
    if (merged.length > 0 && merged[0].role !== 'user') {
      merged.unshift({ role: 'user', content: 'Iniciando mentoria de código.' });
    }

    return merged;
  }
}
