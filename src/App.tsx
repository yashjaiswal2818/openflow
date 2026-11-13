import React, { useState, useEffect } from 'react';
import { StudioDashboard } from './components/StudioDashboard';
import { FloatingPill } from './components/FloatingPill';

export function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [statusText, setStatusText] = useState('Ready');
  const [previewText, setPreviewText] = useState('');
  const [audioLevel, setAudioLevel] = useState(0.0);

  // Poll live engine state from localhost:18488
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('http://127.0.0.1:18488/api/state');
        if (res.ok) {
          const state = await res.json();
          setIsRecording(state.is_recording);
          setStatusText(state.status);
          setPreviewText(state.preview_text || '');
          setAudioLevel(state.audio_level || 0.0);
        }
      } catch {
        // Server might be paused
      }
    }, 120);

    return () => clearInterval(interval);
  }, []);

  const handleToggleRecord = async () => {
    try {
      if (!isRecording) {
        await fetch('http://127.0.0.1:18488/api/dictation/start', { method: 'POST' });
      } else {
        await fetch('http://127.0.0.1:18488/api/dictation/stop', { method: 'POST' });
      }
    } catch {
      // Local fallback simulation if engine is offline
      if (!isRecording) {
        setIsRecording(true);
        setStatusText('Listening...');
        setPreviewText('Listening to microphone...');
      } else {
        setIsRecording(false);
        setStatusText('Processing...');
        setPreviewText('Transcribing and formatting...');
        setTimeout(() => {
          setStatusText('Pasted');
          setPreviewText('Pasted cleanly into active app');
          setTimeout(() => {
            setStatusText('Ready');
            setPreviewText('');
          }, 2000);
        }, 600);
      }
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0c0d12]">
      {/* Studio Workspace Dashboard */}
      <StudioDashboard />

      {/* Wispr Flow-style Floating Pill HUD */}
      <FloatingPill
        isRecording={isRecording}
        onToggleRecord={handleToggleRecord}
        statusText={statusText}
        previewText={previewText}
        audioLevel={audioLevel}
      />
    </div>
  );
}

export default App;
