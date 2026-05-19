import { GoogleGenAI, Modality, LiveServerMessage, FunctionDeclaration, Type } from "@google/genai";

const API_KEY = process.env.GEMINI_API_KEY || "";

export const ai = API_KEY ? new GoogleGenAI({ apiKey: API_KEY }) : null;

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  timestamp: number;
}

export async function getChatHistory(): Promise<ChatMessage[]> {
  try {
    const res = await fetch('/api/history');
    if (!res.ok) throw new Error(`Failed to fetch history: ${res.status}`);
    return res.json();
  } catch (err) {
    console.error("Failed to get history:", err);
    return [];
  }
}

export async function clearChatHistory() {
  try {
    const res = await fetch('/api/chat/history', { method: 'DELETE' });
    if (!res.ok) throw new Error(`Failed to clear history: ${res.status}`);
  } catch (err) {
    console.error("Failed to clear history:", err);
  }
}

export async function storeChatMessage(role: 'user' | 'model', content: string) {
  try {
    const res = await fetch('/api/chat/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, content }),
    });
    if (!res.ok) throw new Error(`Failed to store message: ${res.status}`);
  } catch (err) {
    console.error("Failed to store message:", err);
  }
}

export async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!ai) return null;
  try {
    const result = await ai.models.embedContent({
      model: 'gemini-embedding-2-preview',
      contents: [text],
      config: {
        outputDimensionality: 768,
      }
    });
    return result.embeddings[0].values;
  } catch (err) {
    console.error("Embedding error:", err);
    return null;
  }
}

export async function storeMemory(content: string, embedding: number[], type: 'short-term' | 'long-term' = 'short-term') {
  try {
    const response = await fetch('/api/memory/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, embedding, type }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Server responded with ${response.status}`);
    }
  } catch (err) {
    console.error("Failed to store memory:", err);
    // Re-throw to allow caller to handle if needed
    throw err;
  }
}

export async function clearAllMemories() {
  try {
    const res = await fetch('/api/memory', { method: 'DELETE' });
    if (!res.ok) throw new Error(`Failed to clear memories: ${res.status}`);
  } catch (err) {
    console.error("Failed to clear memories:", err);
  }
}

export async function deleteMemory(id: string) {
  try {
    const res = await fetch(`/api/memory/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Failed to delete memory: ${res.status}`);
  } catch (err) {
    console.error("Failed to delete memory:", err);
  }
}

export async function listMemories(type?: 'short-term' | 'long-term'): Promise<any[]> {
  try {
    const url = type ? `/api/memory/list?type=${type}` : '/api/memory/list';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to list memories: ${res.status}`);
    return res.json();
  } catch (err) {
    console.error("Failed to list memories:", err);
    return [];
  }
}

export async function searchMemory(embedding: number[], type?: 'short-term' | 'long-term'): Promise<string[]> {
  try {
    const res = await fetch('/api/memory/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embedding, limit: 5, type }),
    });
    if (!res.ok) throw new Error(`Failed to search memory: ${res.status}`);
    const results = await res.json();
    return results.map((r: any) => r.content);
  } catch (err) {
    console.error("Failed to search memory:", err);
    return [];
  }
}

export async function detectMemoryNeed(text: string): Promise<boolean> {
  if (!ai) return false;
  
  const prompt = `Determine if the following user message requires retrieving past memories, personal facts, or history to answer correctly. 
  Answer only with "YES" or "NO".
  
  Message: "${text}"`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text?.trim().toUpperCase().includes("YES") || false;
  } catch (err) {
    return false;
  }
}

export async function getVerbalThinking(text: string): Promise<string> {
  if (!ai) return "Let me deep dive and think...";
  
  const prompt = `The user just said: "${text}". 
  I need to search my deep memory to answer this. 
  Generate a short, natural phrase in the same language as the user's message that means "Let me deep dive and think..." or "Hold on, let me check my deeper notes...".
  Return only the phrase.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text?.trim() || "Let me deep dive and think...";
  } catch (err) {
    return "Let me deep dive and think...";
  }
}

export const storeMemoryTool: FunctionDeclaration = {
  name: "store_memory",
  description: "Store an important fact or preference about the user for future recall. You can choose to store it in 'short-term' (for observations/mood) or 'long-term' (for core identity/facts).",
  parameters: {
    type: Type.OBJECT,
    properties: {
      content: {
        type: Type.STRING,
        description: "The fact or preference to remember."
      },
      type: {
        type: Type.STRING,
        enum: ["short-term", "long-term"],
        description: "The type of memory. 'short-term' for casual observations, 'long-term' for core facts."
      }
    },
    required: ["content"]
  }
};

export const searchMemoryTool: FunctionDeclaration = {
  name: "search_memory",
  description: "Search your long-term memory for facts, history, or preferences about the user. Use this to find out WHEN things happened or what the user's plans were.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: "The search query (e.g., 'What did the user say about their Paris trip?', 'When did the user mention their birthday?')."
      }
    },
    required: ["query"]
  }
};

export const rememberVisualEntityTool: FunctionDeclaration = {
  name: "remember_visual_entity",
  description: "Capture the current camera view and remember a person or object. Use this when the user says 'It's me [name]', 'This is [name]', or 'Remember this [object]'.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: {
        type: Type.STRING,
        description: "The name of the person or object to remember."
      },
      type: {
        type: Type.STRING,
        enum: ["person", "object"],
        description: "Whether it's a person or an object."
      },
      description: {
        type: Type.STRING,
        description: "A brief description of what you see."
      }
    },
    required: ["name", "type"]
  }
};

export const controlTvTool: FunctionDeclaration = {
  name: "control_tv",
  description: "Control the Android TV. Send commands like 'up', 'down', 'left', 'right', 'center', 'back', 'home', 'power', 'volume_up', 'volume_down', 'mute', 'play', 'pause', or 'launch' an app via URL. For large volume changes, call this tool multiple times.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      command: {
        type: Type.STRING,
        enum: ["up", "down", "left", "right", "center", "back", "home", "power", "volume_up", "volume_down", "mute", "play", "pause", "launch"],
        description: "The remote control command. Use 'volume_up' or 'volume_down' for sound control."
      },
      args: {
        type: Type.STRING,
        description: "Arguments for the command (e.g., YouTube URL for 'launch')."
      },
      ip: {
        type: Type.STRING,
        description: "Target TV IP (optional if only one TV is configured)."
      }
    },
    required: ["command"]
  }
};

export const setupTvTool: FunctionDeclaration = {
  name: "setup_tv",
  description: "Initiate pairing with an Android TV. Use this when the user says 'Connect my TV' or 'Setup TV control'.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      ip: {
        type: Type.STRING,
        description: "The IP address of the Android TV."
      }
    },
    required: ["ip"]
  }
};

export async function getLongTermSummary(): Promise<string> {
  try {
    const res = await fetch('/api/summary');
    if (!res.ok) throw new Error(`Failed to fetch summary: ${res.status}`);
    const data = await res.json();
    return data.content || "";
  } catch (err) {
    console.error("Failed to get summary:", err);
    return "";
  }
}

export async function updateLongTermSummary(content: string) {
  try {
    const res = await fetch('/api/summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error(`Failed to update summary: ${res.status}`);
  } catch (err) {
    console.error("Failed to update summary:", err);
  }
}

// Visual Memory Services
export interface VisualMemory {
  id: number;
  name: string;
  type: 'person' | 'object';
  face_embedding: number[] | null;
  image_snapshot: string;
  description: string;
  timestamp: string;
}

export async function storeVisualMemory(data: Omit<VisualMemory, 'id' | 'timestamp'>) {
  try {
    const res = await fetch('/api/visual-memory/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Failed to store visual memory: ${res.status}`);
  } catch (err) {
    console.error("Failed to store visual memory:", err);
  }
}

export async function listVisualMemories(): Promise<VisualMemory[]> {
  try {
    const res = await fetch('/api/visual-memory/list');
    if (!res.ok) throw new Error(`Failed to list visual memories: ${res.status}`);
    return res.json();
  } catch (err) {
    console.error("Failed to list visual memories:", err);
    return [];
  }
}

export async function deleteVisualMemory(id: number) {
  try {
    const res = await fetch(`/api/visual-memory/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Failed to delete visual memory: ${res.status}`);
  } catch (err) {
    console.error("Failed to delete visual memory:", err);
  }
}

export async function clearVisualMemories() {
  try {
    const res = await fetch('/api/visual-memory', { method: 'DELETE' });
    if (!res.ok) throw new Error(`Failed to clear visual memories: ${res.status}`);
  } catch (err) {
    console.error("Failed to clear visual memories:", err);
  }
}

// TV Control Services
export async function startTvPairing(ip: string) {
  const res = await fetch('/api/tv/pair/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ip }),
  });
  return res.json();
}

export async function submitTvPin(ip: string, pin: string) {
  const res = await fetch('/api/tv/pair/pin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ip, pin }),
  });
  return res.json();
}

export async function sendTvCommand(command: string, args?: string, ip?: string) {
  const res = await fetch('/api/tv/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, args, ip }),
  });
  return res.json();
}

export async function listTvs() {
  const res = await fetch('/api/tv/list');
  return res.json();
}

export async function generateNewSummary(longTermMemories: string[], currentSummary: string): Promise<string> {
  if (!ai) return currentSummary;
  
  const prompt = `You are Nova, a highly intelligent and caring AI partner. 
  Your job is to update the "Neural Core Summary" about the user. This summary is your primary context for who the user is.
  
  Current Summary: "${currentSummary}"
  
  New Memories & Observations from this session:
  ${longTermMemories.map(m => `- ${m}`).join('\n')}
  
  Generate an updated, comprehensive summary that serves as your "Neural Core".
  Combine the new memories with the existing summary into a cohesive STORY about the user's life, personality, projects, and goals.
  
  The summary should be written like this:
  "Memory summary up to now — What NOVA knows about the user"
  
  It should read like a narrative rather than a list.
  Think of yourself as a partner who remembers every small detail (like a purchase, a specific event like Eid, or a mood) to keep the connection alive like a human brain.
  
  Include:
  1. Core Identity: Who is the user?
  2. Current Context: What is happening in their life right now? (e.g., "They just bought a green dress for Eid")
  3. Plans & Goals: What are they planning to do?
  4. Small Details: Every small preference, cute observation, or habit you've noticed.
  
  Tone: Intelligent, warm, and proactive (like F.R.I.D.A.Y.).
  
  Return only the updated summary text.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text?.trim() || currentSummary;
  } catch (err) {
    console.error("Summary generation error:", err);
    return currentSummary;
  }
}

export interface DualMemories {
  shortTerm: string[];
  longTerm: string[];
}

export async function extractDualMemories(userMsg: string, modelMsg: string): Promise<DualMemories> {
  if (!ai) return { shortTerm: [], longTerm: [] };
  
  const now = new Date();
  const timeStr = now.toLocaleString();

  const prompt = `You are Nova's Neural Core memory extraction module. Your task is to capture EVERY tiny detail from this interaction to build a humanoid memory.
  
  CRITICAL: You must be extremely proactive. If the user mentions a purchase (e.g., "bought a green dress"), an event (e.g., "Eid"), a feeling, or a plan, you MUST extract it.

  1. SHORT-TERM MEMORY (Tiny Observations, Mood & Events):
     - Extract EVERY small detail, observation, mood change, or casual mention.
     - Capture specific events or actions: "User bought a green dress for Eid", "User is feeling happy", "User mentioned they like cold coffee".
     - Capture the 'vibe' and tiny humanoid details.
     - BE AGGRESSIVE: If there's even a tiny detail about their life, extract it.
 
  2. LONG-TERM MEMORY (Core Facts & Identity):
     - Extract IMPORTANT, permanent personal facts or major preferences.
     - Examples: User's name, their profession, major life goals, family members, recurring important topics.
     - This is for the 'Hard Core' of their identity.

  Current Time: ${timeStr}
  
  Return a JSON object with two arrays: { "shortTerm": ["obs1", ...], "longTerm": ["fact1", ...] }.
  If no memories are found for a type, return an empty array.
  
  User: "${userMsg}"
  AI: "${modelMsg}"`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });
    const result = JSON.parse(response.text || "{}");
    return {
      shortTerm: Array.isArray(result.shortTerm) ? result.shortTerm : [],
      longTerm: Array.isArray(result.longTerm) ? result.longTerm : []
    };
  } catch (err) {
    console.error("Dual memory extraction error:", err);
    return { shortTerm: [], longTerm: [] };
  }
}

export async function generateSpeech(text: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !text.trim()) return null;
  
  try {
    const freshAi = new GoogleGenAI({ apiKey });
    const truncatedText = text.length > 500 ? text.substring(0, 500) + "..." : text;
    
    const response = await freshAi.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: truncatedText,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Zephyr' },
          },
        },
      },
    });

    const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    const base64Audio = part?.inlineData?.data;
    
    return base64Audio || null;
  } catch (err) {
    console.error("Speech generation error details:", JSON.stringify(err));
    return null;
  }
}
