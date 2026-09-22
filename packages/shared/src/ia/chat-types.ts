/**
 * Types du dialogue OpenAI-compatible partages par le transport IA (#998) et
 * la boucle agentique (#1004). Types seuls : aucun import, aucun code.
 */

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface OpenAIResponse {
  choices: { message: ChatMessage }[];
}

export type PostChat = (body: Record<string, unknown>) => Promise<OpenAIResponse>;
