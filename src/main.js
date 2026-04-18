/**
 * SRT Lyrics Studio — Main Entry Point
 * Orchestrates all modules and handles global state
 */

import './style.css';
import { AudioEngine } from './modules/audioEngine.js';
import { BPMDetector } from './modules/bpmDetector.js';
import { SubtitleManager } from './modules/subtitleManager.js';
import { SubtitleUI } from './modules/subtitleUI.js';
import { FileManager } from './modules/fileManager.js';
import { SpeechDetector } from './modules/speechDetector.js';
import { msToDisplay } from './modules/srtParser.js';

// ─── Instances ───
const audioEngine = new AudioEngine();
const bpmDetector = new BPMDetector();
const subtitleManager = new SubtitleManager();
const subtitleUI = new SubtitleUI(subtitleManager, audioEngine);
const fileManager = new FileManager();
const speechDetector = new SpeechDetector();

// ─── DOM Elements ───
const welcomeScreen = document.getElementById('welcome-screen');
const waveformArea = document.getElementById('waveform-area');
const fileNameDisplay = document.getElementById('file-name-display');
const bpmValueEl = document.getElementById('bpm-value');
const bpmConfidenceEl = document.getElementById('bpm-confidence');
const currentTimeEl = document.getElementById('current-time');
const totalTimeEl = document.getElementById('total-time');
const playIcon = document.getElementById('play-icon');
const pauseIcon = document.getElementById('pause-icon');
const subCountEl = document.getElementById('sub-count');
const dropZone = document.getElementById('drop-zone');

// ─── Initialization ───
function init() {
  audioEngine.init();
  subtitleUI.init();
  setupFileManager();
  setupTransportControls();
  setupToolbar();
  setupKeyboardShortcuts();
  setupDragDrop();
  setupModals();
  setupAudioCallbacks();

  // Update subtitle count on changes
  subtitleManager.onChange = (subs) => {
    subtitleUI.renderList();
    subtitleUI.syncRegions();
    subCountEl.textContent = `${subs.length} subtítulo${subs.length !== 1 ? 's' : ''}`;
  };
}

// ─── File Manager Setup ───
function setupFileManager() {
  fileManager.onAudioLoaded = async (file) => {
    showToast(`Cargando: ${file.name}...`, 'info');
    fileNameDisplay.textContent = file.name;

    try {
      const audioBuffer = await audioEngine.loadFile(file);
      welcomeScreen.style.display = 'none';
      waveformArea.style.display = 'block';
      showToast('Audio cargado correctamente', 'success');

      // Start BPM analysis
      analyzeBPM(audioBuffer);
    } catch (err) {
      showToast(`Error al cargar audio: ${err.message}`, 'error');
    }
  };

  fileManager.onSRTLoaded = (subtitles, filename) => {
    subtitleManager.load(subtitles);
    showToast(`SRT importado: ${subtitles.length} subtítulos`, 'success');
  };

  // Header buttons
  document.getElementById('btn-import-audio').addEventListener('click', () => fileManager.openAudioPicker());
  document.getElementById('btn-import-srt').addEventListener('click', () => fileManager.openSRTPicker());
  document.getElementById('btn-export-srt').addEventListener('click', exportSRT);
  document.getElementById('btn-save-project').addEventListener('click', () => {
    fileManager.saveProject(subtitleManager.getAll(), { bpm: bpmDetector.bpm });
    showToast('Proyecto guardado', 'success');
  });
  document.getElementById('btn-load-project').addEventListener('click', () => fileManager.openProjectPicker());
  document.getElementById('btn-welcome-load').addEventListener('click', () => fileManager.openAudioPicker());
}

// ─── Audio Callbacks ───
function setupAudioCallbacks() {
  audioEngine.onReady = (duration) => {
    totalTimeEl.textContent = msToDisplay(duration * 1000);
  };

  audioEngine.onTimeUpdate = (currentTime) => {
    currentTimeEl.textContent = msToDisplay(currentTime * 1000);
    subtitleUI.updatePreview(currentTime);
  };

  audioEngine.onRegionUpdate = (region) => {
    // When user drags/resizes a region, update the subtitle
    const idStr = region.id.replace('sub-', '');
    const id = parseInt(idStr);
    if (!isNaN(id)) {
      subtitleManager.update(id, {
        startTime: region.start * 1000,
        endTime: region.end * 1000
      });
    }
  };

  audioEngine.onRegionClick = (region) => {
    const idStr = region.id.replace('sub-', '');
    const id = parseInt(idStr);
    if (!isNaN(id)) {
      subtitleUI.select(id);
      audioEngine.seekTo(region.start);
    }
  };
}

// ─── Transport Controls ───
function setupTransportControls() {
  document.getElementById('btn-play').addEventListener('click', () => {
    audioEngine.playPause();
    updatePlayButton();
  });

  document.getElementById('btn-stop').addEventListener('click', () => {
    audioEngine.stop();
    updatePlayButton();
  });

  document.getElementById('speed-select').addEventListener('change', (e) => {
    audioEngine.setPlaybackRate(parseFloat(e.target.value));
  });

  document.getElementById('zoom-slider').addEventListener('input', (e) => {
    audioEngine.setZoom(parseInt(e.target.value));
  });

  document.getElementById('volume-slider').addEventListener('input', (e) => {
    audioEngine.setVolume(parseFloat(e.target.value));
  });

  // Poll play state for icon update
  setInterval(() => {
    if (audioEngine.isReady) {
      updatePlayButton();
    }
  }, 200);
}

function updatePlayButton() {
  const playing = audioEngine.isPlaying();
  playIcon.style.display = playing ? 'none' : 'block';
  pauseIcon.style.display = playing ? 'block' : 'none';
}

// ─── Toolbar Setup ───
function setupToolbar() {
  document.getElementById('btn-add-sub').addEventListener('click', () => addSubtitleAtCurrentTime());

  document.getElementById('btn-fix-overlaps').addEventListener('click', () => {
    const fixed = subtitleManager.fixOverlaps();
    if (fixed > 0) {
      showToast(`${fixed} solapamiento${fixed > 1 ? 's' : ''} corregido${fixed > 1 ? 's' : ''}`, 'success');
    } else {
      showToast('No se encontraron solapamientos', 'info');
    }
  });

  document.getElementById('btn-auto-detect').addEventListener('click', () => {
    openSpeechModal();
  });

  document.getElementById('btn-snap-bpm').addEventListener('click', () => {
    if (!bpmDetector.bpm) {
      showToast('Primero carga un audio para detectar BPM', 'warning');
      return;
    }
    snapSubtitlesToBPM();
  });

  document.getElementById('btn-undo').addEventListener('click', () => {
    if (subtitleManager.undo()) {
      showToast('Acción deshecha', 'info');
    }
  });
}

// ─── Add Subtitle ───
function addSubtitleAtCurrentTime() {
  if (!audioEngine.isReady) {
    showToast('Carga un audio primero', 'warning');
    return;
  }
  const currentMs = audioEngine.getCurrentTime() * 1000;
  const sub = subtitleManager.add(currentMs, currentMs + 2000, '');
  subtitleUI.select(sub.id);
  
  // Focus the text area
  setTimeout(() => {
    const textArea = document.getElementById('edit-text');
    if (textArea) textArea.focus();
  }, 50);
}

// ─── BPM Analysis ───
async function analyzeBPM(audioBuffer) {
  bpmValueEl.textContent = '...';
  bpmConfidenceEl.textContent = 'Analizando';
  
  try {
    const result = await bpmDetector.analyze(audioBuffer);
    if (result.bpm > 0) {
      bpmValueEl.textContent = result.bpm;
      bpmConfidenceEl.textContent = `${result.confidence}%`;
      showToast(`BPM detectado: ${result.bpm} (${result.confidence}% confianza)`, 'info');
    } else {
      bpmValueEl.textContent = '—';
      bpmConfidenceEl.textContent = '';
      showToast('No se pudo detectar BPM', 'warning');
    }
  } catch (err) {
    bpmValueEl.textContent = '—';
    bpmConfidenceEl.textContent = 'Error';
    console.error('BPM analysis error:', err);
  }
}

// ─── Snap to BPM ───
function snapSubtitlesToBPM() {
  const subs = subtitleManager.getAll();
  if (subs.length === 0) return;

  let snapped = 0;
  for (const sub of subs) {
    const nearestStart = bpmDetector.getNearestBeat(sub.startTime / 1000) * 1000;
    const nearestEnd = bpmDetector.getNearestBeat(sub.endTime / 1000) * 1000;
    if (nearestStart !== sub.startTime || nearestEnd !== sub.endTime) {
      subtitleManager.update(sub.id, {
        startTime: nearestStart,
        endTime: nearestEnd > nearestStart ? nearestEnd : nearestStart + 1000
      });
      snapped++;
    }
  }

  showToast(`${snapped} subtítulo${snapped !== 1 ? 's' : ''} alineado${snapped !== 1 ? 's' : ''} al BPM`, 'success');
}

// ─── Export SRT ───
function exportSRT() {
  const subs = subtitleManager.getAll();
  if (subs.length === 0) {
    showToast('No hay subtítulos para exportar', 'warning');
    return;
  }
  fileManager.exportSRT(subs);
  showToast('SRT exportado correctamente', 'success');
}

// ─── Drag & Drop ───
function setupDragDrop() {
  let dragCounter = 0;

  document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    dropZone.classList.add('visible');
    document.body.classList.add('drag-over');
  });

  document.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      dropZone.classList.remove('visible');
      document.body.classList.remove('drag-over');
    }
  });

  document.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  document.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    dropZone.classList.remove('visible');
    document.body.classList.remove('drag-over');

    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      const ext = file.name.split('.').pop().toLowerCase();
      if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'webm'].includes(ext)) {
        fileManager.onAudioLoaded(file);
      } else if (['srt', 'txt'].includes(ext)) {
        fileManager._handleSRTFile(file);
      }
    }
  });
}

// ─── Keyboard Shortcuts ───
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const active = document.activeElement;
    const isEditing = active && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && active.type === 'text'));

    // Ctrl+S — Export SRT
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      exportSRT();
      return;
    }

    // Ctrl+Z — Undo
    if (e.ctrlKey && e.key === 'z') {
      e.preventDefault();
      if (subtitleManager.undo()) {
        showToast('Acción deshecha', 'info');
      }
      return;
    }

    // Don't intercept shortcuts when typing in text fields
    if (isEditing) return;

    switch (e.key) {
      case ' ':
        e.preventDefault();
        audioEngine.playPause();
        updatePlayButton();
        break;

      case 'Enter':
        e.preventDefault();
        addSubtitleAtCurrentTime();
        break;

      case 'Delete':
      case 'Backspace':
        if (subtitleUI.selectedId) {
          e.preventDefault();
          subtitleManager.remove(subtitleUI.selectedId);
          audioEngine.removeRegion(subtitleUI.selectedId);
          subtitleUI.selectedId = null;
          subtitleUI.renderEditor(null);
        }
        break;

      case 'ArrowLeft':
        e.preventDefault();
        audioEngine.seekRelative(e.shiftKey ? -0.1 : -1);
        break;

      case 'ArrowRight':
        e.preventDefault();
        audioEngine.seekRelative(e.shiftKey ? 0.1 : 1);
        break;

      case 'Tab':
        e.preventDefault();
        if (subtitleUI.selectedId) {
          const next = e.shiftKey
            ? subtitleManager.getPrev(subtitleUI.selectedId)
            : subtitleManager.getNext(subtitleUI.selectedId);
          if (next) {
            subtitleUI.select(next.id);
            audioEngine.seekTo(next.startTime / 1000);
          }
        } else if (subtitleManager.count > 0) {
          const first = subtitleManager.getAll()[0];
          subtitleUI.select(first.id);
        }
        break;

      case '?':
        toggleShortcutsModal();
        break;
    }
  });
}

// ─── Speech Modal ───
function setupModals() {
  // Shortcuts modal
  document.getElementById('shortcuts-badge').addEventListener('click', toggleShortcutsModal);
  document.getElementById('shortcuts-modal-close').addEventListener('click', () => {
    document.getElementById('shortcuts-modal').style.display = 'none';
  });
  document.querySelector('#shortcuts-modal .modal-backdrop').addEventListener('click', () => {
    document.getElementById('shortcuts-modal').style.display = 'none';
  });

  // Speech modal
  document.getElementById('speech-modal-close').addEventListener('click', closeSpeechModal);
  document.getElementById('speech-cancel').addEventListener('click', closeSpeechModal);
  document.querySelector('#speech-modal .modal-backdrop').addEventListener('click', closeSpeechModal);
  document.getElementById('speech-start').addEventListener('click', toggleSpeechRecognition);
}

function toggleShortcutsModal() {
  const modal = document.getElementById('shortcuts-modal');
  modal.style.display = modal.style.display === 'none' ? 'flex' : 'none';
}

function openSpeechModal() {
  if (!speechDetector.checkSupport()) {
    showToast('Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.', 'error');
    return;
  }
  document.getElementById('speech-modal').style.display = 'flex';
}

function closeSpeechModal() {
  speechDetector.stop();
  document.getElementById('speech-modal').style.display = 'none';
  updateSpeechUI(false);
}

function toggleSpeechRecognition() {
  const lang = document.getElementById('speech-lang').value;
  speechDetector.setLanguage(lang);

  if (speechDetector.isListening) {
    const results = speechDetector.stop();
    updateSpeechUI(false);
    
    // Create subtitles from results
    if (results.length > 0) {
      const currentMs = audioEngine.getCurrentTime() * 1000;
      let offset = 0;
      for (const result of results) {
        subtitleManager.add(currentMs + offset, currentMs + offset + 2000, result.text);
        offset += 2500;
      }
      showToast(`${results.length} subtítulo${results.length > 1 ? 's' : ''} creado${results.length > 1 ? 's' : ''} desde voz`, 'success');
    }
  } else {
    // Start listening and playing
    speechDetector.onResult = (results) => {
      const resultsEl = document.getElementById('speech-results');
      const final = results.filter(r => r.isFinal);
      for (const r of final) {
        resultsEl.innerHTML += `<div style="padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);">"${r.text}" <span style="color:var(--text-muted)">(${Math.round(r.confidence * 100)}%)</span></div>`;
      }
      resultsEl.scrollTop = resultsEl.scrollHeight;
    };

    speechDetector.start();
    audioEngine.play();
    updatePlayButton();
    updateSpeechUI(true);
  }
}

function updateSpeechUI(listening) {
  const statusEl = document.getElementById('speech-status');
  const btnEl = document.getElementById('speech-start');
  
  if (listening) {
    statusEl.classList.add('listening');
    statusEl.querySelector('span').textContent = 'Escuchando...';
    btnEl.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
      Detener
    `;
  } else {
    statusEl.classList.remove('listening');
    statusEl.querySelector('span').textContent = 'Listo para iniciar';
    btnEl.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/></svg>
      Iniciar Escucha
    `;
  }
}

// ─── Toast Notifications ───
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ─── Start ───
init();
