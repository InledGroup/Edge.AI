import { signal } from "@preact/signals";

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

  constructor() {
    if (typeof window !== 'undefined') {
      this.synthesis = window.speechSynthesis;
      this.initRecognition();
      
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
        if (transcript && this.currentCallback) {
          this.currentCallback(transcript);
        }
      };

      this.recognition.onend = () => {
        console.log('🎤 Mic ended. State:', voiceState.value);
        
        // Only transition to idle if we weren't already moved to processing/speaking
        if (voiceState.value === 'listening') {
          voiceState.value = 'idle';
        }

        // Auto-restart logic for continuous mode
        if (isVoiceModeEnabled.value && !this.isExplicitlyStopped) {
          // Don't restart if AI is speaking or processing
          if (voiceState.value === 'idle') {
            console.log('🎤 Auto-restarting...');
            setTimeout(() => this.startListening(), 100);
          }
        }
      };

      this.recognition.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        if (event.error === 'no-speech') {
           // Silence - just let onend restart it
           return;
        }
        voiceError.value = `Error: ${event.error}`;
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
      voiceState.value = 'idle';
      // Restart listening after speaking
      if (isVoiceModeEnabled.value) {
        this.isExplicitlyStopped = false;
        setTimeout(() => this.startListening(), 500);
      }
    };

    utterance.onerror = () => {
      voiceState.value = 'idle';
    };

    this.synthesis.speak(utterance);
  }

  /**
   * Habla un fragmento de texto sin cancelar lo que ya se está hablando.
   */
  speakFragment(text: string, isLastChunk: boolean = false) {
    if (!this.synthesis || !text.trim()) {
      if (isLastChunk && isVoiceModeEnabled.value) {
        setTimeout(() => {
          if (voiceState.value === 'idle') {
             this.startListening();
          }
        }, 500);
      }
      return;
    }

    voiceState.value = 'speaking';

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = this.currentLang;
    
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
      if (isLastChunk) voiceState.value = 'idle';
    };

    this.synthesis.speak(utterance);
  }

  stopSpeaking() {
    if (this.synthesis) {
      this.synthesis.cancel();
    }
  }

  // --- Speech to Text (STT) ---

  startListening(onResult?: (text: string) => void) {
    if (!this.recognition) return;

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

  stopListening() {
    this.isExplicitlyStopped = true;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {}
    }
    voiceState.value = 'idle';
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