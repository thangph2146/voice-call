"use client"

import React, { useEffect, useState } from "react"
import { flow } from '@/lib/flow-tracker'
// Switched from Gemini hook to Dify streaming hook
import useWebRTCDifySession from "@/hooks/use-webrtc-dify"
import useVisualSpeech from "@/hooks/use-visual-speech"
import { VisualSpeakingIndicator } from "@/components/visual-speaking-indicator"
import { VoiceSelector } from "@/components/voice-select"
import { BroadcastButton } from "@/components/broadcast-button"
import { StatusDisplay } from "@/components/status"
import { TokenUsageDisplay } from "@/components/token-usage"
import { MessageControls } from "@/components/message-controls"
import { TextInput } from "@/components/text-input"
import { motion } from "framer-motion"
import { useToolsFunctions } from "@/hooks/use-tools"
import LoggerPanel from "@/components/logger-panel"

const App: React.FC = () => {
  // FLOW SCOPE: app.page
  // ORDERED STEPS:
  // 1. mount -> component mounted
  // 2. register.tools -> expose tool functions (parity registry in Dify hook)
  // 3. (external) user starts session via BroadcastButton -> flows in webrtc hooks
  // 4. conversation.update -> conversation array length changed
  // 5. user.submitText (handled in TextInput) -> sendTextMessage -> Gemini hook
  // EVENTS (non-step): tool.register (per tool), token.usage (TokenUsageDisplay render), status.updated (status change), panel.logger.render
  // State for voice selection
  const [voice, setVoice] = useState("ash")

  // WebRTC Audio Session Hook
  const {
    status,
    isSessionActive,
    registerFunction,
    handleStartStopClick,
    startSession,
    stopSession,
    msgs,
    conversation,
    sendTextMessage
  } = useWebRTCDifySession(voice)

  // Visual speech detection (single face)
  const { isReady: camReady, isSpeaking: camSpeaking, mouthRatio, baseline, events: camEvents, stream: camStream } = useVisualSpeech({
    thresholdMultiplier: 1.6,
    minFramesSpeaking: 3,
    minFramesSilent: 5,
    fps: 12,
    warmupFrames: 25,
    debug: false,
    collectEvents: true
  })

  const [autoStarted, setAutoStarted] = useState(false)
  const lastSpeakingRef = React.useRef<number>(Date.now())
  const AUTO_IDLE_MS = 30_000 // auto stop after 30s no speaking

  // Auto start session when camera detects speaking and audio session not yet active
  useEffect(() => {
    if (camReady && camSpeaking) {
      lastSpeakingRef.current = Date.now()
      if (!isSessionActive) {
        startSession()
        setAutoStarted(true)
      }
    }
  }, [camReady, camSpeaking, isSessionActive, startSession])

  // Auto stop after idle period (only if auto started)
  useEffect(() => {
    if (!isSessionActive) return
    const id = setInterval(() => {
      if (autoStarted && Date.now() - lastSpeakingRef.current > AUTO_IDLE_MS) {
        stopSession()
        setAutoStarted(false)
      }
    }, 3000)
    return () => clearInterval(id)
  }, [isSessionActive, autoStarted, stopSession])

  // Get all tools functions
  const toolsFunctions = useToolsFunctions();

  useEffect(() => { flow.step('app.page', 1, 'mount') }, [])

  useEffect(() => {
    flow.step('app.page', 2, 'register.tools')
    Object.entries(toolsFunctions).forEach(([name, func]) => {
      const functionNames: Record<string, string> = {
        timeFunction: 'getCurrentTime',
        backgroundFunction: 'changeBackgroundColor',
        partyFunction: 'partyMode',
        launchWebsite: 'launchWebsite',
        copyToClipboard: 'copyToClipboard',
        scrapeWebsite: 'scrapeWebsite'
      };

      registerFunction(functionNames[name], func);
      flow.event('app.page', 'tool.register', { exposedAs: functionNames[name] })
    });
  }, [registerFunction, toolsFunctions])

  useEffect(() => { if (conversation.length) flow.event('app.page', 'conversation.update', { total: conversation.length }) }, [conversation.length])

  return (
    <main className="min-h-screen bg-gradient-to-br from-background to-muted/20 p-4">
      <motion.div
        className="container mx-auto max-w-7xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Header Section */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">AI Voice Assistant</h1>
          <p className="text-muted-foreground">Trợ lý giọng nói thông minh với nhận diện bằng mắt</p>
        </div>

        {/* Main Content Grid */}
        <motion.div
          className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          {/* Left Column - Controls */}
          <div className="lg:col-span-1 space-y-6">
            {/* Voice Selection */}
            <div className="bg-card p-6 rounded-xl border shadow-sm">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                🎤 Chọn giọng nói
              </h3>
              <VoiceSelector value={voice} onValueChange={setVoice} />
            </div>

            {/* Session Control */}
            <div className="bg-card p-6 rounded-xl border shadow-sm">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                📡 Điều khiển phiên
              </h3>
              <div className="flex justify-center">
                <BroadcastButton
                  isSessionActive={isSessionActive}
                  onClick={handleStartStopClick}
                />
              </div>
            </div>

            {/* Status Display */}
            {status && (
              <div className="bg-card p-6 rounded-xl border shadow-sm">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  📊 Trạng thái
                </h3>
                <StatusDisplay status={status} />
              </div>
            )}
          </div>

          {/* Center Column - Visual Indicator */}
          <div className="lg:col-span-1">
            <div className="bg-card p-6 rounded-xl border shadow-sm h-full">
              <VisualSpeakingIndicator
                isReady={camReady}
                isSpeaking={camSpeaking}
                mouthRatio={mouthRatio}
                baseline={baseline ?? undefined}
                autoStarted={autoStarted}
                stream={camStream}
              />
            </div>
          </div>

          {/* Right Column - Chat & Controls */}
          <div className="lg:col-span-1 space-y-6">
            {/* Token Usage */}
            <div className="bg-card p-6 rounded-xl border shadow-sm">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                💰 Sử dụng token
              </h3>
              <TokenUsageDisplay messages={msgs} />
            </div>

            {/* Message Controls and Input */}
            {status && (
              <motion.div
                className="bg-card p-6 rounded-xl border shadow-sm"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
              >
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  💬 Cuộc trò chuyện
                </h3>
                <div className="space-y-4">
                  <MessageControls conversation={conversation} msgs={msgs} />
                  <TextInput
                    onSubmit={sendTextMessage}
                    disabled={!isSessionActive}
                  />
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>

        {/* Camera Events Timeline - Full Width at Bottom */}
        {camEvents?.length > 0 && (
          <motion.div
            className="mt-8 bg-card p-6 rounded-xl border shadow-sm"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.3 }}
          >
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              📈 Lịch sử sự kiện camera
            </h3>
            <div className="max-h-40 overflow-auto text-[10px] font-mono bg-muted/20 rounded-lg p-3">
              {camEvents.slice(-30).reverse().map((e, i) => (
                <div key={`${e.ts}-${i}`} className="flex gap-1 py-0.5">
                  <span className="text-muted-foreground w-20">{new Date(e.ts).toLocaleTimeString()}</span>
                  <span className="w-16">{e.phase}</span>
                  <span className="w-20">r={e.ratio.toFixed(3)}</span>
                  {e.threshold && <span className="w-20">thr={e.threshold.toFixed(3)}</span>}
                  {e.baseline && <span className="w-20">base={e.baseline.toFixed(3)}</span>}
                  {e.info?.consec !== undefined && <span className="w-12">c={e.info.consec as number}</span>}
                  <span className={`w-8 ${e.speaking ? 'text-green-600 font-bold' : 'text-muted-foreground'}`}>
                    {e.speaking ? 'ON' : 'off'}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* Logger Panel for debugging */}
      <LoggerPanel />
    </main>
  )
}

export default App;