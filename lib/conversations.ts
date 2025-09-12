interface ProviderUsageMeta {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  latency?: number;
  [k: string]: unknown;
}

interface Conversation {
  id: string; // Unique ID for react rendering and logging purposes
  role: string; // "user" | "assistant"
  text: string; // User or assistant message content (accumulated for streaming)
  timestamp: string; // ISO string for message time
  isFinal: boolean; // Whether the message is finalized
  status?: "speaking" | "processing" | "final"; // Real-time lifecycle status
  metadata?: ProviderUsageMeta | Record<string, unknown>; // Optional provider-specific metadata
}
  
  export type { Conversation };
  