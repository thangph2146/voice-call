import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useTranslations } from "@/components/translations-context";
import { flow } from "@/lib/flow-tracker";

interface BroadcastButtonProps {
  isSessionActive: boolean
  onClick: () => void
}

// FLOW SCOPE: ui.broadcastButton
// ORDER: 1:render, 2:click(start/end)
export function BroadcastButton({ isSessionActive, onClick }: BroadcastButtonProps) {
  const { t } = useTranslations();
  flow.event("ui.broadcastButton", "render", { active: isSessionActive });
  return (
    <Button
      variant={isSessionActive ? "destructive" : "default"}
      className="w-full py-6 text-lg font-medium flex items-center justify-center gap-2 motion-preset-shake"
  onClick={() => { flow.event("ui.broadcastButton", isSessionActive ? "click.end" : "click.start"); onClick(); }}
    >
      {isSessionActive && (
        <Badge variant="secondary" className="animate-pulse bg-red-100 text-red-700">
          {t('broadcast.live')}
        </Badge>
      )}
      {isSessionActive ? t('broadcast.end') : t('broadcast.start')}
    </Button>
  )
} 