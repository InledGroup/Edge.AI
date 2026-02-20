import { signal } from "@preact/signals";
import { createWorkerManager } from "../workers/worker-manager";

// Estados del servicio de voz
export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

export const voiceState = signal<VoiceState>('idle');
export const voiceError = signal<string | null>(null);
export const isVoiceModeEnabled = signal<boolean>(false); // El modo "Conversación continua"
export const autoSpeakEnabled = signal<boolean>(false); // Ajuste "Siempre hablar"

class SpeechService {
  private synthesis: SpeechSynthesis | null = null;
  private recognition: any | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private currentLang: 'es-ES' | 'en-US' = 'es-ES';
  private currentCallback: ((text: string) => void) | null = null;
  private isExplicitlyStopped: boolean = false;
  private restartTimeout: any = null;
  private errorCount: number = 0;
  private lastErrorTime: number = 0;
  private activeUtterances: Set<SpeechSynthesisUtterance> = new Set();
  private audioContext: AudioContext | null = null;
  private audioQueue: AudioBuffer[] = [];
  private isPlayingAudio: boolean = false;
  
  private audioWorker = createWorkerManager('./audio-decoder.worker.ts');
  private isMimiReady: boolean = false;
  private isMimiInitializing: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.synthesis = window.speechSynthesis;
      this.initRecognition();
      
      // Initialize AudioContext on user interaction if possible, or lazily
      const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
      if (AudioContextClass) {
        this.audioContext = new AudioContextClass();
      }

      // Cargar voces (a veces es asíncrono en Chrome)
      if (this.synthesis && this.synthesis.onvoiceschanged !== undefined) {
        this.synthesis.onvoiceschanged = () => {
          if (this.synthesis) {
            this.voices = this.synthesis.getVoices();
          }
        };
      }
    }
  }

  private initRecognition() {
    // Cleanup previous instance if any
    if (this.recognition) {
      try {
        this.recognition.onstart = null;
        this.recognition.onresult = null;
        this.recognition.onend = null;
        this.recognition.onerror = null;
        this.recognition.stop();
      } catch (e) {}
    }

    // @ts-ignore - Webkit prefix for Chrome/Safari/Android
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false; // Parar después de una frase para procesarla
      this.recognition.interimResults = false;
      this.recognition.lang = this.currentLang;

      this.recognition.onstart = () => {
        console.log('🎤 Mic started');
        voiceState.value = 'listening';
        voiceError.value = null;
        this.isExplicitlyStopped = false;
      };

      this.recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        console.log('🎤 Result:', transcript);
        this.errorCount = 0; // Reset errors on success
        if (transcript && this.currentCallback) {
          // Flag as explicitly stopped to prevent immediate race condition in onend
          this.isExplicitlyStopped = true;
          this.currentCallback(transcript);
        }
      };

      this.recognition.onend = () => {
        const stateAtEnd = voiceState.value;
        console.log('🎤 Mic ended. State:', stateAtEnd);
        
        // Only transition to idle if we were actually listening
        if (stateAtEnd === 'listening') {
          voiceState.value = 'idle';
        }

        // Auto-restart logic for continuous mode
        if (isVoiceModeEnabled.value && !this.isExplicitlyStopped) {
          // CRITICAL: Only restart if the state is idle.
          if (voiceState.value === 'idle') {
            // Check for too many rapid errors
            if (this.errorCount > 3) {
                console.warn('🎤 Too many speech recognition errors, stopping auto-restart');
                isVoiceModeEnabled.value = false;
                voiceError.value = 'Error de conexión persistente con el servicio de voz.';
                return;
            }

            // Exponential backoff or standard delay
            const delay = this.errorCount > 0 ? 1500 * this.errorCount : 250;
            
            if (this.restartTimeout) clearTimeout(this.restartTimeout);
            this.restartTimeout = setTimeout(() => {
              if (isVoiceModeEnabled.value && !this.isExplicitlyStopped && voiceState.value === 'idle') {
                console.log(`🎤 Auto-restarting (delay: ${delay}ms)...`);
                this.startListening();
              }
            }, delay);
          }
        }
      };

      this.recognition.onerror = (event: any) => {
        const errorType = event.error;
        console.error('Speech recognition error:', errorType);
        
        // Track errors for backoff/cooldown
        const now = Date.now();
        if (now - this.lastErrorTime < 5000) {
            this.errorCount++;
        } else {
            this.errorCount = 1;
        }
        this.lastErrorTime = now;

        if (errorType === 'no-speech') {
           return;
        }

        // Network error is common on Chrome with local IPs
        if (errorType === 'network') {
           console.error('🎤 Network error detected. Re-initializing engine...');
           // On network error, Chrome's recognition object often gets stuck.
           // We re-init to try and clear the internal state.
           setTimeout(() => this.initRecognition(), 500);
        }

        if (errorType === 'not-allowed' || errorType === 'service-not-allowed') {
           console.error(`🎤 Critical speech error "${errorType}", disabling continuous mode.`);
           this.isExplicitlyStopped = true;
           isVoiceModeEnabled.value = false;
        }

        voiceError.value = `Error: ${errorType}`;
        voiceState.value = 'idle';
      };
    } else {
      console.warn('Speech Recognition API not supported in this browser');
      voiceError.value = 'Tu navegador no soporta reconocimiento de voz nativo.';
    }
  }

  setLanguage(lang: 'es-ES' | 'en-US') {
    this.currentLang = lang;
    if (this.recognition) {
      this.recognition.lang = lang;
    }
  }

  // --- Text to Speech (TTS) ---

  speak(text: string) {
    if (!this.synthesis) return;

    // Cancelar cualquier audio anterior
    this.stopSpeaking();

    voiceState.value = 'speaking';

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = this.currentLang;
    
    // Guardar referencia para evitar GC
    this.activeUtterances.add(utterance);

    // Improved voice selection
    let voice = this.voices.find(v => 
      v.lang.startsWith(this.currentLang.split('-')[0]) && 
      (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Premium'))
    );

    if (!voice) voice = this.voices.find(v => v.lang === this.currentLang);
    if (!voice) voice = this.voices.find(v => v.lang.startsWith(this.currentLang.split('-')[0]));

    if (voice) utterance.voice = voice;

    utterance.rate = 1.1; 
    utterance.pitch = 1.0;

    utterance.onend = () => {
      console.log('🔊 TTS Finished');
      this.activeUtterances.delete(utterance);
      voiceState.value = 'idle';
      // Restart listening after speaking
      if (isVoiceModeEnabled.value) {
        this.isExplicitlyStopped = false;
        setTimeout(() => this.startListening(), 500);
      }
    };

    utterance.onerror = () => {
      this.activeUtterances.delete(utterance);
      voiceState.value = 'idle';
    };

    this.synthesis.speak(utterance);
  }

  /**
   * Inicializa el decodificador Mimi (red neuronal para audio) en un Web Worker
   */
  async initMimiDecoder() {
    if (this.isMimiReady || this.isMimiInitializing) return;
    this.isMimiInitializing = true;
    
    try {
      console.log('🚀 Initializing Mimi Audio Worker...');
      await this.audioWorker.init();
      await this.audioWorker.sendMessage('init', {
        modelId: 'kyutai/mimi',
        device: 'wasm' // Use CPU in worker to avoid conflict
      });
      console.log('✅ Mimi Decoder Ready (Worker)');
      this.isMimiReady = true;
    } catch (e) {
      console.error('Failed to load Mimi decoder worker:', e);
    } finally {
      this.isMimiInitializing = false;
    }
  }

  /**
   * Decodifica y reproduce códigos Mimi generados por el modelo LFM.
   * @param codes Array de arrays de códigos (8 codebooks por cada frame)
   */
  async playMimiCodes(codes: number[][]) {
    if (!this.isMimiReady) {
      await this.initMimiDecoder();
      if (!this.isMimiReady) return;
    }

    try {
      // Offload decoding to worker
      // Response payload should be { audio: Float32Array }
      const response = await this.audioWorker.sendMessage('decode', { tokens: codes });
      
      if (response && response.audio) {
        await this.playAudioData(response.audio);
      }
    } catch (e) {
      console.error('Error decoding Mimi codes via worker:', e);
    }
  }

  /**
   * Habla un fragmento de texto sin cancelar lo que ya se está hablando.
   */
  speakFragment(text: string, isLastChunk: boolean = false) {
    if (!this.synthesis) return;

    if (!text.trim()) {
      if (isLastChunk && isVoiceModeEnabled.value) {
        this.ensureListeningRestarts();
      }
      return;
    }

    voiceState.value = 'speaking';

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = this.currentLang;
    
    // Guardar referencia para evitar GC
    this.activeUtterances.add(utterance);

    let voice = this.voices.find(v => 
      v.lang.startsWith(this.currentLang.split('-')[0]) && 
      (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Premium'))
    );

    if (!voice) voice = this.voices.find(v => v.lang === this.currentLang);
    if (!voice) voice = this.voices.find(v => v.lang.startsWith(this.currentLang.split('-')[0]));

    if (voice) utterance.voice = voice;

    utterance.rate = 1.1;
    utterance.pitch = 1.0;

    utterance.onend = () => {
      this.activeUtterances.delete(utterance);
      if (isLastChunk) {
        console.log('🔊 Final TTS Fragment Finished');
        voiceState.value = 'idle';
        if (isVoiceModeEnabled.value) {
          this.isExplicitlyStopped = false;
          setTimeout(() => this.startListening(), 500);
        }
      }
    };

    utterance.onerror = () => {
      this.activeUtterances.delete(utterance);
      if (isLastChunk) voiceState.value = 'idle';
    };

    this.synthesis.speak(utterance);
  }

  /**
   * Reproduce datos de audio raw (PCM/WAV) usando AudioContext.
   * Ideal para modelos que generan audio directamente.
   */
  async playAudioData(data: Float32Array | Uint8Array | ArrayBuffer) {
    if (!this.audioContext) return;

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    voiceState.value = 'speaking';

    try {
      let audioBuffer: AudioBuffer;

      if (data instanceof Float32Array) {
        // Asumir PCM mono 24kHz (ajustar según el modelo)
        // LFM Audio suele ser 24kHz
        const sampleRate = 24000; 
        audioBuffer = this.audioContext.createBuffer(1, data.length, sampleRate);
        audioBuffer.getChannelData(0).set(data);
      } else {
        // Intentar decodificar (WAV/MP3 headers)
        // Copiar el buffer para evitar problemas de detatched buffers
        const bufferCopy = data instanceof ArrayBuffer ? data.slice(0) : (data as Uint8Array).buffer.slice(0);
        audioBuffer = await this.audioContext.decodeAudioData(bufferCopy as ArrayBuffer);
      }

      this.audioQueue.push(audioBuffer);
      this.processAudioQueue();

    } catch (e) {
      console.error('Error decoding audio data:', e);
      voiceState.value = 'idle';
    }
  }

  private async processAudioQueue() {
    if (this.isPlayingAudio || this.audioQueue.length === 0 || !this.audioContext) return;

    this.isPlayingAudio = true;
    const buffer = this.audioQueue.shift();
    
    if (!buffer) {
      this.isPlayingAudio = false;
      return;
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);
    
    source.onended = () => {
      this.isPlayingAudio = false;
      if (this.audioQueue.length === 0) {
        console.log('🔊 Model Audio Finished');
        voiceState.value = 'idle';
        // Auto-restart listening if enabled
        if (isVoiceModeEnabled.value) {
          setTimeout(() => this.startListening(), 200);
        }
      } else {
        this.processAudioQueue();
      }
    };

    source.start(0);
  }

  private ensureListeningRestarts() {
    const check = () => {
      // Si ya no está hablando, podemos reiniciar
      if (!this.synthesis?.speaking) {
        console.log('🔊 Queue finished (polled), restarting listening');
        voiceState.value = 'idle';
        if (isVoiceModeEnabled.value) {
          this.isExplicitlyStopped = false;
          this.startListening();
        }
      } else {
        // Seguir esperando
        setTimeout(check, 250);
      }
    };
    check();
  }

  stopSpeaking() {
    if (this.synthesis) {
      this.synthesis.cancel();
      this.activeUtterances.clear();
    }
    
    // Stop AudioContext playback
    this.audioQueue = [];
    this.isPlayingAudio = false;
    if (this.audioContext && this.audioContext.state === 'running') {
      this.audioContext.suspend(); // Pause immediately
      setTimeout(() => this.audioContext?.resume(), 100); // Resume for next time
    }
  }

  // --- Speech to Text (STT) ---

  startListening(onResult?: (text: string) => void) {
    if (!this.recognition) return;

    // Safety guard: Don't start listening if we are processing or speaking
    // This prevents race conditions where an old onend timer fires late
    if (voiceState.value === 'processing' || voiceState.value === 'speaking') {
        console.warn('[SpeechService] startListening blocked because state is', voiceState.value);
        return;
    }

    this.isExplicitlyStopped = false;

    if (onResult) {
      this.currentCallback = onResult;
    }

    if (voiceState.value === 'listening') return;

    try {
      this.recognition.start();
    } catch (e: any) {
      if (!e.message.includes('already started')) {
        console.error('Error starting recognition:', e);
      }
    }
  }

  stopListening(nextState: VoiceState = 'idle') {
    this.isExplicitlyStopped = true;
    if (nextState === 'idle') {
      isVoiceModeEnabled.value = false;
    }
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {}
    }
    voiceState.value = nextState;
  }

  toggleVoiceMode() {
    isVoiceModeEnabled.value = !isVoiceModeEnabled.value;
    if (!isVoiceModeEnabled.value) {
      this.stopListening();
      this.stopSpeaking();
    } else {
      this.startListening();
    }
  }
}

export const speechService = new SpeechService();