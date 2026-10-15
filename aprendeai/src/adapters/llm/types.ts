import { LLMProviderType } from '../../shared/messages';

export type LLMRole = 'system' | 'user' | 'assistant';

export interface LLMMessage {
  role: LLMRole;
  content: string;
}

export interface LLMStreamChunk {
  content: string;
  done?: boolean;
}

export interface LLMRequestOptions {
  messages: LLMMessage[];
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
  onChunk?: (chunk: string) => void;
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
}

export interface ILLMProvider {
  readonly id: LLMProviderType;
  readonly name: string;
  streamChat(options: LLMRequestOptions): Promise<string>;
  testConnection(): Promise<ConnectionTestResult>;
}
