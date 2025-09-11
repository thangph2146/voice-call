interface Conversation {
    id: string; // Unique ID for react rendering and logging purposes
    role: string; // "user" | "assistant"
    text: string; // User or assistant message content (accumulated for streaming)
    timestamp: string; // ISO string for message time
    isFinal: boolean; // Whether the message is finalized
    status?: "speaking" | "processing" | "final"; // Real-time lifecycle status
    metadata?: any; // Optional provider-specific metadata (e.g. usage, tokens, latency)
  }
  
  export type { Conversation };
  