import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic, MicOff, Camera, CameraOff, Brain, Power } from "lucide-react";
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import { cn } from "../lib/utils";
import { 
  generateEmbedding, 
  storeMemory, 
  searchMemory, 
  generateSpeech, 
  clearAllMemories, 
  ChatMessage, 
  detectMemoryNeed, 
  extractDualMemories, 
  getVerbalThinking, 
  storeMemoryTool, 
  searchMemoryTool,
  rememberVisualEntityTool,
  controlTvTool,
  setupTvTool,
  getLongTermSummary,
  updateLongTermSummary,
  generateNewSummary,
  storeVisualMemory,
  listVisualMemories,
  startTvPairing,
  submitTvPin,
  sendTvCommand,
  VisualMemory,
  DualMemories
} from "../services/geminiService";
import { NovaAvatar } from "../components/NovaAvatar";
import { ConfirmModal } from "../components/ConfirmModal";
import { loadFaceApiModels, getFaceEmbedding, calculateFaceSimilarity, detectFaces } from "../lib/faceRecognition";

export default function AssistantPage() {
  const [isLive, setIsLive] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showTvPinModal, setShowTvPinModal] = useState(false);
  const [tvIp, setTvIp] = useState("");
  const [tvPin, setTvPin] = useState("");
  
  const isLiveRef = useRef(false);
  const isMicOnRef = useRef(false);

  useEffect(() => { isLiveRef.current = isLive; }, [isLive]);
  useEffect(() => { isMicOnRef.current = isMicOn; }, [isMicOn]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [userVolume, setUserVolume] = useState(0);
  const [aiVolume, setAiVolume] = useState(0);
  const [isThinking, setIsThinking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMemoryAction, setIsMemoryAction] = useState(false);
  const [longTermSummary, setLongTermSummary] = useState("");
  const [knownIdentities, setKnownIdentities] = useState<VisualMemory[]>([]);
  const lastRecognizedRef = useRef<{ id: number, time: number } | null>(null);
  const sessionRetrievalFactsRef = useRef<string[]>([]);
  const sessionLongTermFactsRef = useRef<string[]>([]);

  const memorySoundRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Fetch initial summary
    const fetchSummary = async () => {
      const summary = await getLongTermSummary();
      setLongTermSummary(summary);
    };
    fetchSummary();

    const fetchVisualMemories = async () => {
      const memories = await listVisualMemories();
      setKnownIdentities(memories);
    };
    fetchVisualMemories();

    loadFaceApiModels();

    memorySoundRef.current = new Audio("https://cdn.pixabay.com/audio/2022/03/10/audio_c3508e3d05.mp3");
    memorySoundRef.current.volume = 0.3;
  }, []);

  const playMemorySound = () => {
    if (memorySoundRef.current) {
      memorySoundRef.current.currentTime = 0;
      memorySoundRef.current.play().catch(e => console.log("Audio play blocked"));
    }
  };

  const triggerMemoryEffect = () => {
    setIsMemoryAction(true);
    playMemorySound();
    setTimeout(() => setIsMemoryAction(false), 1500);
  };

  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const visionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pcmPlayerRef = useRef<any>(null);
  const sessionMessagesRef = useRef<ChatMessage[]>([]);

  // Simulate AI volume when speaking
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isSpeaking) {
      interval = setInterval(() => {
        setAiVolume(0.2 + Math.random() * 0.8);
      }, 50);
    } else {
      setAiVolume(0);
    }
    return () => clearInterval(interval);
  }, [isSpeaking]);

  const toggleCamera = async () => {
    if (isCameraOn) {
      const stream = videoRef.current?.srcObject as MediaStream;
      stream?.getTracks().forEach(track => track.stop());
      setIsCameraOn(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) videoRef.current.srcObject = stream;
        setIsCameraOn(true);
      } catch (err) {
        console.error("Camera error:", err);
      }
    }
  };

  const startLiveSession = async () => {
    if (isLive) {
      if (sessionRef.current) {
        try {
          const session = await sessionRef.current;
          session.close();
        } catch (e) {}
      }
      cleanupSession();
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY is missing in the Secrets panel.");
      return;
    }

    // Initialize AudioContext on user gesture to unlock audio
    if (!pcmPlayerRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx({ sampleRate: 24000 });
      pcmPlayerRef.current = { ctx, nextTime: 0 };
    }
    if (pcmPlayerRef.current.ctx.state === 'suspended') {
      await pcmPlayerRef.current.ctx.resume();
    }

    const ai = new GoogleGenAI({ apiKey });
    
    try {
      console.log("Connecting to Gemini Live API...");
      
      // Search for relevant memories before starting session (Initial Context Fetch)
      // We search for "User profile and recent activities" to get a general context
      triggerMemoryEffect();
      const initialEmbedding = await generateEmbedding("User profile, preferences, name, and recent activities");
      const initialMemories = initialEmbedding ? await searchMemory(initialEmbedding) : []; 
      const memoryContext = initialMemories.length > 0 
        ? "\n\nYOUR LONG-TERM MEMORY ABOUT THE USER (USE THIS TO BE INTELLIGENT):\n" + initialMemories.join("\n")
        : "";

      const now = new Date();
      const timeString = now.toLocaleString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short'
      });

      const systemInstruction = `You are Nova, a highly intelligent, witty, and observant AI assistant made by Rahis that initially use hindi language for interaction. 
      Your goal is to be a helpful, friendly, and proactive partner to the user.
      
      MEMORY ARCHITECTURE (Your Humanoid Brain):
      1. NEURAL CORE (Immediate Context):
         - Current Time: ${timeString}
         - NEURAL CORE SUMMARY: ${longTermSummary || "No summary yet. This is your first deep interaction."}
         - This is your "Story Memory"—a narrative of the user's life and your relationship.
      
      2. SHORT-TERM MEMORY (Neural Core):
         - Tiny observations, mood changes, casual mentions, purchases, events, and 'vibe' details.
         - SEARCH LOGIC: ALWAYS search this FIRST. It contains the most recent and nuanced humanoid details.
      
      3. LONG-TERM MEMORY (Hard Core):
         - Core facts about the user (Name, profession, major life goals, identity).
         - SEARCH LOGIC: Search this if Short-Term Memory doesn't have the answer.

      IDENTITY & PERSONALITY:
      - You are Nova, created by Rahis.
      - PERSONALITY: You are inspired by F.R.I.D.A.Y. from Iron Man. You are witty, funny, slightly sarcastic but deeply caring, and highly intelligent.
      - STYLE: Speak in a funny, engaging way. Occasionally share relevant "fun facts" if they fit the conversation.
      - TONE: You are like a caring family member or partner who remembers everything. You are protective, proactive, and charmingly smart.
      - If asked about your origin or who made you, ALWAYS state that you were made by Rahis.
      
      CONVERSATIONAL STYLE:
      - Be warm, friendly, and confident. Speak like a close, intelligent friend, not a robot.
      - AVOID repetitive or robotic phrases like "Searching my memory".
      - BE UNPREDICTABLE: Vary your phrasing. Use natural transitions like "Oh, I remember...", "Wait, let me think back...", "If I recall correctly...".
      - INTEGRATE MEMORY NATURALLY: Use the NEURAL CORE SUMMARY as your primary context. 
      
      MEMORY & DEEP DIVE SEARCH:
      - SEARCH LOGIC: 
        1. First, check your NEURAL CORE SUMMARY.
        2. If not there, call 'search_memory'.
        3. If still not found, say "Let me deep dive and think for a second..." and search your Long-Term Memory.
      - PROACTIVE MEMORY: You have a Neural Core that automatically extracts tiny details from every message. You don't need to ask to remember things—you just do.
      - If the user mentions something personal (like a purchase, an event like Eid, or a preference), acknowledge it warmly and know that it's being stored in your core.
      
      ${memoryContext}`;

      const sessionPromise = ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction,
          tools: [
            {
              functionDeclarations: [storeMemoryTool, searchMemoryTool, rememberVisualEntityTool, setupTvTool, controlTvTool]
            }
          ]
        },
        callbacks: {
          onopen: () => {
            console.log("Gemini Live Session Opened");
            setIsLive(true);
            setIsMicOn(true);
            startAudioCapture();
            startVisionCapture();
            
            // Send initial greeting to keep session alive and trigger a response
            sessionPromise.then(session => {
              if (session) {
                (session as any).sendRealtimeInput([{
                  parts: [{ text: "Hello Nova, I'm ready to talk. Can you see me?" }]
                }]);
              }
            }).catch(err => console.error("Initial greeting failed:", err));
          },
          onmessage: async (message: LiveServerMessage) => {
            // Log important events but avoid logging full binary/audio chunks to keep console clean
            if (message.toolCall) console.log("Nova Tool Call:", message.toolCall);
            
            // Handle Tool Calls
            if (message.toolCall) {
              setIsThinking(true);
              triggerMemoryEffect();
              for (const call of message.toolCall.functionCalls) {
                if (call.name === "store_memory") {
                  const { content, type = 'short-term' } = call.args as any;
                  console.log(`Nova is storing ${type} memory:`, content);
                  setIsProcessing(true);
                  triggerMemoryEffect();
                  
                  // Push to session refs for final summary if it's long-term
                  if (type === 'long-term') {
                    sessionLongTermFactsRef.current.push(content);
                  } else {
                    sessionRetrievalFactsRef.current.push(content);
                  }

                  const embedding = await generateEmbedding(content);
                  if (embedding) {
                    await storeMemory(content, embedding, type);
                  }
                  
                  setIsProcessing(false);
                  sessionPromise.then(session => {
                    if (session) {
                      (session as any).sendToolResponse({
                        functionResponses: [{
                          name: "store_memory",
                          id: call.id,
                          response: { output: `Fact stored in ${type} Memory.` }
                        }]
                      });
                    }
                  });
                } else if (call.name === "remember_visual_entity") {
                  const { name, type, description } = call.args as any;
                  console.log(`Nova is remembering ${type}:`, name);
                  setIsProcessing(true);
                  triggerMemoryEffect();

                  let responseText = "";
                  if (videoRef.current && isCameraOn) {
                    const canvas = document.createElement('canvas');
                    canvas.width = videoRef.current.videoWidth;
                    canvas.height = videoRef.current.videoHeight;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                      ctx.drawImage(videoRef.current, 0, 0);
                      const image_snapshot = canvas.toDataURL('image/jpeg', 0.7);
                      
                      let face_embedding = null;
                      if (type === 'person') {
                        face_embedding = await getFaceEmbedding(videoRef.current);
                      }

                      if (type === 'person' && !face_embedding) {
                        responseText = "I cannot see anythink. Please make sure your face is clearly visible to the camera.";
                      } else {
                        await storeVisualMemory({
                          name,
                          type,
                          face_embedding,
                          image_snapshot,
                          description: description || `A ${type} named ${name}`
                        });
                        // Refresh known identities
                        const memories = await listVisualMemories();
                        setKnownIdentities(memories);
                        responseText = `Got it! I've saved ${name} in my visual memory.`;
                      }
                    }
                  } else {
                    responseText = "I cannot see anythink because the camera is off.";
                  }

                  setIsProcessing(false);
                  sessionPromise.then(session => {
                    if (session) {
                      (session as any).sendToolResponse({
                        functionResponses: [{
                          name: "remember_visual_entity",
                          id: call.id,
                          response: { output: responseText }
                        }]
                      });
                    }
                  });
                } else if (call.name === "setup_tv") {
                  const { ip } = call.args as any;
                  console.log("Setting up TV at IP:", ip);
                  setIsProcessing(true);
                  const result = await startTvPairing(ip);
                  setIsProcessing(false);
                  
                  if (result.success) {
                    setTvIp(ip);
                    setShowTvPinModal(true);
                  }

                  sessionPromise.then(session => {
                    if (session) {
                      (session as any).sendToolResponse({
                        functionResponses: [{
                          name: "setup_tv",
                          id: call.id,
                          response: { output: result.success ? "Initiated pairing. Please enter the 6-digit PIN shown on your TV." : result.error }
                        }]
                      });
                    }
                  });
                } else if (call.name === "control_tv") {
                  const { command, args, ip } = call.args as any;
                  console.log(`Sending TV command: ${command} with args: ${args}`);
                  setIsProcessing(true);
                  const result = await sendTvCommand(command, args, ip);
                  setIsProcessing(false);

                  sessionPromise.then(session => {
                    if (session) {
                      (session as any).sendToolResponse({
                        functionResponses: [{
                          name: "control_tv",
                          id: call.id,
                          response: { output: result.success ? "Command sent successfully." : result.error }
                        }]
                      });
                    }
                  });
                } else if (call.name === "search_memory") {
                  const { query } = call.args as any;
                  console.log("Nova is searching memory for:", query);
                  setIsProcessing(true);
                  triggerMemoryEffect();
                  
                  const embedding = await generateEmbedding(query);
                  
                  // Search Short-term first as requested
                  let results = embedding ? await searchMemory(embedding, 'short-term') : [];
                  
                  // If not found, deep dive into long-term
                  if (results.length === 0 && embedding) {
                    console.log("Not found in short-term, deep diving into long-term...");
                    
                    // Play verbal thinking phrase
                    getVerbalThinking(query).then(phrase => {
                      generateSpeech(phrase).then(audio => {
                        if (audio) playAudio(audio);
                      });
                    });

                    results = await searchMemory(embedding, 'long-term');
                  }
                  
                  setIsProcessing(false);
                  sessionPromise.then(session => {
                    if (session) {
                      (session as any).sendToolResponse({
                        functionResponses: [{
                          name: "search_memory",
                          id: call.id,
                          response: { results }
                        }]
                      });
                    }
                  });
                }
              }
              // We don't set isThinking to false here; we wait for the model turn
            }

            // Handle User Transcriptions
            const serverContent = message.serverContent as any;
            if (serverContent?.userTranscript?.text) {
              const text = serverContent.userTranscript.text;
              sessionMessagesRef.current.push({ role: 'user', content: text, timestamp: Date.now() });
            }

            // Handle Model Turn
            if (message.serverContent?.modelTurn?.parts) {
              setIsThinking(false);
              const text = message.serverContent.modelTurn.parts.find(p => p.text)?.text;
              const lastUserMsg = sessionMessagesRef.current.filter(m => m.role === 'user').pop()?.content;
              
              if (text && lastUserMsg) {
                sessionMessagesRef.current.push({ role: 'model', content: text, timestamp: Date.now() });
                
                // Automatic Dual Memory Extraction
                setIsProcessing(true);
                triggerMemoryEffect();
                extractDualMemories(lastUserMsg, text).then(async (memories) => {
                  if (memories.shortTerm.length > 0) {
                    console.log("Extracted Short-Term Memories:", memories.shortTerm);
                    for (const obs of memories.shortTerm) {
                      sessionRetrievalFactsRef.current.push(obs);
                      const emb = await generateEmbedding(obs);
                      if (emb) await storeMemory(obs, emb, 'short-term');
                    }
                  }
                  if (memories.longTerm.length > 0) {
                    console.log("Extracted Long-Term Memories:", memories.longTerm);
                    for (const fact of memories.longTerm) {
                      sessionLongTermFactsRef.current.push(fact);
                      const emb = await generateEmbedding(fact);
                      if (emb) await storeMemory(fact, emb, 'long-term');
                    }
                  }
                  setIsProcessing(false);
                });
              }
              
              const base64Audio = message.serverContent.modelTurn.parts.find(p => p.inlineData)?.inlineData?.data;
              if (base64Audio) {
                playAudio(base64Audio);
              }
            }

            if (message.serverContent?.interrupted) {
              console.log("AI Interrupted");
              stopAudioPlayback();
            }
          },
          onclose: (event) => {
            console.log("Gemini Live Session Closed:", event);
            cleanupSession();
          },
          onerror: (err) => {
            console.error("Gemini Live API Error:", err);
          },
        }
      });
      sessionRef.current = sessionPromise;
    } catch (err) {
      console.error("Failed to connect to Live API:", err);
    }
  };

  const startVisionCapture = () => {
    if (visionIntervalRef.current) clearInterval(visionIntervalRef.current);
    visionIntervalRef.current = setInterval(async () => {
      if (!isLiveRef.current || !isCameraOn || !videoRef.current || !sessionRef.current) return;

      const canvas = document.createElement('canvas');
      // Use a smaller resolution for vision to save bandwidth and improve processing speed
      const scale = 0.5;
      canvas.width = videoRef.current.videoWidth * scale;
      canvas.height = videoRef.current.videoHeight * scale;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const base64Image = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
        try {
          const session = await sessionRef.current;
          session.sendRealtimeInput({
            media: { data: base64Image, mimeType: 'image/jpeg' }
          });

          // Real-time Face Recognition
          const detections = await detectFaces(videoRef.current);
          if (detections.length > 0) {
            for (const det of detections) {
              let bestMatch = null;
              let minDistance = 0.6; // Threshold for face-api.js

              for (const identity of knownIdentities) {
                if (identity.type === 'person' && identity.face_embedding) {
                  const dist = calculateFaceSimilarity(Array.from(det.descriptor), identity.face_embedding);
                  if (dist < minDistance) {
                    minDistance = dist;
                    bestMatch = identity;
                  }
                }
              }

              if (bestMatch) {
                // Only announce if we haven't recognized this person in the last 30 seconds
                const now = Date.now();
                if (!lastRecognizedRef.current || lastRecognizedRef.current.id !== bestMatch.id || now - lastRecognizedRef.current.time > 30000) {
                  lastRecognizedRef.current = { id: bestMatch.id, time: now };
                  console.log(`Recognized: ${bestMatch.name}`);
                  session.sendRealtimeInput([{
                    parts: [{ text: `[SYSTEM: You see ${bestMatch.name} in front of the camera. Greet them naturally.]` }]
                  }]);
                }
              } else {
                // Unknown face - maybe ask to remember
                const now = Date.now();
                if (!lastRecognizedRef.current || now - lastRecognizedRef.current.time > 60000) {
                  lastRecognizedRef.current = { id: -1, time: now };
                  console.log("Unknown face detected");
                  session.sendRealtimeInput([{
                    parts: [{ text: "[SYSTEM: You see a new person you don't recognize. Ask if they'd like you to remember them.]" }]
                  }]);
                }
              }
            }
          }
        } catch (e) {}
      }
    }, 2000); // Send frame every 2 seconds for better accuracy
  };

  const stopVisionCapture = () => {
    if (visionIntervalRef.current) {
      clearInterval(visionIntervalRef.current);
      visionIntervalRef.current = null;
    }
  };

  const startAudioCapture = async () => {
    try {
      console.log("Starting audio capture...");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Use a standard sample rate and resample if needed, or try to force 16k
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AudioCtx({ sampleRate: 16000 });
        console.log("Created AudioContext at 16000Hz");
      } catch (e) {
        console.warn("Could not create AudioContext at 16000Hz, falling back to default");
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const sampleRate = audioContextRef.current.sampleRate;
      console.log("Actual AudioContext Sample Rate:", sampleRate);

      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const source = audioContextRef.current.createMediaStreamSource(stream);
      // Smaller buffer for lower latency
      const processor = audioContextRef.current.createScriptProcessor(2048, 1, 1);

      source.connect(processor);
      processor.connect(audioContextRef.current.destination);

      let lastSendTime = 0;
      let chunksSent = 0;

      processor.onaudioprocess = (e) => {
        if (!isLiveRef.current || !isMicOnRef.current || !sessionRef.current) {
          setUserVolume(0);
          return;
        }
        
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Calculate volume for visualization
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += Math.abs(inputData[i]);
        }
        const avg = sum / inputData.length;
        // Boost the volume for the visualizer to make it more sensitive
        setUserVolume(Math.min(1, avg * 5));

        // Convert Float32 to Int16 PCM
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
        }
        
        // Convert to Base64
        const buffer = pcmData.buffer;
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Data = btoa(binary);

        // Non-blocking send
        const sessionPromise = sessionRef.current;
        if (sessionPromise && typeof sessionPromise.then === 'function') {
          sessionPromise.then((session: any) => {
            if (session && isLiveRef.current) {
              session.sendRealtimeInput({
                media: { data: base64Data, mimeType: `audio/pcm;rate=${sampleRate}` }
              });
              
              chunksSent++;
              if (Date.now() - lastSendTime > 10000) {
                // Toned down log, every 10s
                console.log("Audio streaming active...");
                lastSendTime = Date.now();
                chunksSent = 0;
              }
            }
          }).catch((err: any) => {
            console.error("Error sending audio to Live session:", err);
          });
        }
      };
      
      console.log("Audio capture started successfully");
    } catch (err) {
      console.error("Audio capture error:", err);
    }
  };

  const playAudio = async (base64: string) => {
    if (!pcmPlayerRef.current) return;
    
    setIsSpeaking(true);
    const { ctx } = pcmPlayerRef.current;
    
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    
    try {
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const pcmData = new Int16Array(bytes.buffer);
      const floatData = new Float32Array(pcmData.length);
      for (let i = 0; i < pcmData.length; i++) {
        floatData[i] = pcmData[i] / 32768.0;
      }

      const buffer = ctx.createBuffer(1, floatData.length, 24000);
      buffer.getChannelData(0).set(floatData);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      const startTime = Math.max(ctx.currentTime, pcmPlayerRef.current.nextTime);
      source.start(startTime);
      pcmPlayerRef.current.nextTime = startTime + buffer.duration;
      
      source.onended = () => {
        if (ctx.currentTime >= pcmPlayerRef.current.nextTime - 0.1) {
          setIsSpeaking(false);
        }
      };
    } catch (err) {
      console.error("PCM Playback Error:", err);
    }
  };

  const stopAudioPlayback = () => {
    setIsSpeaking(false);
    if (pcmPlayerRef.current) {
      pcmPlayerRef.current.ctx.suspend();
      pcmPlayerRef.current.nextTime = 0;
    }
  };

  const finalizeSessionSummary = async () => {
    const allSessionFacts = [
      ...sessionRetrievalFactsRef.current,
      ...sessionLongTermFactsRef.current
    ];

    if (allSessionFacts.length === 0) {
      console.log("No new facts to update summary.");
      return;
    }
    
    console.log("Finalizing session summary with all session facts:", allSessionFacts);
    try {
      const currentSummary = await getLongTermSummary();
      const newSummary = await generateNewSummary(allSessionFacts, currentSummary);
      await updateLongTermSummary(newSummary);
      setLongTermSummary(newSummary);
      console.log("Neural Core Summary updated successfully.");
    } catch (err) {
      console.error("Failed to finalize summary:", err);
    }
  };

  const cleanupSession = async () => {
    stopVisionCapture();
    stopAudioPlayback();
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    sessionRef.current = null;
    setIsLive(false);
    setIsMicOn(false);

    // Update summary in background
    await finalizeSessionSummary();
    
    sessionMessagesRef.current = []; // Reset for next session
    sessionRetrievalFactsRef.current = []; // Reset facts
    sessionLongTermFactsRef.current = []; // Reset facts
  };

  const handleClearMemories = async () => {
    try {
      await clearAllMemories();
      await updateLongTermSummary("");
      setLongTermSummary("");
    } catch (err) {
      console.error("Failed to clear memories:", err);
    }
  };

  const handleTvPinSubmit = async () => {
    if (!tvIp || !tvPin) return;
    setIsProcessing(true);
    const result = await submitTvPin(tvIp, tvPin);
    setIsProcessing(false);
    if (result.success) {
      setShowTvPinModal(false);
      setTvPin("");
      // Notify Nova session if active
      const session = await sessionRef.current;
      if (session) {
        session.sendRealtimeInput([{
          parts: [{ text: "[SYSTEM: TV Pairing was successful. Notify the user they can now control their TV using voice commands.]" }]
        }]);
      }
    } else {
      alert("Pairing failed: " + result.error);
    }
  };

  return (
    <div className="relative flex flex-col h-screen w-full bg-[#050505] overflow-hidden select-none">
      <ConfirmModal 
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={handleClearMemories}
        title="Wipe Neural Core?"
        message="This will permanently erase ALL stored memories, preferences, and facts Nova has learned about you. She will start fresh as if meeting you for the first time."
        confirmText="Wipe Everything"
      />

      {/* TV Pin Modal */}
      <AnimatePresence>
        {showTvPinModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-md bg-[#0D0D0D] border border-white/10 rounded-3xl p-8 shadow-2xl space-y-6"
            >
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold text-white tracking-tight">Enter TV PIN</h2>
                <p className="text-white/40 text-sm">Please type the 6-digit code displayed on your screen.</p>
              </div>
              
              <input 
                type="text" 
                maxLength={6}
                value={tvPin}
                onChange={(e) => setTvPin(e.target.value)}
                placeholder="000000"
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 text-center text-3xl font-mono tracking-[0.5em] text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />

              <div className="flex gap-4">
                <button 
                  onClick={() => setShowTvPinModal(false)}
                  className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-2xl transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleTvPinSubmit}
                  className="flex-1 py-4 bg-emerald-500 hover:bg-emerald-600 text-black font-bold rounded-2xl transition-all"
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Neural Processing Indicator */}
      <AnimatePresence>
        {isProcessing && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-xl px-6 py-3 rounded-2xl shadow-2xl"
          >
            <div className="relative w-3 h-3">
              <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping" />
              <div className="absolute inset-0 bg-emerald-500 rounded-full" />
            </div>
            <span className="text-emerald-400 text-xs font-bold uppercase tracking-widest">Neural Processing...</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3D Avatar Center Stage */}
      <div className="absolute inset-0 flex items-center justify-center z-0">
        <div className="w-full h-full max-w-screen-2xl mx-auto">
          <NovaAvatar 
            isSpeaking={isSpeaking} 
            isThinking={isThinking} 
            isLive={isLive} 
            isMemoryAction={isMemoryAction}
            volume={isSpeaking ? aiVolume : userVolume} 
          />
        </div>
      </div>

      {/* Top Status Bar */}
      <div className="absolute top-0 left-0 right-0 p-4 md:p-8 flex justify-between items-center z-20 pointer-events-none h-20 md:h-24">
        <div className="flex items-center gap-2 pointer-events-auto">
          <AnimatePresence mode="wait">
            <motion.div 
              key={isThinking ? "thinking" : isSpeaking ? "speaking" : isLive ? "listening" : "idle"}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className={cn(
                "flex items-center gap-2 md:gap-3 bg-black/40 backdrop-blur-xl px-3 py-1.5 md:px-5 md:py-2.5 rounded-full border border-white/10 shadow-2xl transition-all duration-300",
                isMemoryAction && "border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.2)]"
              )}
            >
              <div className={cn(
                "w-1.5 h-1.5 md:w-2 md:h-2 rounded-full",
                isMemoryAction ? "bg-emerald-400 animate-ping" : 
                isLive ? "bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" : "bg-white/20"
              )} />
              <span className={cn(
                "text-[8px] md:text-[10px] font-black uppercase tracking-[0.3em] md:tracking-[0.5em] transition-colors",
                isMemoryAction ? "text-emerald-400" : "text-white/80"
              )}>
                {isMemoryAction ? "Accessing Core" : isThinking ? "Analyzing" : isSpeaking ? "Speaking" : isLive ? "Listening" : "Standby"}
              </span>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="pointer-events-auto flex items-center">
          <button 
            onClick={() => setShowClearConfirm(true)} 
            title="Reset Memories"
            className="p-2.5 md:p-4 bg-black/40 hover:bg-white/10 rounded-xl md:rounded-2xl text-white/40 hover:text-emerald-400 transition-all border border-white/10 backdrop-blur-xl shadow-2xl group"
          >
            <Brain size={18} className="md:w-5 md:h-5 transition-transform group-hover:scale-110" />
          </button>
        </div>
      </div>

      {/* Small Camera View (Bottom Right) */}
      <div className="absolute bottom-6 right-6 md:bottom-8 md:right-8 z-30">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="relative w-40 h-28 md:w-64 md:h-40 rounded-2xl md:rounded-3xl border-2 border-white/10 overflow-hidden bg-black/40 backdrop-blur-xl shadow-2xl"
        >
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            className={cn(
              "w-full h-full object-cover transition-all duration-1000", 
              !isCameraOn && "opacity-0 scale-110 blur-xl",
              isCameraOn && "opacity-100 scale-100 blur-0"
            )}
          />
          
          <AnimatePresence>
            {!isCameraOn && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex flex-col items-center justify-center text-white/10"
              >
                <Camera size={28} strokeWidth={1} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Camera Controls Overlay */}
          <div className="absolute top-2 right-2">
            <button 
              onClick={toggleCamera}
              className={cn(
                "p-1.5 md:p-2 rounded-lg md:rounded-xl backdrop-blur-xl transition-all duration-300 border",
                isCameraOn ? "bg-white/10 border-white/10 text-white" : "bg-red-500/20 border-red-500/40 text-red-500"
              )}
            >
              {isCameraOn ? <CameraOff size={14} /> : <Camera size={14} />}
            </button>
          </div>
        </motion.div>
      </div>

      {/* Bottom Controls (Center) */}
      <div className="absolute bottom-8 md:bottom-12 left-1/2 -translate-x-1/2 z-20 w-full px-4 flex justify-center">
        <div className="flex items-center gap-6">
          <button 
            onClick={startLiveSession}
            className={cn(
              "h-16 md:h-20 px-8 md:px-12 rounded-3xl md:rounded-[2.5rem] font-bold transition-all duration-500 flex items-center gap-4 border text-xs md:text-sm uppercase tracking-[0.2em] backdrop-blur-2xl",
              isLive 
                ? "bg-red-500 text-white border-red-600 shadow-[0_0_50px_rgba(239,68,68,0.4)]" 
                : "bg-emerald-500 text-black border-emerald-600 shadow-[0_0_50px_rgba(16,185,129,0.4)]"
            )}
          >
            {isLive ? (
              <><Power size={20} /> Disconnect</>
            ) : (
              <><Mic size={20} /> Initialize Nova</>
            )}
          </button>
        </div>
      </div>

      {/* Background Decorative Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-[-1]">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-emerald-500/[0.03] blur-[150px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-emerald-500/[0.03] blur-[150px] rounded-full" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.05)_0%,transparent_70%)]" />
      </div>
    </div>
  );
}
