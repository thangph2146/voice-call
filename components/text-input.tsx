"use client"

import React, { useState } from "react"
import { flow } from "@/lib/flow-tracker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Send } from "lucide-react"

interface TextInputProps {
  onSubmit: (text: string) => void
  disabled?: boolean
}

// FLOW SCOPE: ui.textInput
// ORDER: 1:render, 2:change(text), 3:submit
export function TextInput({ onSubmit, disabled = false }: TextInputProps) {
  const [text, setText] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (text.trim()) {
      flow.event('ui.textInput', 'submit', { length: text.trim().length })
      onSubmit(text.trim())
      setText("")
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full gap-2">
      <Input
        type="text"
        placeholder="Type a message..."
        value={text}
        onChange={(e) => { const v = e.target.value; setText(v); if (v) flow.event('ui.textInput', 'change', { length: v.length }); }}
        disabled={disabled}
        className="flex-1"
      />
      <Button 
        type="submit" 
        disabled={disabled || !text.trim()}
        size="icon"
      >
        <Send className="h-4 w-4" />
      </Button>
    </form>
  )
}
