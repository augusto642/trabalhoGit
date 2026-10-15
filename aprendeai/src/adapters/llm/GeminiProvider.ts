import { ConnectionTestResult, ILLMProvider, LLMRequestOptions } from './types';
import { LLMProviderType } from '../../shared/messages';

export class GeminiProvider implements ILLMProvider {
  public readonly id: LLMProviderType = 'gemini';
  public readonly name = 'Google Gemini';

  constructor(
    private readonly apiKey: string,
    private readonly model: string = 'gemini-1.5-flash'
  ) {}

  public async streamChat(options: LLMRequestOptions): Promise<string> {
    if (!this.apiKey || !this.apiKey.trim()) {
      throw new Error('Chave de API do Google Gemini não configurada. Configure em aprendeai.gemini.apiKey ou no menu superior.');
    }

    // Lista de modelos para fallback resiliente caso o principal sofra sobrecarga (503 High Demand)
    const candidateModels = [
      this.model,
      'gemini-2.0-flash',
      'gemini-1.5-flash-8b',
      'gemini-1.5-pro'
    ].filter((m, i, arr) => Boolean(m) && arr.indexOf(m) === i);

    // Separa mensagens de sistema dos diálogos user/model
    const systemMessages = options.messages.filter((m) => m.role === 'system');
    const systemInstructionText = systemMessages.map((m) => m.content).join('\n\n');

    const contents = options.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

    if (contents.length === 0 && systemInstructionText) {
      contents.push({
        role: 'user',
        parts: [{ text: systemInstructionText }]
      });
    }

    const requestBody: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.2,
        maxOutputTokens: options.maxTokens ?? 2048
      }
    };

    if (systemInstructionText && contents.length > 0) {
      requestBody.system_instruction = {
        parts: [{ text: systemInstructionText }]
      };
    }

    let lastError: Error | null = null;

    // Tenta o modelo configurado e, se der sobrecarga 503 / 429, tenta modelos alternativos compatíveis
    for (const currentModel of candidateModels) {
      if (options.signal?.aborted) {
        throw new Error('Operação cancelada.');
      }

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(currentModel)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(this.apiKey.trim())}`;

      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody),
          signal: options.signal
        });
      } catch (err: unknown) {
        if (options.signal?.aborted) {
          throw new Error('Operação cancelada.');
        }
        const errorMsg = err instanceof Error ? err.message : String(err);
        lastError = new Error(`Falha de conexão com a API do Google Gemini: ${errorMsg}`);
        continue;
      }

      // Se der 503 (High Demand) ou 429 (Rate Limit), aguarda um breve instante e tenta o próximo modelo
      if (response.status === 503 || response.status === 429) {
        const errorText = await response.text().catch(() => '');
        lastError = new Error(
          `Os servidores da Google para o modelo ${currentModel} estão temporariamente com alta demanda (503).`
        );
        console.warn(`[AprendeAI] Gemini ${currentModel} retornou ${response.status} (alta demanda). Tentando modelo alternativo...`, errorText);
        
        // Pausa suave de 800ms antes do próximo candidato
        await new Promise((resolve) => setTimeout(resolve, 800));
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        let cleanMessage = errorText;
        try {
          const parsed = JSON.parse(errorText) as { error?: { message?: string } };
          if (parsed.error?.message) {
            cleanMessage = parsed.error.message;
          }
        } catch {
          // Mantém errorText
        }
        throw new Error(`Erro na API do Google Gemini (${response.status}): ${cleanMessage || response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Stream de resposta do Google Gemini indisponível.');
      }

      // Se a conexão foi estabelecida com sucesso com este modelo, consome o stream
      return await this.consumeSseStream(response.body, options);
    }

    // Se todos os candidatos falharam com 503/alta demanda
    throw (
      lastError ||
      new Error(
        `O Google Gemini está com sobrecarga temporária em todos os modelos testados (503). Por favor, aguarde alguns segundos ou selecione outro modelo/provedor no menu superior.`
      )
    );
  }

  private async consumeSseStream(
    body: ReadableStream<Uint8Array>,
    options: LLMRequestOptions
  ): Promise<string> {
    const reader = body.getReader();
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
          if (!jsonPayload || jsonPayload === '[DONE]') {
            continue;
          }

          try {
            const parsed = JSON.parse(jsonPayload) as {
              candidates?: Array<{
                content?: {
                  parts?: Array<{ text?: string }>;
                };
              }>;
            };

            const textPart = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (textPart) {
              accumulatedText += textPart;
              options.onChunk?.(textPart);
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
        message: 'Chave de API do Gemini não configurada (aprendeai.gemini.apiKey)'
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}?key=${encodeURIComponent(this.apiKey.trim())}`;
      const res = await fetch(endpoint, {
        method: 'GET',
        signal: controller.signal
      }).finally(() => clearTimeout(timeoutId));

      if (res.ok) {
        return {
          ok: true,
          message: `Google Gemini conectado (${this.model})`
        };
      }

      // Se o modelo estiver sobrecarregado (503), ainda assim a chave é válida!
      if (res.status === 503) {
        return {
          ok: true,
          message: `Google Gemini autenticado (${this.model} - alta demanda temporária)`
        };
      }

      const errText = await res.text().catch(() => '');
      return {
        ok: false,
        message: `Falha na autenticação do Gemini (${res.status}): ${errText || res.statusText}`
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        message: `Erro ao testar conexão com Gemini: ${msg}`
      };
    }
  }
}
