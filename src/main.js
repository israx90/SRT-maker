/**
 * IRXs Lyric Studio — Main Entry Point
 * Orchestrates all modules and handles global state
 */

import { AudioEngine } from './modules/audioEngine.js';
import { BPMDetector } from './modules/bpmDetector.js';
import { SubtitleManager } from './modules/subtitleManager.js';
import { SubtitleUI } from './modules/subtitleUI.js';
import { FileManager } from './modules/fileManager.js';
import { SpeechDetector } from './modules/speechDetector.js';
import { SectionManager } from './modules/sectionManager.js';
import { msToDisplay, serializeSRTWithSections } from './modules/srtParser.js';
import i18n from './modules/i18n.js';

// ─── Instances ───

const audioEngine = new AudioEngine();
const bpmDetector = new BPMDetector();
const subtitleManager = new SubtitleManager();
const subtitleUI = new SubtitleUI(subtitleManager, audioEngine);
const fileManager = new FileManager();
const speechDetector = new SpeechDetector();
const sectionManager = new SectionManager();

// Link section manager to subtitle UI
subtitleUI.sectionManager = sectionManager;

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

// Track copy source
let _copySectionId = null;
let _magneticSnap = true;
let _clipboard = []; // subtitle clipboard for copy/paste

// ─── Initialization ───
function init() {
  i18n.apply();
  updateLangButtons();
  audioEngine.init();
  subtitleUI.init();
  setupFileManager();
  setupTransportControls();
  setupToolbar();
  setupKeyboardShortcuts();
  setupDragDrop();
  setupModals();
  setupAudioCallbacks();
  setupQuickInput();
  setupSections();
  setupLangToggle();

  // Update subtitle count on changes
  subtitleManager.onChange = (subs) => {
    subtitleUI.renderList();
    if (audioEngine.isReady) subtitleUI.syncRegions();
    subCountEl.textContent = `${subs.length} subtítulo${subs.length !== 1 ? 's' : ''}`;
  };

  // Update section visuals on changes
  sectionManager.onChange = () => {
    renderSectionChips();
    syncSectionMarkers();
    renderSectionsStrip();
    subtitleUI.renderList();
  };

  // Setup fullscreen karaoke player
  setupFullscreenPlayer();
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
      analyzeBPM(audioBuffer);
    } catch (err) {
      showToast(`Error al cargar audio: ${err.message}`, 'error');
    }
  };

  fileManager.onSRTLoaded = (subtitles) => {
    subtitleManager.load(subtitles);
    showToast(`SRT importado: ${subtitles.length} subtítulos`, 'success');
  };

  fileManager.onLyricLoaded = ({ sections, subtitles }) => {
    subtitleManager.load(subtitles);
    // Load sections
    sectionManager.clear();
    for (const sec of sections) {
      const added = sectionManager.add(sec.type, sec.startTime, sec.endTime, sec.name || '');
      if (sec.color) {
        sectionManager.update(added.id, { color: sec.color });
      }
    }
    syncSectionMarkers();
    renderSectionsStrip();
    subtitleUI.syncRegions();
    showToast(`.lyric cargado: ${subtitles.length} bloques, ${sections.length} secciones`, 'success');
  };

  document.getElementById('btn-import-audio').addEventListener('click', () => fileManager.openAudioPicker());
  document.getElementById('btn-import-srt').addEventListener('click', () => fileManager.openLyricPicker());
  document.getElementById('btn-export-srt').addEventListener('click', exportLyric);
  const btnExportSrt = document.getElementById('btn-export-srt-compat');
  if (btnExportSrt) btnExportSrt.addEventListener('click', exportSRT);
  document.getElementById('btn-save-project').addEventListener('click', () => {
    fileManager.saveProject(subtitleManager.getAll(), sectionManager.getAll());
    showToast('Proyecto .lyric guardado', 'success');
  });
  document.getElementById('btn-load-project').addEventListener('click', () => fileManager.openProjectPicker());
  document.getElementById('btn-welcome-load').addEventListener('click', () => fileManager.openAudioPicker());
}

// ─── Audio Callbacks ───
function setupAudioCallbacks() {
  audioEngine.onReady = (duration) => {
    totalTimeEl.textContent = msToDisplay(duration * 1000);
    renderSectionsStrip();
    audioEngine._injectScrollbarStyles();
    // Sync any subtitles that were loaded before audio was ready
    subtitleUI.syncRegions();
    syncSectionMarkers();
  };
  audioEngine.onTimeUpdate = (currentTime) => {
    currentTimeEl.textContent = msToDisplay(currentTime * 1000);
    subtitleUI.updatePreview(currentTime);
  };
  audioEngine.onRegionUpdate = (region) => {
    if (region.id.startsWith('section-')) {
      const id = parseInt(region.id.replace('section-', ''));
      if (!isNaN(id)) {
        let startMs = region.start * 1000;
        let endMs = region.end * 1000;
        if (_magneticSnap) {
          const originalSec = sectionManager.get(id);
          if (originalSec) {
            const originalDuration = originalSec.endTime - originalSec.startTime;
            const isMove = Math.abs((endMs - startMs) - originalDuration) < 5;
            const boundaries = getGlobalSnapBoundaries(null, id);
            const snappedStart = snapToNearestEdge(startMs, boundaries, 150);
            const snappedEnd = snapToNearestEdge(endMs, boundaries, 150);
            
            if (isMove) {
              if (snappedStart !== startMs) {
                startMs = snappedStart;
                endMs = startMs + originalDuration;
              } else if (snappedEnd !== endMs) {
                endMs = snappedEnd;
                startMs = endMs - originalDuration;
              }
            } else {
              startMs = snappedStart;
              endMs = snappedEnd;
            }
            if (endMs <= startMs) endMs = startMs + 100;
          }
        }
        // Visually snap
        if (Math.abs(region.start * 1000 - startMs) > 1 || Math.abs(region.end * 1000 - endMs) > 1) {
          region.setOptions({ start: startMs / 1000, end: endMs / 1000 });
        }
        sectionManager.update(id, { startTime: startMs, endTime: endMs });
      }
      return;
    }
    const idStr = region.id.replace('sub-', '');
    const id = parseInt(idStr);
    if (!isNaN(id)) {
      let startMs = region.start * 1000;
      let endMs = region.end * 1000;
      if (_magneticSnap) {
        const result = magneticAdjust(id, startMs, endMs);
        startMs = result.startTime;
        endMs = result.endTime;
      }
      // Visually snap
      if (Math.abs(region.start * 1000 - startMs) > 1 || Math.abs(region.end * 1000 - endMs) > 1) {
        region.setOptions({ start: startMs / 1000, end: endMs / 1000 });
      }
      // Use silent update to avoid re-triggering syncRegions → region.setOptions → region-updated loop
      subtitleManager.updateSilent(id, { startTime: startMs, endTime: endMs });
      // Only update the list panel, not the waveform regions
      subtitleUI.renderList();
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
  document.getElementById('btn-play').addEventListener('click', () => { audioEngine.playPause(); updatePlayButton(); });
  document.getElementById('btn-stop').addEventListener('click', () => { audioEngine.stop(); updatePlayButton(); });
  document.getElementById('speed-select').addEventListener('change', (e) => { audioEngine.setPlaybackRate(parseFloat(e.target.value)); });
  document.getElementById('zoom-slider').addEventListener('input', (e) => { audioEngine.setZoom(parseInt(e.target.value)); });
  document.getElementById('volume-slider').addEventListener('input', (e) => { audioEngine.setVolume(parseFloat(e.target.value)); });
  document.getElementById('btn-full-frame').addEventListener('click', () => {
    openFullscreenPlayer();
  });

  // Mouse wheel interaction on waveform
  const waveformEl = document.getElementById('waveform');
  const zoomSlider = document.getElementById('zoom-slider');
  waveformEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.ctrlKey) {
      // Ctrl + Scroll: Desplazamiento horizontal (panning)
      if (audioEngine.wavesurfer) {
        const wrapper = audioEngine.wavesurfer.getWrapper();
        wrapper.scrollLeft += e.deltaY;
      }
    } else {
      // Normal Scroll: Zoom
      const step = e.deltaY < 0 ? 20 : -20; // scroll up = zoom in
      const current = parseInt(zoomSlider.value);
      const newVal = Math.max(10, Math.min(500, current + step));
      zoomSlider.value = newVal;
      audioEngine.setZoom(newVal);
    }
  }, { passive: false });

  setInterval(() => { if (audioEngine.isReady) updatePlayButton(); }, 200);
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
    showToast(fixed > 0 ? `${fixed} solapamiento${fixed > 1 ? 's' : ''} corregido${fixed > 1 ? 's' : ''}` : 'No se encontraron solapamientos', fixed > 0 ? 'success' : 'info');
  });
  document.getElementById('btn-auto-detect').addEventListener('click', () => openSpeechModal());
  document.getElementById('btn-snap-bpm').addEventListener('click', () => {
    if (!bpmDetector.bpm) { showToast('Primero carga un audio para detectar BPM', 'warning'); return; }
    snapSubtitlesToBPM();
  });
  // Magnetic snap toggle
  const magBtn = document.getElementById('btn-magnetic-snap');
  magBtn.addEventListener('click', () => {
    _magneticSnap = !_magneticSnap;
    magBtn.classList.toggle('active', _magneticSnap);
    showToast(_magneticSnap ? 'Snap magnético activado' : 'Snap magnético desactivado', 'info');
  });
  document.getElementById('btn-undo').addEventListener('click', () => {
    if (subtitleManager.undo()) showToast('Acción deshecha', 'info');
  });
  // Add overlay button
  document.getElementById('btn-add-overlay').addEventListener('click', () => addOverlayAtCurrentTime());

  // Copy selected subtitles to internal clipboard
  document.getElementById('btn-copy-subs').addEventListener('click', () => {
    const selected = Array.from(subtitleUI.selectedIds)
      .map(id => subtitleManager.get(id))
      .filter(Boolean);
    if (selected.length === 0) { showToast('Selecciona subtítulos para copiar', 'warning'); return; }
    _clipboard = selected.map(s => ({ ...s }));
    showToast(`${selected.length} subtítulo${selected.length !== 1 ? 's' : ''} copiado${selected.length !== 1 ? 's' : ''}`, 'success');
  });

  // Paste clipboard subtitles at current playhead position
  document.getElementById('btn-paste-subs').addEventListener('click', () => {
    if (_clipboard.length === 0) { showToast('El portapapeles está vacío', 'warning'); return; }
    if (!audioEngine.isReady) { showToast('Carga un audio primero', 'warning'); return; }
    const currentMs = audioEngine.getCurrentTime() * 1000;
    const minStart = Math.min(..._clipboard.map(s => s.startTime));
    const offset = currentMs - minStart;
    const newIds = [];
    for (const s of _clipboard) {
      const newSub = subtitleManager.add(s.startTime + offset, s.endTime + offset, s.text, s.layer);
      newIds.push(newSub.id);
    }
    subtitleUI.selectedIds.clear();
    for (const id of newIds) subtitleUI.selectedIds.add(id);
    subtitleUI.lastSelectedId = newIds[newIds.length - 1];
    subtitleUI.renderList();
    subtitleUI.renderEditor();
    showToast(`${newIds.length} subtítulo${newIds.length !== 1 ? 's' : ''} pegado${newIds.length !== 1 ? 's' : ''}`, 'success');
  });
}

// ─── Quick Lyrics Input ───
function setupQuickInput() {
  const input = document.getElementById('quick-input-field');
  const durationSelect = document.getElementById('quick-input-duration');

  input.addEventListener('keydown', (e) => {
    e.stopPropagation(); // Don't trigger global shortcuts
    if (e.key === 'Enter' && input.value.trim()) {
      e.preventDefault();
      if (!audioEngine.isReady) { showToast('Carga un audio primero', 'warning'); return; }
      const dur = parseInt(durationSelect.value);
      const currentMs = audioEngine.getCurrentTime() * 1000;
      const sub = subtitleManager.add(currentMs, currentMs + dur, input.value.trim());
      subtitleUI.select(sub.id);
      input.value = '';
      showToast('Subtítulo añadido', 'success');
    }
  });
}

// ─── Sections ───
function setupSections() {
  document.getElementById('btn-add-section').addEventListener('click', openSectionModal);

  // Section type change — show custom name field
  document.getElementById('section-type').addEventListener('change', (e) => {
    document.getElementById('section-custom-name-group').style.display = e.target.value === 'CUSTOM' ? 'block' : 'none';
  });

  // Section modal buttons
  document.getElementById('section-modal-close').addEventListener('click', closeSectionModal);
  document.getElementById('section-cancel').addEventListener('click', closeSectionModal);
  document.querySelector('#section-modal .modal-backdrop').addEventListener('click', closeSectionModal);
  document.getElementById('section-set-start').addEventListener('click', () => {
    document.getElementById('section-start').value = msToDisplay(audioEngine.getCurrentTime() * 1000);
  });
  document.getElementById('section-set-end').addEventListener('click', () => {
    document.getElementById('section-end').value = msToDisplay(audioEngine.getCurrentTime() * 1000);
  });
  document.getElementById('section-save').addEventListener('click', saveSection);

  // Copy section modal
  document.getElementById('copy-section-modal-close').addEventListener('click', closeCopySectionModal);
  document.getElementById('copy-section-cancel').addEventListener('click', closeCopySectionModal);
  document.querySelector('#copy-section-modal .modal-backdrop').addEventListener('click', closeCopySectionModal);
  document.getElementById('copy-set-target').addEventListener('click', () => {
    document.getElementById('copy-target-time').value = msToDisplay(audioEngine.getCurrentTime() * 1000);
  });
  document.getElementById('copy-section-confirm').addEventListener('click', confirmCopySection);
}

function openSectionModal() {
  document.getElementById('section-start').value = msToDisplay(audioEngine.getCurrentTime() * 1000);
  document.getElementById('section-end').value = '';
  document.getElementById('section-modal').style.display = 'flex';
}

function closeSectionModal() {
  document.getElementById('section-modal').style.display = 'none';
}

function saveSection() {
  const type = document.getElementById('section-type').value;
  const customName = document.getElementById('section-custom-name').value.trim();
  const startStr = document.getElementById('section-start').value;
  const endStr = document.getElementById('section-end').value;
  const startMs = parseDisplayTime(startStr);
  const endMs = parseDisplayTime(endStr);
  if (startMs === null || endMs === null || endMs <= startMs) {
    showToast('Verifica los tiempos de inicio y fin', 'warning');
    return;
  }
  const sec = sectionManager.add(type, startMs, endMs, type === 'CUSTOM' ? customName : '');
  
  // Auto-snap to subtitle blocks
  const snapResult = sectionManager.magneticSnapSection(sec.id, subtitleManager);
  
  closeSectionModal();
  
  if (snapResult.snapped) {
    showToast(`Sección "${type}" añadida y auto-ajustada`, 'success');
  } else {
    showToast(`Sección "${type}" añadida`, 'success');
  }
}

function renderSectionChips() {
  const container = document.getElementById('sections-chips');
  const sections = sectionManager.getAll();
  if (sections.length === 0) {
    container.innerHTML = '<span class="sections-empty">Sin secciones</span>';
    return;
  }
  container.innerHTML = sections.map(s => `
    <div class="section-chip" data-id="${s.id}" style="--chip-color: ${s.color}" title="${msToDisplay(s.startTime)} → ${msToDisplay(s.endTime)}">
      <span class="section-chip-name">${s.name}</span>
      <span class="section-chip-time">${msToDisplay(s.startTime)}</span>
      <button class="section-chip-snap" data-id="${s.id}" title="Snap magnético">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h6v6H4z"/><path d="M14 4h6v6h-6z"/><line x1="10" y1="7" x2="14" y2="7"/></svg>
      </button>
      <button class="section-chip-copy" data-id="${s.id}" title="Copiar sección">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
      </button>
      <button class="section-chip-delete" data-id="${s.id}" title="Eliminar sección">✕</button>
    </div>
  `).join('');

  // Chip click -> seek
  container.querySelectorAll('.section-chip').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.section-chip-copy') || e.target.closest('.section-chip-delete') || e.target.closest('.section-chip-snap')) return;
      const id = parseInt(el.dataset.id);
      const sec = sectionManager.get(id);
      if (sec) audioEngine.seekTo(sec.startTime / 1000);
    });
  });

  // Snap magnético button
  container.querySelectorAll('.section-chip-snap').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      const result = sectionManager.magneticSnapSection(id, subtitleManager);
      if (result.snapped) {
        syncSectionMarkers();
        showToast('Sección ajustada a los subtítulos', 'success');
      } else {
        showToast('No hay subtítulos en esta sección', 'warning');
      }
    });
  });

  // Copy button
  container.querySelectorAll('.section-chip-copy').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      openCopySectionModal(id);
    });
  });

  // Delete button
  container.querySelectorAll('.section-chip-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      sectionManager.remove(id);
      showToast('Sección eliminada', 'info');
    });
  });
}

function syncSectionMarkers() {
  audioEngine.clearSectionMarkers();
  for (const sec of sectionManager.getAll()) {
    const displayLabel = sec.type === 'CUSTOM' ? sec.name : i18n.t('sec_' + sec.type.toLowerCase());
    audioEngine.addSectionMarker(sec.id, sec.startTime / 1000, sec.endTime / 1000, displayLabel, sec.color);
  }
}

function openCopySectionModal(sectionId) {
  _copySectionId = sectionId;
  const sec = sectionManager.get(sectionId);
  if (!sec) return;
  document.getElementById('copy-section-source').textContent = `${sec.name} (${msToDisplay(sec.startTime)} → ${msToDisplay(sec.endTime)})`;
  document.getElementById('copy-target-time').value = msToDisplay(audioEngine.getCurrentTime() * 1000);
  document.getElementById('copy-section-modal').style.display = 'flex';
}

function closeCopySectionModal() {
  document.getElementById('copy-section-modal').style.display = 'none';
  _copySectionId = null;
}

function confirmCopySection() {
  if (!_copySectionId) return;
  const targetMs = parseDisplayTime(document.getElementById('copy-target-time').value);
  if (targetMs === null) { showToast('Tiempo de destino inválido', 'warning'); return; }
  const newSubs = sectionManager.copySectionSubtitles(_copySectionId, targetMs, subtitleManager);
  closeCopySectionModal();
  showToast(`Sección copiada: ${newSubs.length} subtítulo${newSubs.length !== 1 ? 's' : ''}`, 'success');
}

// ─── Global Snapping ───
function getGlobalSnapBoundaries(excludeSubId = null, excludeSecId = null) {
  const boundaries = new Set();
  subtitleManager.getAll().forEach(sub => {
    if (excludeSubId !== null && sub.id === excludeSubId) return;
    boundaries.add(sub.startTime);
    boundaries.add(sub.endTime);
  });
  sectionManager.getAll().forEach(sec => {
    if (excludeSecId !== null && sec.id === excludeSecId) return;
    boundaries.add(sec.startTime);
    boundaries.add(sec.endTime);
  });
  boundaries.add(0);
  return Array.from(boundaries);
}

function snapToNearestEdge(timeMs, boundaries, toleranceMs = 200) {
  let nearest = null;
  let minDiff = Infinity;
  for (const b of boundaries) {
    const diff = Math.abs(timeMs - b);
    if (diff < minDiff && diff <= toleranceMs) {
      minDiff = diff;
      nearest = b;
    }
  }
  return nearest !== null ? nearest : timeMs;
}

// ─── Magnetic Snap (prevent overlaps & global snap) ───
function magneticAdjust(id, startMs, endMs) {
  const GAP = 10; // 10ms gap between subtitles
  const sub = subtitleManager.get(id);
  const isPrimary = sub && sub.layer === 0;

  // 1. Prevent overlapping with other primary subtitles
  if (isPrimary) {
    const layerSubs = subtitleManager.subtitles.filter(s => s.layer === 0);
    const idx = layerSubs.findIndex(s => s.id === id);
    const prev = idx > 0 ? layerSubs[idx - 1] : null;
    const next = idx < layerSubs.length - 1 ? layerSubs[idx + 1] : null;

    if (prev && startMs < prev.endTime) {
      const shift = prev.endTime + GAP - startMs;
      startMs = prev.endTime + GAP;
      endMs += shift;
    }
    if (next && endMs > next.startTime) {
      endMs = next.startTime - GAP;
    }
  }

  // 2. Global Magnetic Snapping
  if (sub) {
    const originalDuration = sub.endTime - sub.startTime;
    const isMove = Math.abs((endMs - startMs) - originalDuration) < 5;
    const boundaries = getGlobalSnapBoundaries(id, null);
    const snappedStart = snapToNearestEdge(startMs, boundaries, 150); // 150ms tolerance
    const snappedEnd = snapToNearestEdge(endMs, boundaries, 150);

    if (isMove) {
      if (snappedStart !== startMs) {
        startMs = snappedStart;
        endMs = startMs + originalDuration;
      } else if (snappedEnd !== endMs) {
        endMs = snappedEnd;
        startMs = endMs - originalDuration;
      }
    } else {
      startMs = snappedStart;
      endMs = snappedEnd;
    }
  }

  // 3. Ensure minimum duration
  if (endMs <= startMs) endMs = startMs + 100;

  return { startTime: startMs, endTime: endMs };
}

// ─── Add Subtitle ───
function addSubtitleAtCurrentTime() {
  if (!audioEngine.isReady) { showToast('Carga un audio primero', 'warning'); return; }
  const currentMs = audioEngine.getCurrentTime() * 1000;
  const sub = subtitleManager.add(currentMs, currentMs + 2000, '', 0);
  subtitleUI.select(sub.id);
  setTimeout(() => { const ta = document.getElementById('edit-text'); if (ta) ta.focus(); }, 50);
}

function addOverlayAtCurrentTime() {
  if (!audioEngine.isReady) { showToast('Carga un audio primero', 'warning'); return; }
  const currentMs = audioEngine.getCurrentTime() * 1000;
  const sub = subtitleManager.add(currentMs, currentMs + 2000, '', 1);
  subtitleUI.select(sub.id);
  showToast('Overlay añadido (capa 2)', 'success');
  setTimeout(() => { const ta = document.getElementById('edit-text'); if (ta) ta.focus(); }, 50);
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
  }
}

// ─── Snap to BPM ───
function snapSubtitlesToBPM() {
  const subs = subtitleManager.getAll();
  if (subs.length === 0) return;
  let snapped = 0;
  for (const sub of subs) {
    const ns = bpmDetector.getNearestBeat(sub.startTime / 1000) * 1000;
    const ne = bpmDetector.getNearestBeat(sub.endTime / 1000) * 1000;
    if (ns !== sub.startTime || ne !== sub.endTime) {
      subtitleManager.update(sub.id, { startTime: ns, endTime: ne > ns ? ne : ns + 1000 });
      snapped++;
    }
  }
  showToast(`${snapped} subtítulo${snapped !== 1 ? 's' : ''} alineado${snapped !== 1 ? 's' : ''} al BPM`, 'success');
}

// ─── Export .lyric (native) ───
function exportLyric() {
  const subs = subtitleManager.getAll();
  if (subs.length === 0) { showToast('No hay bloques para exportar', 'warning'); return; }
  const sections = sectionManager.getAll();
  fileManager.exportLyric(subs, sections);
  showToast('.lyric exportado correctamente', 'success');
}

// ─── Export SRT (compatibility) ───
function exportSRT() {
  const subs = subtitleManager.getAll();
  if (subs.length === 0) { showToast('No hay subtítulos para exportar', 'warning'); return; }
  const sections = sectionManager.getAll();
  if (sections.length > 0) {
    const srtContent = serializeSRTWithSections(subs, sections);
    const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileManager.currentFileName || 'subtitles'}.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } else {
    fileManager.exportSRT(subs);
  }
  showToast('SRT exportado correctamente', 'success');
}

// ─── Drag & Drop ───
function setupDragDrop() {
  let dragCounter = 0;
  document.addEventListener('dragenter', (e) => { e.preventDefault(); dragCounter++; dropZone.classList.add('visible'); document.body.classList.add('drag-over'); });
  document.addEventListener('dragleave', (e) => { e.preventDefault(); dragCounter--; if (dragCounter <= 0) { dragCounter = 0; dropZone.classList.remove('visible'); document.body.classList.remove('drag-over'); } });
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => {
    e.preventDefault(); dragCounter = 0; dropZone.classList.remove('visible'); document.body.classList.remove('drag-over');
    for (const file of Array.from(e.dataTransfer.files)) {
      const ext = file.name.split('.').pop().toLowerCase();
      if (['mp3','wav','ogg','m4a','flac','aac','webm'].includes(ext)) fileManager.onAudioLoaded(file);
      else if (ext === 'lyric') fileManager._handleLyricFile(file);
      else if (['srt','txt'].includes(ext)) fileManager._handleSRTFile(file);
    }
  });
}

// ─── Keyboard Shortcuts ───
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const active = document.activeElement;
    const isEditing = active && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && active.type === 'text'));
    if (e.ctrlKey && e.key === 's') { e.preventDefault(); exportLyric(); return; }
    // Ctrl+Z (Win/Linux) or Cmd+Z (Mac)
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); if (subtitleManager.undo()) showToast('Acción deshecha', 'info'); return; }
    if (isEditing) return;
    switch (e.key) {
      case ' ': e.preventDefault(); audioEngine.playPause(); updatePlayButton(); break;
      case 'Enter': e.preventDefault(); addSubtitleAtCurrentTime(); break;
      case 'Delete': case 'Backspace': {
        const toDelete = Array.from(subtitleUI.selectedIds);
        if (toDelete.length > 0) {
          e.preventDefault();
          for (const selId of toDelete) {
            subtitleManager.remove(selId);
            audioEngine.removeRegion(selId);
          }
          subtitleUI.selectedIds.clear();
          subtitleUI.lastSelectedId = null;
          subtitleUI.renderEditor();
        }
        break;
      }
      case 'ArrowLeft': e.preventDefault(); audioEngine.seekRelative(e.shiftKey ? -0.01 : -0.1); break;
      case 'ArrowRight': e.preventDefault(); audioEngine.seekRelative(e.shiftKey ? 0.01 : 0.1); break;
      case 'Tab': {
        const curId = subtitleUI.lastSelectedId;
        e.preventDefault();
        if (curId) {
          const next = e.shiftKey ? subtitleManager.getPrev(curId) : subtitleManager.getNext(curId);
          if (next) { subtitleUI.select(next.id); audioEngine.seekTo(next.startTime / 1000); }
        } else if (subtitleManager.count > 0) {
          subtitleUI.select(subtitleManager.getAll()[0].id);
        }
        break;
      }
      case '?': toggleShortcutsModal(); break;
    }
  });
}

// ─── Speech Modal ───
function setupModals() {
  document.getElementById('shortcuts-badge').addEventListener('click', toggleShortcutsModal);
  document.getElementById('shortcuts-modal-close').addEventListener('click', () => { document.getElementById('shortcuts-modal').style.display = 'none'; });
  document.querySelector('#shortcuts-modal .modal-backdrop').addEventListener('click', () => { document.getElementById('shortcuts-modal').style.display = 'none'; });
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
  if (!speechDetector.checkSupport()) { showToast('Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.', 'error'); return; }
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
    if (results.length > 0) {
      const currentMs = audioEngine.getCurrentTime() * 1000;
      let offset = 0;
      for (const r of results) { subtitleManager.add(currentMs + offset, currentMs + offset + 2000, r.text); offset += 2500; }
      showToast(`${results.length} subtítulo${results.length > 1 ? 's' : ''} creado${results.length > 1 ? 's' : ''}`, 'success');
    }
  } else {
    speechDetector.onResult = (results) => {
      const el = document.getElementById('speech-results');
      for (const r of results.filter(r => r.isFinal)) {
        el.innerHTML += `<div style="padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);">"${r.text}" <span style="color:var(--text-muted)">(${Math.round(r.confidence*100)}%)</span></div>`;
      }
      el.scrollTop = el.scrollHeight;
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
    btnEl.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg> Detener`;
  } else {
    statusEl.classList.remove('listening');
    statusEl.querySelector('span').textContent = 'Listo para iniciar';
    btnEl.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/></svg> Iniciar Escucha`;
  }
}

// ─── Section Strip (above waveform) ───
function renderSectionsStrip() {
  const ruler = document.getElementById('sections-strip-ruler');
  if (!ruler) return;

  const duration = audioEngine.getDuration();
  if (!duration || duration <= 0) { ruler.innerHTML = ''; return; }

  ruler.innerHTML = '';

  for (const sec of sectionManager.getAll()) {
    const leftPct  = (sec.startTime / 1000 / duration) * 100;
    const widthPct = ((sec.endTime - sec.startTime) / 1000 / duration) * 100;

    const block = document.createElement('div');
    block.className = 'section-strip-block';
    block.dataset.id = sec.id;
    block.style.left  = `${leftPct}%`;
    block.style.width = `${widthPct}%`;
    block.style.backgroundColor = `${sec.color}1a`;
    block.style.borderColor = sec.color;
    block.title = `${sec.name}  ${msToDisplay(sec.startTime)} → ${msToDisplay(sec.endTime)}`;

    const label = document.createElement('span');
    label.className = 'section-strip-block-label';
    label.style.color = sec.color;
    label.textContent = sec.type === 'CUSTOM' ? sec.name : i18n.t('sec_' + sec.type.toLowerCase());

    const handleL = document.createElement('div');
    handleL.className = 'section-strip-resize left';
    const handleR = document.createElement('div');
    handleR.className = 'section-strip-resize right';

    block.appendChild(handleL);
    block.appendChild(label);
    block.appendChild(handleR);
    ruler.appendChild(block);

    // --- Drag to MOVE ---
    block.addEventListener('mousedown', (e) => {
      if (e.target === handleL || e.target === handleR) return;
      if (e.button !== 0) return; // Only left click for drag
      e.preventDefault();
      const rulerRect = ruler.getBoundingClientRect();
      const startX = e.clientX;
      const origStartPct = (sec.startTime / 1000 / duration);
      const origWidthPct = (sec.endTime - sec.startTime) / 1000 / duration;

      const onMove = (me) => {
        const dx = (me.clientX - startX) / rulerRect.width;
        
        let newStartPct = Math.max(0, origStartPct + dx);
        let newEndPct = newStartPct + origWidthPct;
        if (newEndPct > 1) { newEndPct = 1; newStartPct = 1 - origWidthPct; }
        
        const newStartTime = newStartPct * duration * 1000;
        const offsetMs = newStartTime - sec.startTime;

        // Move subtitles by the delta relative to the current position
        if (offsetMs !== 0) {
          sectionManager.moveSectionSubtitles(sec.id, offsetMs, subtitleManager);
        }

        // Update section data silently (without triggering re-render yet)
        sec.startTime = newStartTime;
        sec.endTime = newEndPct * duration * 1000;
        
        // Update ONLY the visual position of this block
        block.style.left = `${newStartPct * 100}%`;
      };
      
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        
        if (_magneticSnap) {
          const originalDuration = sec.endTime - sec.startTime;
          const boundaries = getGlobalSnapBoundaries(null, sec.id);
          const snappedStart = snapToNearestEdge(sec.startTime, boundaries, 150);
          
          if (snappedStart !== sec.startTime) {
            const snapOffset = snappedStart - sec.startTime;
            if (snapOffset !== 0) {
              sectionManager.moveSectionSubtitles(sec.id, snapOffset, subtitleManager);
            }
            sec.startTime = snappedStart;
            sec.endTime = snappedStart + originalDuration;
          }
        }

        // Final sync: notify listeners and redraw all waveform regions
        sectionManager._sort();
        sectionManager._notify();
        syncSectionMarkers();
        subtitleUI.syncRegions(); // re-render subtitle blocks at new positions
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // --- Right Click to COPY ---
    block.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openCopySectionModal(sec.id);
    });

    // --- Drag LEFT edge to resize ---
    handleL.addEventListener('mousedown', (e) => {
      e.preventDefault(); e.stopPropagation();
      const rulerRect = ruler.getBoundingClientRect();
      const startX = e.clientX;
      const origStart = sec.startTime / 1000;

      const onMove = (me) => {
        const dx = (me.clientX - startX) / rulerRect.width * duration;
        const newStart = Math.max(0, origStart + dx);
        if (newStart < sec.endTime / 1000 - 0.1) {
          sectionManager.update(sec.id, { startTime: newStart * 1000 });
          renderSectionsStrip();
        }
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        syncSectionMarkers();
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // --- Drag RIGHT edge to resize ---
    handleR.addEventListener('mousedown', (e) => {
      e.preventDefault(); e.stopPropagation();
      const rulerRect = ruler.getBoundingClientRect();
      const startX = e.clientX;
      const origEnd = sec.endTime / 1000;

      const onMove = (me) => {
        const dx = (me.clientX - startX) / rulerRect.width * duration;
        const newEnd = Math.min(duration, origEnd + dx);
        if (newEnd > sec.startTime / 1000 + 0.1) {
          sectionManager.update(sec.id, { endTime: newEnd * 1000 });
          renderSectionsStrip();
        }
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        syncSectionMarkers();
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }
}

// ─── Helpers ───
function parseDisplayTime(str) {
  const match = (str || '').trim().match(/(\d+):(\d+)\.(\d+)/);
  if (!match) return null;
  const [, m, s, ms] = match;
  return parseInt(m) * 60000 + parseInt(s) * 1000 + parseInt(ms.padEnd(3, '0').substring(0, 3));
}

// ─── Toast Notifications ───
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('hiding'); setTimeout(() => toast.remove(), 300); }, 3000);
}

// ─── Language Toggle ───
function setupLangToggle() {
  document.getElementById('btn-lang-es').addEventListener('click', () => {
    i18n.setLanguage('es');
    updateLangButtons();
    syncSectionMarkers();
    renderSectionsStrip();
    showToast('Idioma cambiado a Español', 'info');
  });
  document.getElementById('btn-lang-en').addEventListener('click', () => {
    i18n.setLanguage('en');
    updateLangButtons();
    syncSectionMarkers();
    renderSectionsStrip();
    showToast('Language changed to English', 'info');
  });
}

function updateLangButtons() {
  const btnEs = document.getElementById('btn-lang-es');
  const btnEn = document.getElementById('btn-lang-en');
  if (i18n.lang === 'es') {
    btnEs.classList.add('active');
    btnEn.classList.remove('active');
  } else {
    btnEs.classList.remove('active');
    btnEn.classList.add('active');
  }
}

// ─── Fullscreen Karaoke Player ───
function setupFullscreenPlayer() {
  const fsPlayer = document.getElementById('fullscreen-player');
  const fsCloseBtn = document.getElementById('fs-close-btn');
  const fsPlayBtn = document.getElementById('fs-play-btn');
  const fsProgressBar = document.getElementById('fs-progress-bar');

  // Close button
  fsCloseBtn.addEventListener('click', closeFullscreenPlayer);

  // Play/Pause
  fsPlayBtn.addEventListener('click', () => {
    audioEngine.playPause();
    updateFsPlayButton();
  });

  // Progress bar click to seek
  fsProgressBar.addEventListener('click', (e) => {
    if (!audioEngine.isReady) return;
    const rect = fsProgressBar.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const duration = audioEngine.getDuration();
    audioEngine.seekTo(pct * duration);
  });

  // Listen for fullscreenchange to sync state
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
      fsPlayer.style.display = 'none';
    }
  });

  // Escape key while in fullscreen
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && fsPlayer.style.display !== 'none') {
      closeFullscreenPlayer();
    }
  });

  // Update play button state periodically
  setInterval(() => {
    if (fsPlayer.style.display !== 'none') {
      updateFsPlayButton();
    }
  }, 200);
}

function openFullscreenPlayer() {
  if (!audioEngine.isReady) {
    showToast('Carga un audio primero', 'warning');
    return;
  }
  const fsPlayer = document.getElementById('fullscreen-player');
  fsPlayer.style.display = 'flex';

  // Try Fullscreen API
  if (fsPlayer.requestFullscreen) {
    fsPlayer.requestFullscreen().catch(() => {});
  } else if (fsPlayer.webkitRequestFullscreen) {
    fsPlayer.webkitRequestFullscreen();
  }

  updateFsPlayButton();
  showToast('Modo karaoke fullscreen', 'info');
}

function closeFullscreenPlayer() {
  const fsPlayer = document.getElementById('fullscreen-player');
  fsPlayer.style.display = 'none';
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
}

function updateFsPlayButton() {
  const playing = audioEngine.isPlaying();
  const fsPlayIcon = document.getElementById('fs-play-icon');
  const fsPauseIcon = document.getElementById('fs-pause-icon');
  if (fsPlayIcon) fsPlayIcon.style.display = playing ? 'none' : 'block';
  if (fsPauseIcon) fsPauseIcon.style.display = playing ? 'block' : 'none';
}

// ─── Start ───
init();
