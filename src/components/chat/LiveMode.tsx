import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import EngineManager from '@/lib/ai/engine-manager';
import { uiStore, conversationsStore, activeConversationIdSignal } from '@/lib/stores';
import { addMessage, getOrCreateConversation, updateConversationTitle, generateTitle } from '@/lib/db/conversations';
import { speechService, voiceState, isVoiceModeEnabled } from '@/lib/voice/speech-service';
import { Mic, MicOff, PhoneOff, X, MoreHorizontal, Settings, Volume2, Captions, Loader2, Check } from 'lucide-preact';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { useTranslations } from '@/lib/stores/i18n';
import { getSetting, setSetting } from '@/lib/db/settings';

export default function LiveMode() {
  const t = useTranslations();
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadMessage, setLoadMessage] = useState(t('live.initializing'));
  
  // Settings state
  const [audioType, setAudioType] = useState<'system' | 'model'>('system');
  const [sttType, setSttType] = useState<'system' | 'model'>('system');

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const initRef = useRef(false);

  // Close if not enabled
  if (!uiStore.showLiveMode) return null;

  // Load settings on mount
  useEffect(() => {
    async function loadSettings() {
      const savedAudioType = await getSetting('liveModeAudioType');
      const savedSttType = await getSetting('liveModeSttType');
      if (savedAudioType) setAudioType(savedAudioType);
      if (savedSttType) setSttType(savedSttType);
    }
    loadSettings();
  }, []);

  // Initialize Model
  useEffect(() => {
    async function initModel() {
      // Don't re-init if already initializing
      if (initRef.current) return;
      initRef.current = true;

      try {
        if (audioType === 'model') {
          if (!EngineManager.isLiveEngineReady()) {
            console.log('🔌 Initializing specialized Live Engine (LFM2-Audio)...');
            await EngineManager.getLiveEngine('lfm-2-audio-1.5b', (progress, msg) => {
              console.log(`Live Model: ${progress}% - ${msg}`);
              setLoadProgress(progress);
              setLoadMessage(msg);
            });
          }
        } else {
          // Use the default chat engine
          console.log('🔌 Ensuring Chat Engine is ready for Live Mode (System TTS)...');
          setLoadMessage(t('live.loadingModel'));
          setLoadProgress(50);
          await EngineManager.getChatEngine(undefined, (progress, msg) => {
            setLoadProgress(progress);
            setLoadMessage(msg);
          });
          setLoadProgress(100);
        }
        setModelReady(true);
      } catch (error: any) {
        console.error('Failed to load model for live mode:', error);
        setLoadingError(error.message || t('live.errorLoading'));
        initRef.current = false; // Allow retry if failed
      }
    }
    
    // Reset and re-init if audioType changes and we aren't already set up for it
    if (initRef.current && ((audioType === 'model' && !EngineManager.isLiveEngineReady()) || (audioType === 'system' && !EngineManager.isChatEngineReady()))) {
      initRef.current = false;
      setModelReady(false);
    }
    
    initModel();
  }, [audioType]); // Re-run if audioType changes

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
      
      try {
        // Stop listening while processing
        speechService.stopListening('processing');
        
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

        // Use the appropriate engine based on settings
        const engine = audioType === 'model' 
          ? await EngineManager.getLiveEngine()
          : await EngineManager.getChatEngine();
        
        console.log(`🤔 Generating response using ${audioType === 'model' ? 'Live' : 'Chat'} Engine (streaming)...`);
        
        let fullReply = '';
        let lastSpokenIndex = 0;
        let hasStartedStreamingTTS = false;
        let generationStartTime = Date.now();
        
        const systemPrompt = t('live.systemPrompt');

        // Function to handle streaming system TTS
        const speakNextFragment = (isFinal = false) => {
          if (audioType !== 'system' || !active) return;

          const timeElapsed = Date.now() - generationStartTime;
          
          // Trigger if 4 seconds passed OR if it's the final chunk
          if (!hasStartedStreamingTTS && (timeElapsed >= 4000 || isFinal)) {
            const textToSpeak = fullReply.trim();
            if (textToSpeak) {
              hasStartedStreamingTTS = true;
              speechService.speakFragment(textToSpeak, isFinal);
              lastSpokenIndex = fullReply.length;
            }
          } else if (hasStartedStreamingTTS) {
            // If already streaming, look for completed sentences or long chunks
            const remainingText = fullReply.substring(lastSpokenIndex);
            
            // Speak if we have a sentence end OR if it's final
            if (isFinal || /[.!?]\s$/.test(remainingText) || remainingText.length > 120) {
              const fragment = remainingText.trim();
              if (fragment) {
                speechService.speakFragment(fragment, isFinal);
                lastSpokenIndex = fullReply.length;
              }
            }
          }
        };

        // Fallback timer to ensure TTS starts at 4s even if model is slow
        const ttsTimer = setTimeout(() => {
          if (active && !hasStartedStreamingTTS && audioType === 'system') {
            speakNextFragment();
          }
        }, 4100);

        // Generate with streaming
        let mimiBatch: number[][] = [];
        try {
          await engine.generateText([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text }
          ], {
            onStream: (chunk: string) => {
              if (!active) return;
              fullReply += chunk;
              setResponse((prev) => prev + chunk);
              
              // Handle streaming TTS trigger
              if (audioType === 'system') {
                speakNextFragment();
              }
            },
            onAudio: (codes: Uint8Array) => {
              if (!active || isMuted || audioType === 'system') return;
              
              // Add frame to batch
              mimiBatch.push(Array.from(codes));
              
              // Decode in batches of 10 frames for efficiency
              if (mimiBatch.length >= 10) {
                speechService.playMimiCodes([...mimiBatch]);
                mimiBatch = [];
              }
            }
          } as any);
        } finally {
          clearTimeout(ttsTimer);
        }

        // Play remaining codes
        if (mimiBatch.length > 0 && active && audioType === 'model') {
          speechService.playMimiCodes(mimiBatch);
        }

        if (!active) return;

        // Final speaking trigger for remaining text
        if (audioType === 'system') {
          speakNextFragment(true);
        }

        // Fallback for empty response
        if (!fullReply || !fullReply.trim()) {
           console.warn('⚠️ Empty response from model');
           const fallback = t('live.fallbackResponse');
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
        const errorMsg = t('live.errorConnection');
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
      // We do NOT stop listening/speaking here to allow "background mode" 
      // and prevent state resets during accidental remounts.
      // Explicit closing is handled by handleClose().
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
          <h3 className="text-xl font-bold text-red-400 mb-2">{t('live.errorTitle')}</h3>
          <p className="text-gray-300 mb-4">{loadingError}</p>
          <button onClick={handleClose} className="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600">
            {t('live.close')}
          </button>
        </div>
      </div>
    );
  }

  if (!modelReady) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-900 text-white px-6">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="relative flex justify-center">
             <Loader2 className="w-16 h-16 text-emerald-500 animate-spin" />
             <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-emerald-400">
               {Math.round(loadProgress)}%
             </div>
          </div>
          
          <div className="space-y-2">
            <h3 className="text-xl font-medium">{t('live.title')}...</h3>
            <p className="text-gray-400 text-sm">{t('live.loadingModel')}</p>
          </div>

          <div className="w-full space-y-2">
            <ProgressBar 
              progress={loadProgress} 
              variant="default" 
              size="lg" 
              showPercentage={false}
              className="text-emerald-500"
            />
            <div className="flex justify-between text-[10px] text-gray-500 uppercase tracking-widest font-bold">
              <span>{loadMessage}</span>
              <span>{Math.round(loadProgress)}%</span>
            </div>
          </div>
          
          <p className="text-xs text-gray-500 italic">
            {t('live.firstTimeInfo')}
          </p>
        </div>
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
          <span className="text-sm font-bold text-emerald-500 uppercase tracking-widest">{t('live.title')}</span>
        </div>
        <button 
          onClick={() => setShowSettings(true)}
          className="p-2 rounded-full hover:bg-gray-800 transition-colors"
        >
          <Settings className="w-6 h-6 text-gray-400" />
        </button>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-gray-900 border border-gray-800 w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-gray-800 flex justify-between items-center">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Settings className="w-5 h-5 text-emerald-500" />
                {t('live.settings.title')}
              </h3>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* TTS Setting */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t('live.settings.ttsLabel')}</label>
                <div className="grid grid-cols-1 gap-2">
                  <button 
                    onClick={async () => {
                      setAudioType('system');
                      await setSetting('liveModeAudioType', 'system');
                    }}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                      audioType === 'system' 
                      ? 'bg-emerald-500/10 border-emerald-500/50 text-white' 
                      : 'bg-gray-800/50 border-transparent text-gray-400 hover:bg-gray-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Volume2 className="w-5 h-5" />
                      <span className="text-sm font-medium">{t('live.settings.systemOption')}</span>
                    </div>
                    {audioType === 'system' && <Check className="w-4 h-4 text-emerald-500" />}
                  </button>

                  <button 
                    onClick={async () => {
                      setAudioType('model');
                      await setSetting('liveModeAudioType', 'model');
                    }}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                      audioType === 'model' 
                      ? 'bg-emerald-500/10 border-emerald-500/50 text-white' 
                      : 'bg-gray-800/50 border-transparent text-gray-400 hover:bg-gray-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-5 h-5" />
                      <div className="text-left">
                        <span className="text-sm font-medium block">{t('live.settings.mimicTokens')}</span>
                        <span className="text-[10px] text-gray-500 leading-tight">{t('live.settings.mimicDesc')}</span>
                      </div>
                    </div>
                    {audioType === 'model' && <Check className="w-4 h-4 text-emerald-500" />}
                  </button>
                </div>
              </div>

              {/* STT Setting (Planned) */}
              <div className="space-y-3 opacity-50 pointer-events-none">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t('live.settings.sttLabel')}</label>
                <div className="p-3 rounded-xl bg-gray-800/50 border border-transparent text-gray-400 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Mic className="w-5 h-5" />
                    <span className="text-sm font-medium">{t('live.settings.systemOption')}</span>
                  </div>
                  <Check className="w-4 h-4" />
                </div>
              </div>
            </div>

            <div className="p-4 bg-gray-800/30 text-center">
              <button 
                onClick={() => setShowSettings(false)}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold transition-colors"
              >
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Visualizer Area */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center w-full max-w-md px-6">
        
        {/* State Text */}
        <div className="mb-4 h-6 text-center">
             {voiceState.value === 'listening' && !isMuted && (
               <span className="text-gray-400 text-sm tracking-wide animate-pulse">{t('live.listening')}</span>
             )}
             {voiceState.value === 'processing' && (
               <span className="text-emerald-400 text-sm tracking-wide animate-pulse">{t('live.thinking')}</span>
             )}
             {isMuted && (
               <span className="text-red-400 text-sm tracking-wide">{t('live.micDisabled')}</span>
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
          title={t('live.subtitles')}
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