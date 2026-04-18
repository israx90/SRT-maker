/**
 * Speech Detector
 * Wrapper for Web Speech API - experimental feature
 */

export class SpeechDetector {
  constructor() {
    this.isSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    this.recognition = null;
    this.isListening = false;
    this.onResult = null;
    this.onError = null;
    this.language = 'es-ES'; // Default to Spanish
    this.results = [];
  }

  /**
   * Check if speech recognition is available
   */
  checkSupport() {
    return this.isSupported;
  }

  /**
   * Initialize speech recognition
   */
  init() {
    if (!this.isSupported) {
      console.warn('Speech Recognition not supported in this browser');
      return false;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = this.language;
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = (event) => {
      const results = [];
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        results.push({
          text: result[0].transcript.trim(),
          confidence: result[0].confidence,
          isFinal: result.isFinal,
          timestamp: Date.now()
        });
      }
      this.results.push(...results.filter(r => r.isFinal));
      if (this.onResult) this.onResult(results);
    };

    this.recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (this.onError) this.onError(event.error);
      if (event.error === 'not-allowed') {
        this.isListening = false;
      }
    };

    this.recognition.onend = () => {
      // Auto-restart if still supposed to be listening
      if (this.isListening) {
        try {
          this.recognition.start();
        } catch (e) {
          this.isListening = false;
        }
      }
    };

    return true;
  }

  /**
   * Start listening
   */
  start() {
    if (!this.recognition) {
      if (!this.init()) return false;
    }
    try {
      this.results = [];
      this.recognition.start();
      this.isListening = true;
      return true;
    } catch (e) {
      console.error('Failed to start speech recognition:', e);
      return false;
    }
  }

  /**
   * Stop listening
   */
  stop() {
    if (this.recognition && this.isListening) {
      this.isListening = false;
      this.recognition.stop();
    }
    return this.results;
  }

  /**
   * Set recognition language
   */
  setLanguage(langCode) {
    this.language = langCode;
    if (this.recognition) {
      this.recognition.lang = langCode;
    }
  }

  /**
   * Get available languages (common ones)
   */
  static getLanguages() {
    return [
      { code: 'es-ES', name: 'Español' },
      { code: 'en-US', name: 'English (US)' },
      { code: 'en-GB', name: 'English (UK)' },
      { code: 'pt-BR', name: 'Português' },
      { code: 'fr-FR', name: 'Français' },
      { code: 'de-DE', name: 'Deutsch' },
      { code: 'it-IT', name: 'Italiano' },
      { code: 'ja-JP', name: '日本語' },
      { code: 'ko-KR', name: '한국어' },
      { code: 'zh-CN', name: '中文' },
    ];
  }
}
