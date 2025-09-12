"use client"

import { useEffect } from 'react'
import { flow } from "@/lib/flow-tracker"
import { toast } from 'sonner'
import { useTranslations } from "@/components/translations-context"

interface StatusDisplayProps {
  status: string
}

// FLOW SCOPE: ui.statusDisplay
// ORDER: 1:statusChange -> emits classification event
export function StatusDisplay({ status }: StatusDisplayProps) {
  const { t } = useTranslations();
  useEffect(() => {
  flow.event("ui.statusDisplay", "statusChange", { status });
    if (status.startsWith("Error")) {
      toast.error(t('status.error'), {
        description: status,
        duration: 3000,
      })
    } 
    else if (status.startsWith("Session established")) {
        toast.success(t('status.success'), {
            description: status,
            duration: 5000,
        })
    }
    else {
      toast.info(t('status.info'), {
        description: status,
        duration: 3000,
      })
    }
  }, [status, t])

  // Determine status type and color
  const getStatusType = (status: string) => {
    if (status.includes("Error") || status.includes("Lỗi")) return { type: "error", color: "text-red-600 bg-red-50 border-red-200" };
    if (status.includes("established") || status.includes("Đang nghe") || status.includes("Live")) return { type: "success", color: "text-green-600 bg-green-50 border-green-200" };
    if (status.includes("Đang chờ") || status.includes("Sẵn sàng")) return { type: "waiting", color: "text-blue-600 bg-blue-50 border-blue-200" };
    return { type: "info", color: "text-gray-600 bg-gray-50 border-gray-200" };
  };

  const { type, color } = getStatusType(status);

  return (
    <div className={`p-3 rounded-lg border ${color}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-2 h-2 rounded-full ${type === 'success' ? 'bg-green-500 animate-pulse' : type === 'error' ? 'bg-red-500' : type === 'waiting' ? 'bg-blue-500 animate-pulse' : 'bg-gray-500'}`} />
        <span className="text-sm font-medium">
          {type === 'success' ? '✅ Hoạt động' : type === 'error' ? '❌ Lỗi' : type === 'waiting' ? '⏳ Chờ' : 'ℹ️ Thông tin'}
        </span>
      </div>
      <p className="text-sm leading-relaxed">{status}</p>
    </div>
  )
} 