import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useTranslations } from "@/components/translations-context"
import { Label } from "@/components/ui/label"
import { useState, useEffect } from "react"

interface VoiceSelectorProps {
  value: string
  onValueChange: (value: string) => void
}

interface VoiceOption {
  name: string
  lang: string
  voiceURI: string
  localService: boolean
  default: boolean
}

export function VoiceSelector({ value, onValueChange }: VoiceSelectorProps) {
  const { t } = useTranslations()
  const [voices, setVoices] = useState<VoiceOption[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = speechSynthesis.getVoices()
      if (availableVoices.length > 0) {
        setVoices(availableVoices)
        setLoading(false)

        // Set default voice if none selected
        if (!value && availableVoices.length > 0) {
          const vietnameseVoice = availableVoices.find(voice =>
            voice.lang.startsWith('vi') && voice.name.toLowerCase().includes('female')
          ) || availableVoices.find(voice =>
            voice.lang.startsWith('vi')
          ) || availableVoices.find(voice =>
            voice.name.toLowerCase().includes('female')
          ) || availableVoices[0]

          onValueChange(vietnameseVoice.voiceURI)
        }
      }
    }

    // Load voices immediately
    loadVoices()

    // Also listen for voiceschanged event (some browsers load voices asynchronously)
    speechSynthesis.addEventListener('voiceschanged', loadVoices)

    return () => {
      speechSynthesis.removeEventListener('voiceschanged', loadVoices)
    }
  }, [value, onValueChange])

  const getVoiceDisplayName = (voice: VoiceOption) => {
    const langName = voice.lang.split('-')[0].toUpperCase()
    const isFemale = voice.name.toLowerCase().includes('female') || voice.name.toLowerCase().includes('woman')
    const isMale = voice.name.toLowerCase().includes('male') || voice.name.toLowerCase().includes('man')
    const gender = isFemale ? '♀' : isMale ? '♂' : ''
    const local = voice.localService ? '📍' : '☁️'

    return `${voice.name} ${gender} ${local} (${langName})`
  }

  const vietnameseVoices = voices.filter(voice => voice.lang.startsWith('vi'))
  const englishVoices = voices.filter(voice => voice.lang.startsWith('en'))
  const otherVoices = voices.filter(voice => !voice.lang.startsWith('vi') && !voice.lang.startsWith('en'))

  return (
    <div className="form-group space-y-2">
      <Label htmlFor="voiceSelect" className="text-sm font-medium">
        {t('voice.select')} ({voices.length} giọng có sẵn)
      </Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={loading ? "Đang tải giọng nói..." : "Chọn giọng nói"} />
        </SelectTrigger>
        <SelectContent>
          {vietnameseVoices.length > 0 && (
            <>
              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground bg-muted/50">
                🇻🇳 Tiếng Việt
              </div>
              {vietnameseVoices.map((voice) => (
                <SelectItem key={voice.voiceURI} value={voice.voiceURI}>
                  {getVoiceDisplayName(voice)}
                </SelectItem>
              ))}
            </>
          )}

          {englishVoices.length > 0 && (
            <>
              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground bg-muted/50">
                🇺🇸 🇬🇧 Tiếng Anh
              </div>
              {englishVoices.slice(0, 5).map((voice) => (
                <SelectItem key={voice.voiceURI} value={voice.voiceURI}>
                  {getVoiceDisplayName(voice)}
                </SelectItem>
              ))}
            </>
          )}

          {otherVoices.length > 0 && (
            <>
              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground bg-muted/50">
                🌍 Ngôn ngữ khác
              </div>
              {otherVoices.slice(0, 5).map((voice) => (
                <SelectItem key={voice.voiceURI} value={voice.voiceURI}>
                  {getVoiceDisplayName(voice)}
                </SelectItem>
              ))}
            </>
          )}

          {voices.length === 0 && !loading && (
            <SelectItem value="" disabled>
              Không tìm thấy giọng nói nào
            </SelectItem>
          )}
        </SelectContent>
      </Select>

      <div className="text-xs text-muted-foreground">
        💡 Mẹo: Ưu tiên chọn giọng nữ tiếng Việt cho trải nghiệm tốt nhất
      </div>
    </div>
  )
} 