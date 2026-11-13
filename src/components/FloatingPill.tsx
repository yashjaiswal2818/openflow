import React from 'react';
import { Mic, Sparkles, Settings as SettingsIcon } from 'lucide-react';

interface FloatingPillProps {
  isRecording: boolean;
  onToggleRecord: () => void;
  statusText?: string;
  previewText?: string;
  audioLevel?: number; // 0.0 to 1.0
  onOpenStudio?: () => void;
}

export const FloatingPill: React.FC<FloatingPillProps> = ({
  isRecording,
  onToggleRecord,
  statusText = 'Ready',
  previewText,
  audioLevel = 0.0,
  onOpenStudio
}) => {
  // Generate 8 dynamic bars based on live audio level
  const baseHeights = [8, 14, 20, 26, 22, 16, 12, 18];
  const dynamicBars = baseHeights.map((base, i) => {
    if (!isRecording) return 4;
    // Boost based on live microphone level + frequency variance
    const multiplier = 0.4 + audioLevel * (1.2 + (i % 3) * 0.4);
    return Math.min(32, Math.max(6, Math.round(base * multiplier)));
  });

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ease-out select-none">
      <div className={`glass-pill rounded-full px-5 py-3 flex items-center gap-4 transition-all duration-300 ${
        isRecording ? 'border-indigo-500/60 shadow-indigo-500/25 scale-105 ring-2 ring-indigo-500/20' : 'hover:border-white/20'
      }`}>
        
        {/* Record Trigger Button */}
        <button
          onClick={onToggleRecord}
          className={`relative p-2.5 rounded-full flex items-center justify-center transition-all ${
            isRecording 
              ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/50 animate-pulse' 
              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30'
          }`}
          title={isRecording ? "Stop recording" : "Hold Ctrl+Space or click to dictate"}
        >
          <Mic className="w-4 h-4" />
          {isRecording && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-400 rounded-full animate-ping" />
          )}
        </button>

        {/* Dynamic Center: Audio Waveform or Status */}
        <div className="flex flex-col min-w-[150px] max-w-[320px]">
          {isRecording ? (
            <div className="flex items-center gap-1.5 h-7 px-1">
              {dynamicBars.map((height, i) => (
                <div
                  key={i}
                  className="w-1.5 bg-gradient-to-t from-indigo-500 via-purple-400 to-pink-400 rounded-full transition-all duration-75"
                  style={{ height: `${height}px` }}
                />
              ))}
              <span className="text-xs font-semibold text-indigo-300 ml-2 animate-pulse">
                Listening...
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${
                statusText === 'pasted' ? 'bg-emerald-400 animate-ping' :
                statusText === 'processing' ? 'bg-amber-400 animate-pulse' :
                'bg-emerald-400'
              }`} />
              <span className="text-xs font-semibold text-zinc-300 tracking-wide uppercase">
                {statusText}
              </span>
              <span className="text-[10px] text-zinc-400 px-1.5 py-0.5 rounded bg-zinc-800/80 border border-zinc-700/80 font-mono">
                Ctrl+Space
              </span>
            </div>
          )}

          {previewText && (
            <p className="text-xs text-zinc-400 truncate mt-0.5 font-medium">
              {previewText}
            </p>
          )}
        </div>

        {/* Divider */}
        <div className="h-5 w-[1px] bg-zinc-800" />

        {/* Studio Button */}
        {onOpenStudio && (
          <button
            onClick={onOpenStudio}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            title="Open OpenFlow Studio"
          >
            <SettingsIcon className="w-4 h-4" />
          </button>
        )}

      </div>
    </div>
  );
};
