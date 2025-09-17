"use client";
import React from "react";
import { Camera, CameraOff, Mic, Eye } from "lucide-react";

interface VisualSpeakingIndicatorProps {
  isReady: boolean;
  isSpeaking: boolean;
  baseline?: number | null;
  autoStarted: boolean;
  stream?: MediaStream | null;
}

export const VisualSpeakingIndicator: React.FC<VisualSpeakingIndicatorProps> = ({
  isReady,
  isSpeaking,
  baseline,
  autoStarted,
  stream
}) => {
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  
  React.useEffect(() => {
    if (videoRef.current && stream) {
      if (videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream as MediaStream
      }
    }
  }, [stream])

  // Determine current state for better UX
  const hasBaseline = baseline !== null && baseline !== undefined;
  const isInitializing = !isReady || !hasBaseline;
  const statusText = isInitializing ? 'KHỞI TẠO' : (isSpeaking ? 'ĐANG NÓI' : 'SẴN SÀNG');
  const statusColor = isInitializing ? 'bg-yellow-500' : (isSpeaking ? 'bg-green-500' : 'bg-blue-500');

  return (
    <div className="flex flex-col gap-4">
      {/* Status Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {stream ? <Camera className="h-4 w-4 text-green-600" /> : <CameraOff className="h-4 w-4 text-red-500" />}
          <span className="font-medium text-sm text-foreground">Camera Status</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-3 py-1 rounded-full text-white font-medium ${statusColor}`}>
            {statusText}
          </span>
          {autoStarted && (
            <span className="text-xs px-2 py-1 rounded-full bg-emerald-600 text-white font-medium">
              AUTO
            </span>
          )}
        </div>
      </div>

      {/* Video Preview */}
      {stream && (
        <div className="relative rounded-lg overflow-hidden border-2 border-border bg-black shadow-lg">
          <video ref={videoRef} autoPlay playsInline muted className="block w-full h-96 object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
          
          {/* Status Overlays */}
          <div className="absolute bottom-3 left-3 flex items-center gap-2">
            <Eye className="h-4 w-4 text-white" />
            <span className="text-sm text-white font-medium">Live Preview</span>
          </div>
          
          {isSpeaking && (
            <div className="absolute top-3 right-3 flex items-center gap-2 bg-green-500/95 px-3 py-1.5 rounded-full animate-pulse">
              <Mic className="h-4 w-4 text-white" />
              <span className="text-sm text-white font-bold">SPEAKING</span>
            </div>
          )}
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-muted/30 rounded-lg p-3">
          <div className="text-xs text-muted-foreground font-medium mb-1">Speaking State</div>
          <div className={`text-sm font-bold ${isSpeaking ? 'text-green-600' : 'text-muted-foreground'}`}>
            {isSpeaking ? '🗣️ Speaking' : '🤐 Silent'}
          </div>
        </div>
        
        {hasBaseline && (
            <div className="bg-muted/30 rounded-lg p-3">
              <div className="text-xs text-muted-foreground font-medium mb-1">Baseline</div>
              <div className="text-sm font-mono font-bold">{baseline.toFixed(3)}</div>
            </div>
        )}
      </div>
    </div>
  );
};

export default VisualSpeakingIndicator;
