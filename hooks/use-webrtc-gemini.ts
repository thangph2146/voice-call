"use client";

import { useState, useRef, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { Conversation } from "@/lib/conversations";
import { useTranslations } from "@/components/translations-context";
import { logger } from "@/lib/logger";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { flow } from "@/lib/flow-tracker";

/**
 * ============================================================================
 * FLOW OVERVIEW (Voice Realtime – Gemini)
 * ----------------------------------------------------------------------------
 *  1. User triggers startSession()  -> Request mic + setup audio analyser
 *  2. initializeSpeech()            -> Prepare Speech Synthesis + Recognition
 *  3. recognition.start()           -> Browser begins listening (onstart)
 *  4. recognition.onresult          -> Stream interim + final transcripts
 *     4.1 Interim: updateEphemeralUserMessage(status="speaking")
 *     4.2 Final:  handleUserSpeech(finalTranscript)
 *  5. handleUserSpeech()            -> Build prompt -> Gemini generateContent()
 *  6. Gemini response               -> Append assistant message to conversation
 *  7. Text-to-Speech (selected voice) speaks response
 *  8. User may send manual text via sendTextMessage()
 *  9. User stops -> stopSession(): cleanup all media & state
 * 10. Any error at any stage logs via logger & flow tracker
 * ----------------------------------------------------------------------------
 * Use flowStep(<n>, <label>) helper to push structured timeline entries.
 * Access timeline via returned flowTimeline array (read-only snapshot).
 * ============================================================================
 */

// Type declarations for Web Speech API
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

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

declare var SpeechRecognition: {
  prototype: SpeechRecognition;
  new (): SpeechRecognition;
};

export interface Tool {
  name: string;
  description: string;
  parameters?: Record<string, any>;
}

/**
 * The return type for the hook
 */
interface UseWebRTCAudioSessionReturn {
  status: string;
  isSessionActive: boolean;
  audioIndicatorRef: React.RefObject<HTMLDivElement | null>;
  startSession: () => Promise<void>;
  stopSession: () => void;
  handleStartStopClick: () => void;
  registerFunction: (name: string, fn: Function) => void;
  msgs: any[];
  currentVolume: number;
  conversation: Conversation[];
  sendTextMessage: (text: string) => void;
  /** Read-only snapshot of the internal flow timeline used for debugging */
  flowTimeline: { step: number; label: string; ts: string }[];
}

/**
 * Hook to manage a real-time session with Gemini AI using Web Speech API.
 */
export default function useWebRTCAudioSession(
  voice: string,
  tools?: Tool[]
): UseWebRTCAudioSessionReturn {
  const { t, locale } = useTranslations();

  // Initialize Gemini AI
  const genAI = new GoogleGenerativeAI(
    process.env.NEXT_PUBLIC_GEMINI_API_KEY || ""
  );
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  // Connection/session states
  const [status, setStatus] = useState("");
  const [isSessionActive, setIsSessionActive] = useState(false);

  // Audio references for local mic
  const audioIndicatorRef = useRef<HTMLDivElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);

  // Speech recognition and synthesis
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  // Keep track of all raw events/messages
  const [msgs, setMsgs] = useState<any[]>([]);

  // Main conversation state
  const [conversation, setConversation] = useState<Conversation[]>([]);

  // Flow timeline tracker (not persisted, for debugging / UI if needed)
  const flowTimelineRef = useRef<{ step: number; label: string; ts: string }[]>([]);
  const SCOPE = "webrtc-gemini";
  function flowStep(step: number, label: string) {
    const entry = { step, label, ts: new Date().toISOString() };
    flowTimelineRef.current.push(entry);
    flow.step(SCOPE, step, label);
    logger.debug(`FLOW STEP ${step}: ${label}`, entry, "Flow");
  }

  // For function calls (AI "tools")
  const functionRegistry = useRef<Record<string, Function>>({});

  // Volume analysis
  const [currentVolume, setCurrentVolume] = useState(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const volumeIntervalRef = useRef<number | null>(null);

  /**
   * We track only the ephemeral user message ID here.
   */
  const ephemeralUserMessageIdRef = useRef<string | null>(null);

  /**
   * Register a function (tool) so the AI can call it.
   */
  function registerFunction(name: string, fn: Function) {
    functionRegistry.current[name] = fn;
    logger.debug(`Function registered: ${name}`, null, "WebRTC");
  }

  /**
   * Return an ephemeral user ID, creating a new ephemeral message if needed.
   */
  function getOrCreateEphemeralUserId(): string {
    let ephemeralId = ephemeralUserMessageIdRef.current;
    if (!ephemeralId) {
      ephemeralId = uuidv4();
      ephemeralUserMessageIdRef.current = ephemeralId;

      const newMessage: Conversation = {
        id: ephemeralId,
        role: "user",
        text: "",
        timestamp: new Date().toISOString(),
        isFinal: false,
        status: "speaking",
      };

      setConversation((prev) => [...prev, newMessage]);
      logger.debug(
        `Created ephemeral user message: ${ephemeralId}`,
        null,
        "WebRTC"
      );
    }
    return ephemeralId;
  }

  /**
   * Update the ephemeral user message with partial changes.
   */
  function updateEphemeralUserMessage(partial: Partial<Conversation>) {
    const ephemeralId = ephemeralUserMessageIdRef.current;
    if (!ephemeralId) return;

    setConversation((prev) =>
      prev.map((msg) => {
        if (msg.id === ephemeralId) {
          return { ...msg, ...partial };
        }
        return msg;
      })
    );
  }

  /**
   * Clear ephemeral user message ID.
   */
  function clearEphemeralUserMessage() {
    ephemeralUserMessageIdRef.current = null;
  }

  /**
   * Setup audio visualization for mic input.
   */
  function setupAudioVisualization(stream: MediaStream) {
    try {
      const audioCtx = new (window.AudioContext || window.AudioContext)();
      audioContextRef.current = audioCtx;

      const src = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      src.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateVolume = () => {
        if (analyserRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          setCurrentVolume(Math.sqrt(sum / dataArray.length));
        }
      };

      volumeIntervalRef.current = window.setInterval(updateVolume, 100);
      logger.debug("Audio visualization setup complete", null, "WebRTC");
    } catch (error) {
      const detail = typeof error === 'object' && error !== null ? { message: (error as Error).message } : { message: String(error) };
      logger.error("Failed to setup audio visualization", detail, "WebRTC");
    }
  }

  /**
   * Find voice by URI from available voices
   */
  function findVoiceByURI(voiceURI: string): SpeechSynthesisVoice | null {
    if (!synthRef.current) return null;
    const voices = synthRef.current.getVoices();
    return voices.find((voice) => voice.voiceURI === voiceURI) || null;
  }

  /**
   * Get the selected voice or fallback to Vietnamese female voice
   */
  function getSelectedVoice(): SpeechSynthesisVoice | null {
    if (!synthRef.current) return null;

    // First try to find the selected voice
    if (voice) {
      const selectedVoice = findVoiceByURI(voice);
      if (selectedVoice) {
        logger.debug(
          "Using selected voice",
          { voice: selectedVoice.name, lang: selectedVoice.lang },
          "WebRTC"
        );
        return selectedVoice;
      }
    }

    // Fallback to Vietnamese female voice
    const voices = synthRef.current.getVoices();
    const vietnameseVoice =
      voices.find(
        (voice) =>
          voice.lang.startsWith("vi") &&
          voice.name.toLowerCase().includes("female")
      ) ||
      voices.find((voice) => voice.lang.startsWith("vi")) ||
      voices.find((voice) => voice.name.toLowerCase().includes("female")) ||
      voices[0];

    if (vietnameseVoice) {
      logger.debug(
        "Using fallback voice",
        { voice: vietnameseVoice.name, lang: vietnameseVoice.lang },
        "WebRTC"
      );
    }

    return vietnameseVoice || null;
  }

  /**
   * Initialize Speech Recognition and Synthesis for Vietnamese
   */
  async function initializeSpeech() {
    try {
      logger.info(
        "Initializing speech recognition and synthesis for Vietnamese",
        null,
        "WebRTC"
      );
      flowStep(2, "initializeSpeech invoked");

      // Initialize Speech Synthesis
      synthRef.current = window.speechSynthesis;

      // Wait for voices to be loaded
      const voices = synthRef.current.getVoices();
      if (voices.length === 0) {
        // Wait for voices to load
        await new Promise<void>((resolve) => {
          const checkVoices = () => {
            if (synthRef.current!.getVoices().length > 0) {
              resolve();
            } else {
              setTimeout(checkVoices, 100);
            }
          };
          checkVoices();
        });
      }

      const selectedVoice = getSelectedVoice();
      if (selectedVoice) {
        logger.info(
          "Voice initialized",
          {
            voice: selectedVoice.name,
            lang: selectedVoice.lang,
            localService: selectedVoice.localService,
          },
          "WebRTC"
        );
        flowStep(2, `Voice selected: ${selectedVoice.name}`);
      } else {
        logger.warn("No suitable voice found", null, "WebRTC");
        flowStep(2, "No suitable voice found - fallback path");
      }

      logger.debug("Speech synthesis initialized", null, "WebRTC");

      // Initialize Speech Recognition for Vietnamese
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        logger.error(
          "Speech Recognition not supported in this browser",
          null,
          "WebRTC"
        );
        throw new Error("Speech Recognition not supported in this browser");
      }

      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = "vi-VN"; // Vietnamese language
      recognitionRef.current.maxAlternatives = 1;

      logger.info(
        "Speech recognition initialized for Vietnamese",
        { lang: "vi-VN" },
        "WebRTC"
      );
      flowStep(2, "SpeechRecognition configured");

      // Handle speech recognition results
      recognitionRef.current.onresult = (event: any) => {
        let finalTranscript = "";
        let interimTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        if (finalTranscript) {
          logger.logSpeechResult(finalTranscript, true);
          handleUserSpeech(finalTranscript);
          flowStep(4, `Final transcript processed: ${finalTranscript}`);
        } else if (interimTranscript) {
          logger.logSpeechResult(interimTranscript, false);
          updateEphemeralUserMessage({
            text: interimTranscript,
            status: "speaking",
            isFinal: false,
          });
          flowStep(4, `Interim transcript updated: ${interimTranscript}`);
        }
      };

      recognitionRef.current.onstart = () => {
        logger.logSpeechStart();
        setStatus("Đang lắng nghe tiếng Việt...");
        getOrCreateEphemeralUserId();
        flowStep(3, "SpeechRecognition started");
      };

      recognitionRef.current.onend = () => {
        logger.info("Speech recognition ended", null, "WebRTC");
        setStatus("Phiên hoạt động - Nói tiếng Việt để bắt đầu");
        flowStep(9, "SpeechRecognition ended");
      };

      recognitionRef.current.onerror = (event: any) => {
        logger.logSpeechError(event.error);
        let errorMessage = "Lỗi nhận diện giọng nói";

        switch (event.error) {
          case "no-speech":
            errorMessage = "Không nghe thấy giọng nói. Vui lòng thử lại.";
            break;
          case "audio-capture":
            errorMessage =
              "Không thể truy cập microphone. Kiểm tra quyền truy cập.";
            break;
          case "not-allowed":
            errorMessage = "Quyền truy cập microphone bị từ chối.";
            break;
          case "network":
            errorMessage = "Lỗi mạng. Kiểm tra kết nối internet.";
            break;
          case "language-not-supported":
            errorMessage = "Ngôn ngữ không được hỗ trợ.";
            break;
          case "service-not-allowed":
            errorMessage = "Dịch vụ nhận diện giọng nói không khả dụng.";
            break;
          default:
            errorMessage = `Lỗi: ${event.error}`;
        }

        setStatus(errorMessage);
        flowStep(10, `SpeechRecognition error: ${event.error}`);
      };

      recognitionRef.current.onnomatch = () => {
        logger.warn("Speech not recognized", null, "WebRTC");
        setStatus("Không nhận diện được giọng nói. Vui lòng nói rõ hơn.");
        flowStep(4, "No match for speech input");
      };
    } catch (error) {
      const detail = typeof error === 'object' && error !== null ? { message: (error as Error).message } : { message: String(error) };
      logger.error(
        "Failed to initialize speech for Vietnamese",
        detail,
        "WebRTC"
      );
      throw error;
    }
  }

  /**
   * Handle user speech input and generate response using Gemini AI
   */
  async function handleUserSpeech(text: string) {
    try {
      logger.info(`Processing user speech: "${text}"`, null, "WebRTC");
      flowStep(5, `handleUserSpeech received text`);

      updateEphemeralUserMessage({
        text: text,
        isFinal: true,
        status: "final",
      });
      clearEphemeralUserMessage();

      setStatus("Đang xử lý với Gemini AI...");
      flowStep(5, "Sending prompt to Gemini");

      // Generate AI response using Gemini
      const prompt = `Bạn là một trợ lý AI hữu ích, thân thiện và thông minh. Người dùng vừa nói: "${text}". 
      Hãy trả lời một cách tự nhiên, hữu ích và bằng tiếng Việt. Giữ phản hồi ngắn gọn nhưng đầy đủ thông tin.`;

      logger.debug("Sending prompt to Gemini", { prompt }, "WebRTC");

      const result = await model.generateContent(prompt);
      const aiText = result.response.text();
      flowStep(6, "Gemini response received");

      logger.info("Gemini response received", { response: aiText }, "WebRTC");

      // Add AI response to conversation
      const aiMessage: Conversation = {
        id: uuidv4(),
        role: "assistant",
        text: aiText,
        timestamp: new Date().toISOString(),
        isFinal: true,
      };

      setConversation((prev) => [...prev, aiMessage]);
      flowStep(6, "Assistant message appended");

      // Speak the response with selected voice
      if (synthRef.current) {
        const utterance = new SpeechSynthesisUtterance(aiText);
        utterance.rate = 0.9; // Slightly slower for better clarity
        utterance.volume = 1;

        // Use selected voice
        const selectedVoice = getSelectedVoice();
        if (selectedVoice) {
          utterance.voice = selectedVoice;
          utterance.lang = selectedVoice.lang; // Use voice's native language
          utterance.pitch = selectedVoice.name.toLowerCase().includes("female")
            ? 1.1
            : 1.0; // Higher pitch for female voices

          logger.debug(
            "Using selected voice for speech",
            {
              voice: selectedVoice.name,
              lang: selectedVoice.lang,
              isFemale: selectedVoice.name.toLowerCase().includes("female"),
            },
            "WebRTC"
          );
          flowStep(7, `Speaking with voice: ${selectedVoice.name}`);
        } else {
          utterance.lang = "vi-VN"; // Fallback to Vietnamese
          utterance.pitch = 1.1; // Default female pitch
          logger.warn(
            "No voice selected, using default settings",
            null,
            "WebRTC"
          );
          flowStep(7, "Speaking with fallback voice");
        }

        utterance.onstart = () => {
          setStatus(
            `Đang nói với giọng ${selectedVoice?.name || "mặc định"}...`
          );
          logger.debug("Started speaking AI response", null, "WebRTC");
        };
        utterance.onend = () => {
          setStatus("Phiên hoạt động - Nói tiếng Việt để tiếp tục");
          logger.debug("Finished speaking AI response", null, "WebRTC");
          flowStep(7, "Speech synthesis finished");
        };

        utterance.onerror = (event) => {
      logger.error("Speech synthesis error", { message: event?.error || 'unknown' }, "WebRTC");
          setStatus("Lỗi phát âm thanh");
        };

        synthRef.current.speak(utterance);
      }

      setStatus("Hoàn thành");
      flowStep(7, "handleUserSpeech completed");
    } catch (error) {
      const detail = typeof error === 'object' && error !== null ? { message: (error as Error).message } : { message: String(error) };
      logger.error("Error processing speech with Gemini", detail, "WebRTC");
      setStatus(`Lỗi xử lý: ${error}`);
      flowStep(10, "Error in handleUserSpeech");

      // Fallback response
      const fallbackText =
        "Xin lỗi, tôi gặp sự cố khi xử lý yêu cầu của bạn. Vui lòng thử lại.";
      const fallbackMessage: Conversation = {
        id: uuidv4(),
        role: "assistant",
        text: fallbackText,
        timestamp: new Date().toISOString(),
        isFinal: true,
      };

      setConversation((prev) => [...prev, fallbackMessage]);

      // Speak fallback response
      if (synthRef.current) {
        const utterance = new SpeechSynthesisUtterance(fallbackText);
        utterance.lang = "vi-VN";
        synthRef.current.speak(utterance);
      }
    }
  }

  /**
   * Start a new session with Speech Recognition
   */
  async function startSession() {
    try {
      logger.info("Starting new session", null, "WebRTC");
      flowStep(1, "startSession invoked");

      setStatus("Yêu cầu quyền truy cập microphone...");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      setupAudioVisualization(stream);
      flowStep(1, "Microphone granted & audio visualization initialized");

      setStatus("Khởi tạo nhận diện giọng nói...");
      await initializeSpeech();
      flowStep(2, "initializeSpeech finished");

      setStatus("Bắt đầu nhận diện giọng nói...");
      if (recognitionRef.current) {
        recognitionRef.current.start();
      }

      setIsSessionActive(true);
      setStatus("Phiên hoạt động - Nhấn để nói");
      logger.info("Session started successfully", null, "WebRTC");
      flowStep(3, "Session fully active");
    } catch (err) {
      const detail = typeof err === 'object' && err !== null ? { message: (err as Error).message } : { message: String(err) };
      logger.error("startSession error", detail, "WebRTC");
      setStatus(`Lỗi: ${err}`);
      stopSession();
      flowStep(10, "Error during startSession");
    }
  }

  /**
   * Stop the session & cleanup
   */
  function stopSession() {
    logger.info("Stopping session", null, "WebRTC");
    flowStep(9, "stopSession invoked");

    // Stop speech recognition
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    // Stop speech synthesis
    if (synthRef.current) {
      synthRef.current.cancel();
    }

    // Stop audio stream
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }

    // Stop audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Clear volume monitoring
    if (volumeIntervalRef.current) {
      clearInterval(volumeIntervalRef.current);
      volumeIntervalRef.current = null;
    }

    // Clear analyser
    if (analyserRef.current) {
      analyserRef.current = null;
    }

    // Clear audio indicator
    if (audioIndicatorRef.current) {
      audioIndicatorRef.current.classList.remove("active");
    }

    ephemeralUserMessageIdRef.current = null;

    setCurrentVolume(0);
    setIsSessionActive(false);
    setStatus("Phiên đã dừng");
    setMsgs([]);
    setConversation([]);

    logger.info("Session stopped and cleaned up", null, "WebRTC");
    flowStep(9, "Cleanup complete");
  }

  /**
   * Handle start/stop button click
   */
  function handleStartStopClick() {
    if (isSessionActive) {
      stopSession();
    } else {
      startSession();
    }
  }

  /**
   * Send a text message (for manual input) using Gemini AI
   */
  async function sendTextMessage(text: string) {
    if (!text.trim()) return;

    logger.info(`Sending text message: "${text}"`, null, "WebRTC");
    flowStep(8, "sendTextMessage invoked");

    try {
      setStatus("Đang xử lý tin nhắn với Gemini AI...");

      const userMessage: Conversation = {
        id: uuidv4(),
        role: "user",
        text,
        timestamp: new Date().toISOString(),
        isFinal: true,
        status: "final",
      };

      setConversation((prev) => [...prev, userMessage]);

      // Generate AI response using Gemini
      const prompt = `Bạn là một trợ lý AI hữu ích, thân thiện và thông minh. Người dùng vừa gửi tin nhắn: "${text}". 
      Hãy trả lời một cách tự nhiên, hữu ích và bằng tiếng Việt. Giữ phản hồi ngắn gọn nhưng đầy đủ thông tin.`;

      logger.debug("Sending text prompt to Gemini", { prompt }, "WebRTC");

      const result = await model.generateContent(prompt);
      const aiText = result.response.text();
      flowStep(6, "Gemini response (text message) received");

      logger.info(
        "Gemini text response received",
        { response: aiText },
        "WebRTC"
      );

      const aiMessage: Conversation = {
        id: uuidv4(),
        role: "assistant",
        text: aiText,
        timestamp: new Date().toISOString(),
        isFinal: true,
      };

      setConversation((prev) => [...prev, aiMessage]);
      flowStep(6, "Assistant message (text) appended");

      // Speak the response with selected voice
      if (synthRef.current) {
        const utterance = new SpeechSynthesisUtterance(aiText);
        utterance.rate = 0.9;
        utterance.volume = 1;

        // Use selected voice
        const selectedVoice = getSelectedVoice();
        if (selectedVoice) {
          utterance.voice = selectedVoice;
          utterance.lang = selectedVoice.lang;
          utterance.pitch = selectedVoice.name.toLowerCase().includes("female")
            ? 1.1
            : 1.0;

          logger.debug(
            "Using selected voice for text message",
            {
              voice: selectedVoice.name,
              lang: selectedVoice.lang,
            },
            "WebRTC"
          );
          flowStep(
            7,
            `Speaking text response with voice: ${selectedVoice.name}`
          );
        } else {
          utterance.lang = "vi-VN";
          utterance.pitch = 1.1;
          logger.warn(
            "No voice selected for text message, using default",
            null,
            "WebRTC"
          );
          flowStep(7, "Speaking text response with fallback voice");
        }

        utterance.onstart = () => {
          setStatus(
            `Đang nói với giọng ${selectedVoice?.name || "mặc định"}...`
          );
        };
        utterance.onend = () => {
          setStatus("Tin nhắn đã xử lý");
          flowStep(7, "Speech synthesis (text) finished");
        };

        utterance.onerror = (event) => {
          logger.error("Text message speech synthesis error", { message: (event as any)?.error || 'unknown' }, "WebRTC");
          setStatus("Lỗi phát âm thanh tin nhắn");
        };

        synthRef.current.speak(utterance);
      } else {
        setStatus("Tin nhắn đã xử lý");
      }
    } catch (error) {
      const detail = typeof error === 'object' && error !== null ? { message: (error as Error).message } : { message: String(error) };
      logger.error("Error sending text message with Gemini", detail, "WebRTC");
      setStatus(`Lỗi xử lý tin nhắn: ${error}`);
      flowStep(10, "Error in sendTextMessage");

      // Fallback response
      const fallbackText =
        "Xin lỗi, tôi gặp sự cố khi xử lý tin nhắn của bạn. Vui lòng thử lại.";
      const fallbackMessage: Conversation = {
        id: uuidv4(),
        role: "assistant",
        text: fallbackText,
        timestamp: new Date().toISOString(),
        isFinal: true,
      };

      setConversation((prev) => [...prev, fallbackMessage]);
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => stopSession();
  }, []);

  return {
    status,
    isSessionActive,
    audioIndicatorRef,
    startSession,
    stopSession,
    handleStartStopClick,
    registerFunction,
    msgs,
    currentVolume,
    conversation,
    sendTextMessage,
    // Expose a snapshot copy so consumer cannot mutate internal ref directly
    flowTimeline: [...flowTimelineRef.current],
  };
}
