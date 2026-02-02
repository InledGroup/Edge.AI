import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import EngineManager from '@/lib/ai/engine-manager';
import { uiStore, conversationsStore, activeConversationIdSignal } from '@/lib/stores';
import { addMessage, getOrCreateConversation, updateConversationTitle, generateTitle } from '@/lib/db/conversations';
import { speechService, voiceState, isVoiceModeEnabled } from '@/lib/voice/speech-service';
import { Mic, MicOff, PhoneOff, X, MoreHorizontal, Settings, Volume2, Captions, Loader2 } from 'lucide-preact';

export default function LiveMode() {
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Close if not enabled
  if (!uiStore.showLiveMode) return null;

  // Initialize Model
  useEffect(() => {
    async function initModel() {
      try {
        if (!EngineManager.isLiveEngineReady()) {
          console.log('🔌 Initializing Live Engine...');
          await EngineManager.getLiveEngine('lfm-2-audio-1.5b', (progress, msg) => {
            console.log(`Live Model: ${progress}% - ${msg}`);
          });
        }
        setModelReady(true);
      } catch (error: any) {
        console.error('Failed to load live model:', error);
        setLoadingError(error.message || 'Error loading model');
      }
    }
    initModel();
  }, []);

  // Initialize Audio Visualizer
  useEffect(() => {
    async function initVisualizer() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
        const ctx = new AudioContextClass();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        
        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);
        
        audioContextRef.current = ctx;
        analyserRef.current = analyser;
        sourceRef.current = source;

        drawVisualizer();
      } catch (e) {
        console.error('Error accessing microphone for visualizer:', e);
      }
    }

    if (!isMuted && modelReady) {
      initVisualizer();
    } else {
      cleanupVisualizer();
    }

    return () => cleanupVisualizer();
  }, [isMuted, modelReady]);

  function cleanupVisualizer() {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      // Stop stream tracks
      sourceRef.current.mediaStream.getTracks().forEach(t => t.stop());
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    audioContextRef.current = null;
    analyserRef.current = null;
  }

  function drawVisualizer() {
    if (!canvasRef.current || !analyserRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const draw = () => {
      if (!analyserRef.current) return;
      
      analyserRef.current.getByteFrequencyData(dataArray);
      
      // Calculate average volume
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const average = sum / bufferLength;
      
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      
      // Determine color and state
      let mainColor = '#10B981'; // Default Emerald-500
      let outerColor = 'rgba(16, 185, 129, 0.8)';
      let baseRadius = 60 + (average * 0.8);
      
      // Processing State: Intense Green + Auto Pulse
      if (voiceState.value === 'processing') {
        mainColor = '#00ff41'; // Matrix/Terminal Bright Green
        outerColor = 'rgba(0, 255, 65, 0.6)';
        // Artificial pulse for processing state
        const pulse = (Math.sin(Date.now() / 150) + 1) * 8; 
        baseRadius = 60 + pulse;
      }
      
      // Outer glow
      const gradient = ctx.createRadialGradient(centerX, centerY, baseRadius * 0.5, centerX, centerY, baseRadius);
      gradient.addColorStop(0, outerColor); 
      gradient.addColorStop(1, 'rgba(16, 185, 129, 0)');

      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius, 0, 2 * Math.PI);
      ctx.fillStyle = gradient;
      ctx.fill();

      // Inner solid circle
      ctx.beginPath();
      // If processing, inner circle also pulses slightly
      const innerRadius = voiceState.value === 'processing' 
        ? 50 + ((Math.sin(Date.now() / 150) + 1) * 3)
        : 50 + (average * 0.2);
        
      ctx.arc(centerX, centerY, innerRadius, 0, 2 * Math.PI);
      ctx.fillStyle = mainColor;
      ctx.fill();

      // Ripple effect when speaking (AI or User)
      if (voiceState.value === 'speaking' || average > 30) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, baseRadius + 20, 0, 2 * Math.PI);
        ctx.strokeStyle = voiceState.value === 'processing' 
           ? `rgba(0, 255, 65, 0.4)`
           : `rgba(16, 185, 129, ${Math.max(0, 0.5 - (average/255))})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();
  }

  // Handle conversation loop
  useEffect(() => {
    if (!modelReady) return;

    // Force enable voice mode for continuous interaction
    isVoiceModeEnabled.value = true;

    let active = true;

    const handleSpeechResult = async (text: string) => {
      if (!active || isMuted || !text.trim()) return;
      
      console.log('🗣️ User said:', text);
      setTranscript(text);
      setResponse(''); 
      
      // Stop listening while processing
      speechService.stopListening();
      
      try {
        // 1. Get/Create Conversation & Save User Message
        const currentConvId = activeConversationIdSignal.value;
        const conversation = await getOrCreateConversation(currentConvId || undefined, 'lfm-2-audio-1.5b');
        
        if (!currentConvId) {
          activeConversationIdSignal.value = conversation.id;
          const updatedList = await import('@/lib/db/conversations').then(m => m.getConversationsSorted());
          conversationsStore.set(updatedList);
        }

        await addMessage(conversation.id, {
          role: 'user',
          content: text
        });

        // Trigger visualizer intensity
        voiceState.value = 'processing';
        
        // Use the dedicated Live Engine
        const engine = await EngineManager.getLiveEngine();
        
        console.log('🤔 Generating response (streaming)...');
        
        let fullReply = '';
        let speakBuffer = '';
        
        const systemPrompt = "Eres una IA en modo conversación por voz. Responde de forma concisa, natural y DIRECTA. NO uses markdown, ni asteriscos, ni listas, ni formatos especiales. Solo texto plano que sea fácil de leer en voz alta. Evita frases largas.";

        // Generate with streaming
        await engine.generateText([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ], {
          onStream: (chunk) => {
            if (!active) return;
            
            fullReply += chunk;
            speakBuffer += chunk;
            setResponse(fullReply);

            // Periodically speak chunks when we have a good break point
            // or if the buffer gets too long
            if (speakBuffer.match(/[.!?\n]/) || speakBuffer.length > 100) {
              const toSpeak = speakBuffer.trim();
              if (toSpeak) {
                speechService.speakFragment(toSpeak, false);
                speakBuffer = '';
              }
            }
          }
        });

        if (!active) return;

        // Finalize speech
        if (speakBuffer.trim()) {
          speechService.speakFragment(speakBuffer.trim(), true);
        } else {
          // If buffer was empty but we finished, send empty fragment with isLastChunk=true
          // to trigger listening restart
          speechService.speakFragment('', true);
        }

        // Fallback for empty response
        if (!fullReply || !fullReply.trim()) {
           console.warn('⚠️ Empty response from model');
           const fallback = "No he podido generar una respuesta. ¿Podrías repetirlo?";
           setResponse(fallback);
           speechService.speak(fallback);
           fullReply = fallback;
        }

        console.log('🤖 AI replied:', fullReply);
        
        // 2. Save AI Response
        await addMessage(conversation.id, {
          role: 'assistant',
          content: fullReply
        });

        // Update title if it's the first message pair
        if (conversation.messages.length <= 2) {
          const newTitle = generateTitle(text);
          await updateConversationTitle(conversation.id, newTitle);
          const updatedList = await import('@/lib/db/conversations').then(m => m.getConversationsSorted());
          conversationsStore.set(updatedList);
        }

        // Refresh conversation messages in UI
        conversationsStore.update(conversation.id, { messages: [...conversation.messages] });

      } catch (e) {
        console.error('Error in conversation loop:', e);
        voiceState.value = 'idle';
        const errorMsg = "Lo siento, hubo un error de conexión con el modelo.";
        setResponse(errorMsg);
        speechService.speak(errorMsg);
      }
    };

    if (!isMuted) {
      // Start listening loop
      speechService.startListening(handleSpeechResult);
    }

    return () => {
      active = false;
      isVoiceModeEnabled.value = false; // Disable on exit
      speechService.stopListening();
      speechService.stopSpeaking();
    };
  }, [isMuted, modelReady]);

  const handleClose = () => {
    cleanupVisualizer();
    speechService.stopListening();
    speechService.stopSpeaking();
    uiStore.toggleLiveMode();
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (!isMuted) {
      speechService.stopListening();
      speechService.stopSpeaking();
    } else {
      speechService.startListening();
    }
  };

  if (loadingError) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-900 text-white">
        <div className="bg-red-900/20 p-6 rounded-xl border border-red-500/50 max-w-md text-center">
          <h3 className="text-xl font-bold text-red-400 mb-2">Error</h3>
          <p className="text-gray-300 mb-4">{loadingError}</p>
          <button onClick={handleClose} className="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600">
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  if (!modelReady) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-900 text-white">
        <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mb-4" />
        <h3 className="text-xl font-medium">Iniciando Modo Live...</h3>
        <p className="text-gray-400 mt-2">Cargando modelo de voz (LFM2 Audio)</p>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-black text-white overflow-hidden"
      style={{ animation: 'fadeIn 0.3s ease-out' }}
    >
      {/* Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-gray-900 via-gray-900 to-black opacity-90 z-0 pointer-events-none" />
      
      {/* Header */}
      <div className="relative z-10 w-full flex justify-between items-center p-6">
        <button onClick={handleClose} className="p-2 rounded-full hover:bg-gray-800 transition-colors">
          <X className="w-6 h-6 text-gray-400" />
        </button>
        <div className="flex flex-col items-center">
          <span className="text-sm font-bold text-emerald-500 uppercase tracking-widest">MODO LIVE</span>
        </div>
        <button className="p-2 rounded-full hover:bg-gray-800 transition-colors">
          <Settings className="w-6 h-6 text-gray-400" />
        </button>
      </div>

      {/* Main Visualizer Area */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center w-full max-w-md px-6">
        
        {/* State Text */}
        <div className="mb-4 h-6 text-center">
             {voiceState.value === 'listening' && !isMuted && (
               <span className="text-gray-400 text-sm tracking-wide animate-pulse">ESCUCHANDO...</span>
             )}
             {voiceState.value === 'processing' && (
               <span className="text-emerald-400 text-sm tracking-wide animate-pulse">PENSANDO...</span>
             )}
             {isMuted && (
               <span className="text-red-400 text-sm tracking-wide">MICRÓFONO DESACTIVADO</span>
             )}
        </div>

        {/* Canvas Visualizer */}
        <div className="relative w-80 h-80 flex items-center justify-center">
          <canvas 
            ref={canvasRef} 
            width={320} 
            height={320}
            className="w-full h-full"
          />
        </div>

        {/* Subtitles Area */}
        {showSubtitles && (
          <div className="mt-8 w-full text-center space-y-4 min-h-[120px] max-h-[200px] overflow-y-auto px-4 bg-black/40 backdrop-blur-sm rounded-xl py-4 border border-white/5">
            {transcript && (
               <p className="text-lg text-gray-300 font-light italic">"{transcript}"</p>
            )}
            {response && (
               <p className="text-lg text-white font-medium leading-relaxed animate-in fade-in slide-in-from-bottom-2">
                 {response}
               </p>
            )}
          </div>
        )}

      </div>

      {/* Controls */}
      <div className="relative z-10 w-full flex items-center justify-center gap-6 pb-12 px-6">
        
        {/* Toggle Subtitles */}
        <button 
          onClick={() => setShowSubtitles(!showSubtitles)}
          className={`p-4 rounded-full transition-all duration-200 ${
            showSubtitles 
            ? 'bg-emerald-900/50 text-emerald-400 ring-1 ring-emerald-500/50' 
            : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50'
          }`}
          title="Subtítulos"
        >
          <Captions className="w-6 h-6" />
        </button>

        {/* Mute Button */}
        <button 
          onClick={toggleMute}
          className={`p-6 rounded-full transition-all duration-200 transform hover:scale-105 ${
            isMuted 
            ? 'bg-gray-800 text-white ring-2 ring-gray-600' 
            : 'bg-white text-black hover:bg-gray-100 shadow-[0_0_20px_rgba(16,185,129,0.3)]'
          }`}
        >
          {isMuted ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
        </button>

        {/* Hang Up (Close) */}
        <button 
          onClick={handleClose}
          className="p-4 rounded-full bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all duration-200"
        >
          <PhoneOff className="w-6 h-6" />
        </button>

      </div>
      
      {/* CSS Injection */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}