"use client"

import React, { useEffect, useState } from "react"
import { flow } from '@/lib/flow-tracker'
// Switched from Gemini hook to Dify streaming hook
import useWebRTCDifySession from "@/hooks/use-webrtc-dify"
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
    msgs,
    conversation,
    sendTextMessage
  } = useWebRTCDifySession(voice)

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
    <main className="h-full">
      <motion.div 
        className="container flex flex-col items-center justify-center mx-auto my-20 shadow-xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <motion.div 
          className="w-full max-w-md bg-card text-card-foreground shadow-sm p-6 space-y-4"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <VoiceSelector value={voice} onValueChange={setVoice} />
          
          <div className="flex flex-col items-center gap-4">
            <BroadcastButton 
              isSessionActive={isSessionActive} 
              onClick={handleStartStopClick}
            />
          </div>
          {msgs.length > 4 && <TokenUsageDisplay messages={msgs} />}
          {status && (
            <motion.div 
              className="w-full flex flex-col gap-2"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
            >
              <MessageControls conversation={conversation} msgs={msgs} />
              <TextInput 
                onSubmit={sendTextMessage}
                disabled={!isSessionActive}
              />
            </motion.div>
          )}
        </motion.div>
        
        {status && <StatusDisplay status={status} />}
      </motion.div>

      {/* Logger Panel for debugging */}
      <LoggerPanel />
    </main>
  )
}

export default App;