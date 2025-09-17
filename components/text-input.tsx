"use client"

import React, { useState } from "react"
import { flow } from "@/lib/flow-tracker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Send, Loader2 } from "lucide-react"

interface TextInputProps {
  onSubmit: (text: string) => void
  disabled?: boolean
  isLoading?: boolean
}

// FLOW SCOPE: ui.textInput
// ORDER: 1:render, 2:change(text), 3:submit
export function TextInput({ onSubmit, disabled = false, isLoading = false }: TextInputProps) {
  const [text, setText] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (text.trim() && !isLoading) {
      flow.event('ui.textInput', 'submit', { length: text.trim().length })
      onSubmit(text.trim())
      setText("")
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const formEvent = { preventDefault: () => {}, currentTarget: e.currentTarget } as React.FormEvent
      handleSubmit(formEvent)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full gap-2">
      <Input
        type="text"
        placeholder={"Type your message..."}
        value={text}
        onChange={(e) => { const v = e.target.value; setText(v); if (v) flow.event('ui.textInput', 'change', { length: v.length }); }}
        onKeyDown={handleKeyDown}
        disabled={disabled || isLoading}
        className="flex-1"
      />
      <Button 
        type="submit" 
        disabled={disabled || !text.trim() || isLoading}
        size="icon"
        className="shrink-0"
      >
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </Button>
    </form>
  )
}
