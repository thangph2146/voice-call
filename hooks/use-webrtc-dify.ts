"use client";

import { useState, useRef, useEffect } from "react"; // React state & lifecycle
import { v4 as uuidv4 } from "uuid"; // Unique IDs for conversation messages
import { flow } from "@/lib/flow-tracker"; // Structured flow timeline instrumentation
import { logger } from "@/lib/logger"; // Central logging utility
import type { Conversation } from "@/lib/conversations"; // Conversation entity shape

/**
 * ============================================================================
 * FLOW OVERVIEW (Voice Realtime – Dify Streaming)
 * ----------------------------------------------------------------------------
 *  1. startSession()                -> Request microphone (MediaDevices.getUserMedia)
 *                                      then setupAudioVisualization(): AudioContext + AnalyserNode
 *                                      (Web Audio API) for volume meter (RMS of frequency bins).
 *  2. initializeSpeech()            -> Prepare Web Speech API components:
 *       - window.speechSynthesis: load voices, pick Vietnamese / female / fallback
 *       - window.SpeechRecognition: continuous + interim results (lang: vi-VN)
 *  3. recognition.onresult          -> Interim transcript updates an ephemeral user message
 *                                      (status="speaking"); final transcript triggers handleUserSpeech().
 *  4. handleUserSpeech()            -> Finalize ephemeral user message; append assistant placeholder;
 *                                      construct DifyChatRequest and call streamDify() (SSE streaming).
 *  5. streamDify() (fetch + SSE)    -> POST /v1/chat-messages with Accept: text/event-stream.
 *       - Parse each 'data: {json}' line; accumulate json.answer chunks.
 *       - Update assistant message text incrementally (partial streaming UX).
 *       - Capture conversation_id (thread continuity) once provided by backend.
 *       - On [DONE] sentinel -> mark assistant message final, call speak().
 *  6. speak()                       -> Use SpeechSynthesisUtterance for TTS playback of full answer.
 *  7. sendTextMessage()             -> Manual text path (reuses handleUserSpeech for simplicity).
 *  8. stopSession()                 -> Graceful cleanup: stop recognition, cancel TTS, stop tracks,
 *                                      close AudioContext, clear intervals & ephemeral IDs.
 *  9. flowStep() + logger           -> Provide granular timeline + leveled logs for diagnostics.
 * ----------------------------------------------------------------------------
 * LIBRARIES / APIS USED:
 *  - React (useState, useRef, useEffect)
 *  - uuid (v4) for stable message IDs
 *  - Custom logger ("@/lib/logger")
 *  - Custom flow tracker ("@/lib/flow-tracker")
 *  - Web Speech API (SpeechRecognition + SpeechSynthesis)
 *  - Web Audio API (AudioContext, AnalyserNode) – volume visualization
 *  - Fetch streaming + TextDecoder for SSE style parsing
 *  - Environment: NEXT_PUBLIC_DIFY_API_BASE_URL, NEXT_PUBLIC_DIFY_API_KEY
 * ----------------------------------------------------------------------------
 * PROVIDER SWAP PARITY NOTE:
 *  This hook mirrors the public interface of the Gemini hook (registerFunction, msgs, etc.)
 *  so UI integration only changes the import. The ONLY substantive difference is the
 *  provider implementation step: Gemini's model.generateContent() is replaced with
 *  Dify's SSE streaming (streamDify). Future tool/function calling can reuse the
 *  functionRegistry already mirrored here.
 * ============================================================================
 */

// ====== Web Speech API Types (local) ======
// We declare minimal runtime-safe shapes for the global constructor references.
// Avoid referencing the interface identifier as a runtime value (TS error).
// Provide ambient declarations without changing existing global shapes (avoid 'any').
declare global {
  interface Window {
    SpeechRecognition: {
      new (): SpeechRecognition;
      prototype: SpeechRecognition;
    };
    webkitSpeechRecognition: {
      new (): SpeechRecognition;
      prototype: SpeechRecognition;
    };
  }
}

// Type-only interface for speech recognition instance
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onstart: ((event: Event) => void) | null;
  onend: ((event: Event) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
}
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

// ====== Dify minimal types ======
interface DifyChatRequest {
  query: string;
  response_mode: "streaming" | "blocking";
  conversation_id?: string;
  inputs?: Record<string, unknown>;
  user?: string;
}
interface DifyChatStreamChunk {
  event?: string;
  answer?: string;
  conversation_id?: string;
  message_id?: string;
  error?: { message: string };
  status?: string;
  metadata?: Record<string, unknown>;
}

// ====== Hook return type ======
interface UseWebRTCDifySessionReturn {
  status: string;
  isSessionActive: boolean;
  audioIndicatorRef: React.RefObject<HTMLDivElement | null>;
  startSession: () => Promise<void>;
  stopSession: () => void;
  handleStartStopClick: () => void;
  registerFunction: (name: string, fn: Function) => void; // Parity placeholder
  msgs: any[]; // Raw streaming events / debug
  conversation: Conversation[];
  currentVolume: number;
  sendTextMessage: (text: string) => void;
  flowTimeline: { step: number; label: string; ts: string }[];
  usageStats?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    latency?: number;
  } | null;
}

// ====== Config helpers ======
const DIFY_BASE_URL = process.env.NEXT_PUBLIC_DIFY_API_BASE_URL;
const DIFY_API_KEY = process.env.NEXT_PUBLIC_DIFY_API_KEY;
const DIFY_ENDPOINT = "/v1/chat-messages"; // streaming endpoint

function buildDifyUrl(path: string) {
  if (!DIFY_BASE_URL) throw new Error("DIFY_API_BASE_URL missing");
  return `${DIFY_BASE_URL}${path.startsWith("/") ? path : "/" + path}`;
}
function buildHeaders(stream = true): Record<string, string> {
  if (!DIFY_API_KEY) throw new Error("DIFY_API_KEY missing");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${DIFY_API_KEY}`,
    Accept: stream ? "text/event-stream" : "application/json",
  };
}

// ====== Streaming helper (SSE) ======
async function streamDify(
  payload: DifyChatRequest,
  handlers: {
    onChunk: (text: string) => void;
    onDone: (full: {
      text: string;
      conversationId?: string;
      metadata?: any;
    }) => void;
    onError: (err: Error) => void;
  }
) {
  try {
    const url = buildDifyUrl(DIFY_ENDPOINT);
    const response = await fetch(url, {
      method: "POST",
      headers: buildHeaders(true),
      body: JSON.stringify(payload),
    });
    if (!response.ok || !response.body) {
      throw new Error(`Dify streaming request failed (${response.status})`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    let conversationId: string | undefined;
    let lastMetadata: any = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx = buffer.indexOf("\n");
      while (idx !== -1) {
        const rawLine = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        const line = rawLine.trim();
        if (!line) {
          idx = buffer.indexOf("\n");
          continue;
        }

        // Support classic 'data: ' lines AND tolerant fallback (some inspectors show already stripped prefix)
        let jsonPayload: string | null = null;
        if (line.startsWith("data: ")) {
          jsonPayload = line.substring(6).trim();
        } else if (line.startsWith("{")) {
          jsonPayload = line; // fallback if prefix missing
        }

        if (jsonPayload) {
          if (jsonPayload === "[DONE]") {
            handlers.onDone({
              text: full,
              conversationId,
              metadata: lastMetadata,
            });
            return;
          }
          try {
            const json: DifyChatStreamChunk = JSON.parse(jsonPayload);
            if (json.error) throw new Error(json.error.message);
            if (json.conversation_id) conversationId = json.conversation_id;
            if (json.answer) {
              full += json.answer;
              handlers.onChunk(json.answer);
            }
            if (json.event === "message_end") {
              lastMetadata = json.metadata || null;
              handlers.onDone({
                text: full,
                conversationId,
                metadata: lastMetadata,
              });
              return;
            }
          } catch (err) {
            logger.error(
              "DIFY_STREAM_PARSE",
              err instanceof Error
                ? { message: err.message }
                : { detail: String(err) }
            );
          }
        }
        idx = buffer.indexOf("\n");
      }
    }
    // flush any residual
    if (buffer.trim().startsWith("data: ")) {
      try {
        const json: DifyChatStreamChunk = JSON.parse(
          buffer.trim().substring(6)
        );
        if (json.answer) {
          full += json.answer;
          handlers.onChunk(json.answer);
        }
        if (json.event === "message_end") {
          lastMetadata = json.metadata || null;
        }
      } catch {
        /* ignore */
      }
    }
    handlers.onDone({ text: full, conversationId, metadata: lastMetadata });
  } catch (error) {
    handlers.onError(error as Error);
  }
}

// ====== Main Hook ======
export function useWebRTCDifySession(
  voice: string,
  options?: { fast?: boolean; camSpeaking?: boolean }
): UseWebRTCDifySessionReturn {
  const fast = options?.fast ?? true;
  const camSpeaking = options?.camSpeaking ?? true; // Default to true for backward compatibility
  // Core state
  const [status, setStatus] = useState("");
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [conversation, setConversation] = useState<Conversation[]>([]);
  const [currentVolume, setCurrentVolume] = useState(0);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [msgs, setMsgs] = useState<any[]>([]); // Raw streaming event log
  const [usageStats, setUsageStats] =
    useState<UseWebRTCDifySessionReturn["usageStats"]>(null);

  // Audio / speech refs
  const audioIndicatorRef = useRef<HTMLDivElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const volumeIntervalRef = useRef<number | null>(null);
  const volumeRafRef = useRef<number | null>(null);
  // Real-time volume ref for recognition gating
  const currentVolumeRef = useRef(0);
  // Track active session in ref for event handlers
  const isSessionActiveRef = useRef(false);
  // Track SpeechRecognition active state to avoid invalid start()
  const recognitionActiveRef = useRef(false);
  // Status previous value for logging transitions
  const lastStatusRef = useRef<string>("");
  // Track consecutive no-speech errors to apply backoff
  const consecutiveNoSpeechRef = useRef(0);
  // Restart timer handle
  const restartTimeoutRef = useRef<number | null>(null);
  // Flag while TTS speaking
  const ttsInProgressRef = useRef(false);
  // Guard to avoid double-start attempts
  const pendingRestartRef = useRef(false);

  function setStatusLogged(next: string, source: string = "session") {
    if (lastStatusRef.current !== next) {
      logger.debug(
        "STATUS_TRANSITION",
        { from: lastStatusRef.current, to: next },
        source
      );
      lastStatusRef.current = next;
    }
    setStatus(next);
  }

  function clearRestartTimer() {
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    pendingRestartRef.current = false;
  }

  function scheduleRecognitionRestart(delay: number, reason: string) {
    if (fast) {
      if (reason === "cycle_onend") delay = Math.min(delay, 120);
      if (reason.startsWith("no_speech_")) delay = Math.min(delay, 1500);
      if (reason === "tts_end") delay = Math.min(delay, 100);
    }
    clearRestartTimer();
    pendingRestartRef.current = true;
    logger.debug(
      "Scheduling recognition restart",
      { delay, reason },
      "SpeechRecognition"
    );
    restartTimeoutRef.current = window.setTimeout(() => {
      pendingRestartRef.current = false;
      if (!isSessionActiveRef.current || ttsInProgressRef.current) return;
      if (recognitionActiveRef.current) {
        logger.debug(
          "Skip restart: recognition already active",
          { reason },
          "SpeechRecognition"
        );
        return;
      }
      try {
        if (!recognitionRef.current) return;
        recognitionRef.current.start();
      } catch (err) {
        const e = err as any;
        // Some browsers throw if start() is called too soon; treat as benign
        logger.warn(
          "Restart exception (ignored)",
          { message: e?.message || String(e), name: e?.name, reason },
          "SpeechRecognition"
        );
      }
    }, delay);
  }
  // Stable user identifier for Dify 'user' field (session scoped)
  const userIdRef = useRef<string | null>(null);

  function getUserId() {
    if (!userIdRef.current) {
      userIdRef.current = `user_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 10)}`;
    }
    return userIdRef.current;
  }

  // Ephemeral user message (interim transcript)
  const ephemeralUserMessageIdRef = useRef<string | null>(null);

  // Flow timeline
  const flowTimelineRef = useRef<{ step: number; label: string; ts: string }[]>(
    []
  );
  const SCOPE = "webrtc-dify";
  function flowStep(step: number, label: string) {
    const entry = { step, label, ts: new Date().toISOString() };
    flowTimelineRef.current.push(entry);
    flow.step(SCOPE, step, label);
    logger.debug(`FLOW STEP ${step}: ${label}`, entry, "Dify");
  }

  // Function registry parity (not yet invoked by Dify streaming path)
  const functionRegistry = useRef<Record<string, Function>>({});
  function registerFunction(name: string, fn: Function) {
    functionRegistry.current[name] = fn;
    logger.debug(
      "Function registered (parity only, no Dify tool call yet)",
      { name },
      "Dify"
    );
  }

  // ===== Utility =====
  function getOrCreateEphemeralUserId() {
    if (!ephemeralUserMessageIdRef.current) {
      ephemeralUserMessageIdRef.current = uuidv4();
      setConversation((prev) => [
        ...prev,
        {
          id: ephemeralUserMessageIdRef.current!,
          role: "user",
          text: "",
          timestamp: new Date().toISOString(),
          isFinal: false,
          status: "speaking",
        },
      ]);
    }
    return ephemeralUserMessageIdRef.current;
  }
  function updateEphemeral(partial: Partial<Conversation>) {
    const id = ephemeralUserMessageIdRef.current;
    if (!id) return;
    setConversation((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...partial } : m))
    );
  }
  function clearEphemeral() {
    ephemeralUserMessageIdRef.current = null;
  }

  // ===== Audio Visualization =====
  function setupAudioVisualization(stream: MediaStream) {
    try {
      const ctx = new (window.AudioContext || window.AudioContext)();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      if (fast) {
        const loop = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          const vol = Math.sqrt(avg);
          if (vol !== currentVolumeRef.current) {
            setCurrentVolume(vol);
            currentVolumeRef.current = vol;
          }
          volumeRafRef.current = requestAnimationFrame(loop);
        };
        loop();
      } else {
        const updateVolume = () => {
          if (analyserRef.current) {
            analyserRef.current.getByteFrequencyData(dataArray);
            const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
            const vol = Math.sqrt(avg);
            setCurrentVolume(vol);
            currentVolumeRef.current = vol;
          }
        };
        volumeIntervalRef.current = window.setInterval(updateVolume, 100);
      }
    } catch (err) {
      logger.error(
        "AUDIO_VIS_SETUP",
        err instanceof Error
          ? { message: err.message }
          : { detail: String(err) }
      );
    }
  }

  // ===== Voices =====
  function findVoiceByURI(uri: string): SpeechSynthesisVoice | null {
    if (!synthRef.current) return null;
    return synthRef.current.getVoices().find((v) => v.voiceURI === uri) || null;
  }
  function getSelectedVoice(): SpeechSynthesisVoice | null {
    if (!synthRef.current) return null;
    if (voice) {
      const v = findVoiceByURI(voice);
      if (v) return v;
    }
    const voices = synthRef.current.getVoices();
    return (
      voices.find(
        (v) =>
          v.lang.startsWith("vi") && v.name.toLowerCase().includes("female")
      ) ||
      voices.find((v) => v.lang.startsWith("vi")) ||
      voices.find((v) => v.name.toLowerCase().includes("female")) ||
      voices[0] ||
      null
    );
  }

  // ===== Initialize Speech =====
  async function initializeSpeech() {
    flowStep(2, "initializeSpeech start");
    synthRef.current = window.speechSynthesis;
    // Ensure voices loaded
    if (synthRef.current.getVoices().length === 0) {
      await new Promise<void>((resolve) => {
        const check = () => {
          if (synthRef.current!.getVoices().length > 0) resolve();
          else setTimeout(check, 100);
        };
        check();
      });
    }
    const selectedVoice = getSelectedVoice();
    if (selectedVoice) {
      logger.info(
        "Voice selected",
        { voice: selectedVoice.name, lang: selectedVoice.lang },
        "Dify"
      );
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) throw new Error("Trình duyệt không hỗ trợ SpeechRecognition");
    recognitionRef.current = new SR();
    recognitionRef.current.continuous = true;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.lang = "vi-VN";

    recognitionRef.current.onresult = (event: any) => {
      let final = "";
      let interim = "";
      const NOISE_VOLUME_THRESHOLD = fast ? 8 : 10; // slightly lower in fast mode
      const NOISE_SINGLE_WORDS = ["phẩy", ",", "comma"]; // extend as needed
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const alt = event.results[i][0];
        const transcript: string = alt.transcript || "";
        if (event.results[i].isFinal) final += transcript;
        else interim += transcript;
      }
      const vol = currentVolumeRef.current;

      function isNoise(text: string) {
        const trimmed = text.trim().toLowerCase();
        if (!trimmed) return true;
        // Single short token + low volume
        if (
          trimmed.split(/\s+/).length === 1 &&
          trimmed.length <= 5 &&
          vol < NOISE_VOLUME_THRESHOLD &&
          NOISE_SINGLE_WORDS.includes(trimmed)
        )
          return true;
        // Very short (< 2 chars) under low volume
        if (trimmed.length < 2 && vol < NOISE_VOLUME_THRESHOLD) return true;
        return false;
      }

      if (final) {
        if (isNoise(final)) {
          logger.debug(
            "Filtered noise final",
            { text: final.trim(), vol },
            "SpeechRecognition"
          );
          return; // ignore
        }
        logger.logSpeechResult(final, true);
        handleUserSpeech(final);
      } else if (interim) {
        if (isNoise(interim)) {
          // silently ignore interim noise
          return;
        }
        logger.logSpeechResult(interim, false);
        getOrCreateEphemeralUserId();
        updateEphemeral({ text: interim, status: "speaking", isFinal: false });
      }
    };
    recognitionRef.current.onstart = () => {
      setStatusLogged("Đang nghe...", "SpeechRecognition");
      logger.logSpeechStart();
      consecutiveNoSpeechRef.current = 0; // reset on successful start
  recognitionActiveRef.current = true;
      getOrCreateEphemeralUserId();
    };
    recognitionRef.current.onend = () => {
      logger.info(
        "Recognition ended",
        { active: isSessionActiveRef.current, tts: ttsInProgressRef.current },
        "SpeechRecognition"
      );
  recognitionActiveRef.current = false;
      if (!isSessionActiveRef.current) {
        setStatusLogged("Phiên hoạt động - Nhấn để nói", "SpeechRecognition");
        return;
      }
      if (ttsInProgressRef.current) {
        // Will be resumed by TTS onend
        return;
      }
      if (pendingRestartRef.current) return; // already scheduled
      // Normal cycling: brief delay to avoid tight loop
      scheduleRecognitionRestart(300, "cycle_onend");
    };
    recognitionRef.current.onerror = (e: any) => {
      const err = e?.error as string;
      if (err === "aborted") {
        // Often triggered when we intentionally stop() (e.g., to avoid capturing TTS)
        logger.debug("Recognition aborted", { tts: ttsInProgressRef.current, active: isSessionActiveRef.current }, "SpeechRecognition");
        if (!isSessionActiveRef.current || ttsInProgressRef.current) return;
        if (!pendingRestartRef.current) scheduleRecognitionRestart(200, "aborted");
        return;
      }
  logger.logSpeechError(err);
  logger.debug("Recognition onerror (non-aborted)", { err }, "SpeechRecognition");
      if (!isSessionActiveRef.current) return;
      if (err === "no-speech") {
        consecutiveNoSpeechRef.current += 1;
        const attempts = consecutiveNoSpeechRef.current;
        const delay = Math.min(
          500 + (attempts - 1) * (attempts - 1) * 400,
          6000
        ); // quadratic backoff capped 6s
        if (attempts >= 6) {
          setStatusLogged(
            "Không phát hiện giọng nói - tạm dừng (nhấn lại để tiếp tục)",
            "SpeechRecognition"
          );
          logger.warn(
            "Auto-pause after repeated no-speech",
            { attempts },
            "SpeechRecognition"
          );
          return; // stop auto restarts
        } else {
          setStatusLogged("Đang chờ bạn nói...", "SpeechRecognition");
          scheduleRecognitionRestart(delay, `no_speech_${attempts}`);
        }
      } else {
        setStatusLogged(`Lỗi nhận dạng: ${err}`, "SpeechRecognition");
        scheduleRecognitionRestart(1000, "generic_error");
      }
    };
    flowStep(2, "initializeSpeech done");
  }

  // ===== Core: Handle User Speech -> Dify =====
  async function handleUserSpeech(text: string) {
    flowStep(5, "handleUserSpeech");
    updateEphemeral({ text, isFinal: true, status: "final" });
    clearEphemeral();
    setStatusLogged("Gửi tới Dify...", "session");
    logger.info("Sending user query", { len: text.length }, "Dify");

    // Thêm placeholder assistant message để stream vào
    const assistantId = uuidv4();
    setConversation((prev) => [
      ...prev,
      {
        id: assistantId,
        role: "assistant",
        text: "",
        timestamp: new Date().toISOString(),
        isFinal: false,
        status: "processing",
      },
    ]);

    const request: DifyChatRequest = {
      query: text,
      response_mode: "streaming",
      conversation_id: conversationId,
      user: getUserId(),
      inputs: { source: "phone-call-demo" },
    };

    let accumulated = "";
    await streamDify(request, {
      onChunk: (chunk) => {
        accumulated += chunk;
        setConversation((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, text: accumulated } : m
          )
        );
        setMsgs((prev) => [...prev, { type: "chunk", chunk }]);
      },
      onDone: ({ text: full, conversationId: newCid, metadata }) => {
        setConversation((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, text: full, isFinal: true, status: "final", metadata }
              : m
          )
        );
        if (newCid) setConversationId(newCid);
        if (metadata?.usage) {
          const u = metadata.usage;
          setUsageStats({
            prompt_tokens: u.prompt_tokens,
            completion_tokens: u.completion_tokens,
            total_tokens: u.total_tokens,
            latency: u.latency,
          });
        } else {
          setUsageStats(null);
        }
        setMsgs((prev) => [
          ...prev,
          { type: "done", text: full, conversationId: newCid, metadata },
        ]);
        speak(full);
        setStatusLogged("Hoàn thành", "session");
        flowStep(6, "Dify response complete");
      },
      onError: (err) => {
        setConversation((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, text: "(Lỗi: " + err.message + ")", isFinal: true }
              : m
          )
        );
        setStatusLogged("Lỗi Dify", "session");
        logger.error("DIFY_STREAM_ERROR", { message: err.message });
        setMsgs((prev) => [...prev, { type: "error", message: err.message }]);
      },
    });
  }

  // ===== TTS =====
  function speak(text: string) {
    if (!synthRef.current || !text) return;
    const utter = new SpeechSynthesisUtterance(text);
    const v = getSelectedVoice();
    if (v) {
      utter.voice = v;
      utter.lang = v.lang;
      utter.pitch = v.name.toLowerCase().includes("female") ? 1.1 : 1.0;
    } else {
      utter.lang = "vi-VN";
      utter.pitch = 1.05;
    }
    // Increased speaking rate for faster TTS response (previously 0.9)
    utter.rate = 1.2;
    utter.volume = 1;
    // Pause recognition while speaking to avoid capturing TTS audio
    ttsInProgressRef.current = true;
    clearRestartTimer();
    try {
      if (recognitionActiveRef.current && recognitionRef.current) {
        recognitionActiveRef.current = false; // anticipate onend
        recognitionRef.current.stop();
      }
      logger.debug("Recognition paused for TTS", null, "SpeechRecognition");
    } catch {}
    utter.onend = () => {
      logger.debug("TTS finished", null, "TTS");
      ttsInProgressRef.current = false;
      if (isSessionActiveRef.current)
        scheduleRecognitionRestart(150, "tts_end");
    };
    utter.onerror = () => {
      ttsInProgressRef.current = false;
      if (isSessionActiveRef.current)
        scheduleRecognitionRestart(250, "tts_error");
    };
    synthRef.current.speak(utter);
  }

  // ===== Public: send text manually =====
  async function sendTextMessage(text: string) {
    if (!text.trim()) return;
    const user: Conversation = {
      id: uuidv4(),
      role: "user",
      text,
      timestamp: new Date().toISOString(),
      isFinal: true,
      status: "final",
    };
    setConversation((prev) => [...prev, user]);
    await handleUserSpeech(text); // reuse logic
  }

  // ===== Session lifecycle =====
  async function startSession() {
    try {
      flowStep(1, "startSession");
      setStatusLogged("Yêu cầu mic...", "session");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      setupAudioVisualization(stream);
      setStatusLogged("Khởi tạo giọng nói...", "session");
      await initializeSpeech();
      // Don't start recognition immediately - wait for camera speaking state
      setIsSessionActive(true);
      isSessionActiveRef.current = true;
      setStatusLogged("Phiên hoạt động - Chờ camera phát hiện nói", "session");
      logger.info("Session started", { user: getUserId() }, "Session");
    } catch (err) {
      logger.error(
        "START_SESSION_ERROR",
        err instanceof Error
          ? { message: err.message }
          : { detail: String(err) }
      );
      setStatusLogged("Lỗi khởi tạo phiên", "session");
      stopSession();
    }
  }
  function stopSession() {
    if (recognitionRef.current && recognitionActiveRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    recognitionActiveRef.current = false;
    recognitionRef.current = null;
    synthRef.current?.cancel();
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => t.stop());
      audioStreamRef.current = null;
    }
    audioContextRef.current?.close();
    audioContextRef.current = null;
    if (volumeIntervalRef.current) {
      clearInterval(volumeIntervalRef.current);
      volumeIntervalRef.current = null;
    }
    if (volumeRafRef.current) {
      cancelAnimationFrame(volumeRafRef.current);
      volumeRafRef.current = null;
    }
    analyserRef.current = null;
    ephemeralUserMessageIdRef.current = null;
    setIsSessionActive(false);
    isSessionActiveRef.current = false;
    clearRestartTimer();
    ttsInProgressRef.current = false;
    consecutiveNoSpeechRef.current = 0;
    setCurrentVolume(0);
    setStatusLogged("Đã dừng phiên", "session");
    logger.info("Session stopped", null, "Session");
  }
  function handleStartStopClick() {
    isSessionActive ? stopSession() : startSession();
  }

  // Control SpeechRecognition based on camera speaking state
  useEffect(() => {
    if (!isSessionActive || !recognitionRef.current) return;
    
    if (camSpeaking) {
      // Camera is speaking - start recognition if not already active
      if (!recognitionActiveRef.current) {
        try {
          recognitionRef.current.start();
          recognitionActiveRef.current = true;
          logger.debug("Recognition started due to camera speaking", null, "SpeechRecognition");
        } catch (err) {
          logger.warn("Failed to start recognition on camera speaking", { error: err }, "SpeechRecognition");
        }
      }
    } else {
      // Camera is silent - stop recognition if active
      if (recognitionActiveRef.current) {
        try {
          recognitionRef.current.stop();
          recognitionActiveRef.current = false;
          logger.debug("Recognition stopped due to camera silent", null, "SpeechRecognition");
        } catch (err) {
          logger.warn("Failed to stop recognition on camera silent", { error: err }, "SpeechRecognition");
        }
      }
    }
  }, [camSpeaking, isSessionActive]);

  useEffect(() => () => stopSession(), []);

  return {
    status,
    isSessionActive,
    audioIndicatorRef,
    startSession,
    stopSession,
    handleStartStopClick,
    registerFunction,
    msgs,
    conversation,
    currentVolume,
    sendTextMessage,
    flowTimeline: [...flowTimelineRef.current],
    usageStats,
  };
}

export default useWebRTCDifySession;
