"use client";
import { useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";

/**
 * Visual speech activity detection (single face) using MediaPipe FaceMesh landmarks.
 * Heuristic: mouth open ratio = vertical(lips) / horizontal(mouth width)
 */
export interface VisualSpeechOptions {
  thresholdMultiplier?: number; // multiplier over baseline (speak-on)
  releaseMultiplier?: number;   // multiplier for speak-off hysteresis
  minFramesSpeaking?: number;   // frames needed to enter speaking
  minFramesSilent?: number;     // frames needed to exit speaking
  fps?: number;                 // processing FPS (<= video FPS)
  warmupFrames?: number;        // frames to build baseline
  debug?: boolean;
  collectEvents?: boolean;      // return structured events for UI
}

export interface VisualSpeechEvent {
  ts: string; // ISO timestamp
  ratio: number;
  baseline: number | null;
  threshold: number | null;
  speaking: boolean; // speaking state after this event
  phase: 'warmup' | 'baseline_lock' | 'frame' | 'speak_on' | 'speak_off';
  info?: Record<string, unknown>;
}

export function useVisualSpeech(options: VisualSpeechOptions = {}) {
  const {
  thresholdMultiplier = 1.6,
  releaseMultiplier = 1.3,
  minFramesSpeaking = 3,
  minFramesSilent = 5,
    fps = 12,
    warmupFrames = 25,
    debug = false,
    collectEvents = false,
  } = options;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceMeshRef = useRef<any>(null);
  const baselineRef = useRef<number | null>(null);
  const baselineMouthWidthRef = useRef<number | null>(null);
  const baselineEyeWidthRef = useRef<number | null>(null);
  const warmupBufferRef = useRef<number[]>([]);
  const warmupMouthWidthRef = useRef<number[]>([]);
  const warmupEyeWidthRef = useRef<number[]>([]);
  const speakingRef = useRef(false);
  const consecSpeakingRef = useRef(0);
  const consecSilentRef = useRef(0);
  const frameTimerRef = useRef<number | null>(null);
  const prevCenterRef = useRef<{ x: number; y: number } | null>(null);
  const smoothRatioRef = useRef<number>(0);

  const [isReady, setIsReady] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [mouthRatio, setMouthRatio] = useState(0);
  const [baseline, setBaseline] = useState<number | null>(null);
  const eventsRef = useRef<VisualSpeechEvent[]>([]);
  const [events, setEvents] = useState<VisualSpeechEvent[]>([]);

  function pushEvent(e: Omit<VisualSpeechEvent, 'ts'>) {
    if (!collectEvents) return;
    const ev: VisualSpeechEvent = { ts: new Date().toISOString(), ...e };
    eventsRef.current.push(ev);
    if (eventsRef.current.length > 120) {
      eventsRef.current.splice(0, eventsRef.current.length - 120);
    }
    setEvents([...eventsRef.current]);
  }

  function dist(a: any, b: any) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function mid(a: any, b: any) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }

  async function processFrame() {
    if (!videoRef.current || !faceMeshRef.current) return;
    const fm = faceMeshRef.current;
    // @ts-ignore
    await fm.send({ image: videoRef.current });
  }

  function handleResults(results: any) {
    const lm = results.multiFaceLandmarks?.[0];
    if (!lm) return;
    const top = lm[13];
    const bottom = lm[14];
    const left = lm[61];
    const right = lm[291];
    const leftEyeOuter = lm[33];
    const rightEyeOuter = lm[263];
    if (!top || !bottom || !left || !right) return;

    const vertical = dist(top, bottom);
    const mouthWidth = dist(left, right) || 1;
    const eyeWidth = leftEyeOuter && rightEyeOuter ? dist(leftEyeOuter, rightEyeOuter) : mouthWidth; // fallback
    const rawRatio = vertical / mouthWidth;
  // Exponential smoothing to reduce jitter but keep peaks
  const alpha = 0.65; // higher == more reactive
    const ratio = smoothRatioRef.current = smoothRatioRef.current === 0 ? rawRatio : (alpha * rawRatio + (1 - alpha) * smoothRatioRef.current);
    setMouthRatio(ratio);

    if (baselineRef.current === null) {
      warmupBufferRef.current.push(rawRatio);
      warmupMouthWidthRef.current.push(mouthWidth);
      warmupEyeWidthRef.current.push(eyeWidth);
      if (warmupBufferRef.current.length >= warmupFrames) {
        const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
        const base = avg(warmupBufferRef.current);
        const baseMouth = avg(warmupMouthWidthRef.current);
        const baseEye = avg(warmupEyeWidthRef.current);
        baselineRef.current = base;
        baselineMouthWidthRef.current = baseMouth;
        baselineEyeWidthRef.current = baseEye;
        setBaseline(base);
        debug && logger.debug("VISUAL_SPEECH_BASELINE", { base });
        pushEvent({ ratio, baseline: base, threshold: base * thresholdMultiplier, speaking: speakingRef.current, phase: 'baseline_lock', info: { baseMouth, baseEye } });
      }
      else {
        pushEvent({ ratio, baseline: null, threshold: null, speaking: speakingRef.current, phase: 'warmup', info: { collected: warmupBufferRef.current.length } });
      }
      return;
    }

    // Drift baseline slowly while not speaking to adapt to pose changes
    if (!speakingRef.current) {
      const ema = 0.02;
      baselineRef.current = (1 - ema) * (baselineRef.current ?? rawRatio) + ema * rawRatio;
      // Keep width baselines updated slightly as well
      if (baselineMouthWidthRef.current != null)
        baselineMouthWidthRef.current = (1 - ema) * baselineMouthWidthRef.current + ema * mouthWidth;
      if (baselineEyeWidthRef.current != null)
        baselineEyeWidthRef.current = (1 - ema) * baselineEyeWidthRef.current + ema * eyeWidth;
    }

    const base = baselineRef.current!;
    const speakThreshold = base * thresholdMultiplier;
    const releaseThreshold = base * releaseMultiplier;

    // Head yaw/scale gating: if face width shrinks, tighten threshold
    const mouthWidthFactor = baselineMouthWidthRef.current ? mouthWidth / baselineMouthWidthRef.current : 1;
    const eyeWidthFactor = baselineEyeWidthRef.current ? eyeWidth / baselineEyeWidthRef.current : 1;
    const widthFactor = Math.min(mouthWidthFactor, eyeWidthFactor);
    let adjustedSpeakThreshold = speakThreshold;
    if (widthFactor < 0.85) {
      // up to +10% stricter when width shrinks substantially
      const tighten = Math.min(0.1, (0.85 - widthFactor) * 0.5);
      adjustedSpeakThreshold = speakThreshold * (1 + tighten);
    }

    // Motion gating: large mouth-center motion suggests head move; require even higher ratio to trigger
    const center = mid(left, right);
    let moved = 0;
    if (prevCenterRef.current) {
      moved = dist(center, prevCenterRef.current);
    }
    prevCenterRef.current = center;
    const motionNorm = eyeWidth || 1;
  const motion = moved / motionNorm; // normalized motion
  const motionHigh = motion > 0.035; // relaxed threshold for head movement

  const currentlySpeaking = ratio > (motionHigh ? adjustedSpeakThreshold * 1.05 : adjustedSpeakThreshold) && (ratio - base) > 0.015;
    pushEvent({ ratio, baseline: base, threshold: adjustedSpeakThreshold, speaking: speakingRef.current, phase: 'frame', info: { mouthWidth, eyeWidth, widthFactor, motion } });

    if (currentlySpeaking) {
      consecSpeakingRef.current += 1;
      consecSilentRef.current = 0;
      if (!speakingRef.current && consecSpeakingRef.current >= minFramesSpeaking) {
        speakingRef.current = true;
        setIsSpeaking(true);
        debug && logger.debug("VISUAL_SPEECH_ON", { ratio, threshold: speakThreshold });
        pushEvent({ ratio, baseline: baselineRef.current, threshold: speakThreshold, speaking: true, phase: 'speak_on', info: { consec: consecSpeakingRef.current } });
      }
    } else {
      consecSilentRef.current += 1;
      consecSpeakingRef.current = 0;
      const belowRelease = ratio < releaseThreshold;
      if (speakingRef.current && consecSilentRef.current >= minFramesSilent && belowRelease) {
        speakingRef.current = false;
        setIsSpeaking(false);
        debug && logger.debug("VISUAL_SPEECH_OFF", { ratio, threshold: speakThreshold });
        pushEvent({ ratio, baseline: baselineRef.current, threshold: speakThreshold, speaking: false, phase: 'speak_off', info: { consec: consecSilentRef.current } });
      }
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
        if (cancelled) return;
        videoRef.current = document.createElement('video');
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        await videoRef.current.play();
        // dynamic import
        const mod = await import('@mediapipe/face_mesh');
        const FaceMesh = (mod as any).FaceMesh;
        faceMeshRef.current = new FaceMesh({ locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
        faceMeshRef.current.setOptions({ selfieMode: true, maxNumFaces: 1, refineLandmarks: true });
        faceMeshRef.current.onResults(handleResults);
        setIsReady(true);
        const interval = 1000 / fps;
        const tick = async () => { await processFrame(); frameTimerRef.current = window.setTimeout(tick, interval); };
        tick();
      } catch (err) {
        logger.error('VISUAL_SPEECH_INIT_ERROR', { message: (err as Error).message });
      }
    })();

    return () => {
      cancelled = true;
      if (frameTimerRef.current) clearTimeout(frameTimerRef.current);
      const tracks = streamRef.current?.getTracks();
      tracks?.forEach(t => t.stop());
    };
  }, [fps, thresholdMultiplier, minFramesSilent, minFramesSpeaking, warmupFrames, debug]);

  return { isReady, isSpeaking, mouthRatio, baseline, events, stream: streamRef.current };
}

export default useVisualSpeech;
