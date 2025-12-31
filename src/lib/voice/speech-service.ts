import { signal } from "@preact/signals";

// Estados del servicio de voz
export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

export const voiceState = signal<VoiceState>('idle');
export const voiceError = signal<string | null>(null);
export const isVoiceModeEnabled = signal<boolean>(false); // El modo "Conversación continua"
export const autoSpeakEnabled = signal<boolean>(false); // Ajuste "Siempre hablar"

class SpeechService {
  private synthesis: SpeechSynthesis;
  private recognition: any | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private currentLang: 'es-ES' | 'en-US' = 'es-ES';

  constructor() {
    if (typeof window !== 'undefined') {
      this.synthesis = window.speechSynthesis;
      this.initRecognition();
      
      // Cargar voces (a veces es asíncrono en Chrome)
      if (this.synthesis.onvoiceschanged !== undefined) {
        this.synthesis.onvoiceschanged = () => {
          this.voices = this.synthesis.getVoices();
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
        voiceState.value = 'listening';
        voiceError.value = null;
      };

      this.recognition.onend = () => {
        if (voiceState.value === 'listening') {
          voiceState.value = 'idle';
        }
      };

      this.recognition.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
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
    
    // Seleccionar una voz adecuada si es posible
    const voice = this.voices.find(v => v.lang.startsWith(this.currentLang.split('-')[0]));
    if (voice) utterance.voice = voice;

    // Configuración para que suene más natural
    utterance.rate = 1.0; 
    utterance.pitch = 1.0;

    utterance.onend = () => {
      voiceState.value = 'idle';
      // Si estamos en modo conversación continua, volver a escuchar
      if (isVoiceModeEnabled.value) {
        // Pequeña pausa antes de escuchar de nuevo para no captarse a sí mismo
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
   * Útil para streaming de respuestas largas.
   */
  speakFragment(text: string, isLastChunk: boolean = false) {
    if (!this.synthesis || !text.trim()) {
      // Si es el último chunk pero está vacío, necesitamos simular el final
      // para reactivar el micrófono si es necesario.
      if (isLastChunk && isVoiceModeEnabled.value) {
        // Pequeña pausa y reiniciar
        setTimeout(() => {
          if (voiceState.value !== 'listening') {
             voiceState.value = 'idle';
             this.startListening();
          }
        }, 500);
      }
      return;
    }

    // NO cancelamos audio anterior
    voiceState.value = 'speaking';

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = this.currentLang;
    
    const voice = this.voices.find(v => v.lang.startsWith(this.currentLang.split('-')[0]));
    if (voice) utterance.voice = voice;

    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onend = () => {
      // Solo si es el último fragmento gestionamos el estado 'idle' y reinicio de escucha
      if (isLastChunk) {
        voiceState.value = 'idle';
        if (isVoiceModeEnabled.value) {
          setTimeout(() => this.startListening(), 500);
        }
      } else {
        // Si no es el último, verificamos si la cola se vació
        if (!this.synthesis.pending) {
           // Mantenemos 'speaking' visualmente si sabemos que vendrá más, 
           // pero el navegador disparará este evento cuando termine este fragmento.
           // No hacemos nada, dejamos que llegue el siguiente fragmento.
        }
      }
    };

    utterance.onerror = () => {
      console.error('TTS Error');
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

    // UPDATE CALLBACK ALWAYS: Even if already listening, we might want to update who receives the result
    this.recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (transcript && onResult) {
        onResult(transcript);
      }
    };

    // Prevent double-start
    if (voiceState.value === 'listening') {
      console.log('🎤 Already listening, callback updated');
      return;
    }

    try {
      this.recognition.start();
    } catch (e: any) {
      if (e.message && e.message.includes('already started')) {
        console.log('🎤 Recognition already active (caught error)');
        voiceState.value = 'listening'; // Sync state just in case
      } else {
        console.error('Error starting recognition:', e);
      }
    }
  }

  stopListening() {
    if (this.recognition) {
      this.recognition.stop();
    }
    voiceState.value = 'idle';
  }

  toggleVoiceMode() {
    isVoiceModeEnabled.value = !isVoiceModeEnabled.value;
    if (!isVoiceModeEnabled.value) {
      this.stopListening();
      this.stopSpeaking();
    } else {
      // Iniciar escucha automáticamente al activar el modo
      this.startListening();
    }
  }
}

export const speechService = new SpeechService();
