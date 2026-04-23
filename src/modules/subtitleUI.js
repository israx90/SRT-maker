/**
 * Subtitle UI
 * Manages the subtitle list panel, editor, and visual sync
 * Enhanced with inline editing, section labels, and duplicate support
 */

import { msToDisplay } from './srtParser.js';
import i18n from './i18n.js';

export class SubtitleUI {
  constructor(subtitleManager, audioEngine) {
    this.manager = subtitleManager;
    this.engine = audioEngine;
    this.sectionManager = null; // Set externally
    this.selectedIds = new Set();
    this.lastSelectedId = null;
    this.listEl = null;
    this.editorEl = null;
    this.previewEl = null;
    this.onSubtitleSelect = null;
    this._inlineEditingId = null;
    this._lastActiveSubId = null;
  }

  /** Backward-compat getter for single-selection code in main.js */
  get selectedId() {
    return this.lastSelectedId;
  }

  /**
   * Initialize UI elements
   */
  init() {
    this.listEl = document.getElementById('subtitle-list');
    this.editorEl = document.getElementById('subtitle-editor');
    
    // Karaoke elements
    this.karaokePrevEl = document.getElementById('karaoke-prev');
    this.karaokeCurrentEl = document.getElementById('karaoke-current');
    this.karaokeNextEl = document.getElementById('karaoke-next');
    this.karaokeOverlayEl = document.getElementById('karaoke-overlay');

    this.manager.onChange = () => {
      this.renderList();
      this.syncRegions();
    };
  }

  /**
   * Render the subtitle list
   */
  renderList() {
    if (!this.listEl) return;
    const subs = this.manager.getAll();
    const overlaps = this.manager.detectOverlaps();
    const overlapIndices = new Set(overlaps.map(o => o.index));

    if (subs.length === 0) {
      this.listEl.innerHTML = `
        <div class="empty-list">
          <div class="empty-icon">📝</div>
          <p>No hay subtítulos</p>
          <p class="empty-hint">Presiona <kbd>Enter</kbd> durante la reproducción para añadir</p>
        </div>
      `;
      this.renderEditor(null);
      return;
    }

    this.listEl.innerHTML = subs.map((sub, index) => {
      const isActive = this.selectedIds.has(sub.id);
      const isOverlap = overlapIndices.has(index);
      const duration = sub.endTime - sub.startTime;
      const isOverlay = sub.layer === 1;

      // Get section info if available
      let section = null;
      let sectionChip = '';
      let sectionStyle = '';
      if (this.sectionManager) {
        section = this.sectionManager.getAtTime(sub.startTime);
        if (section) {
          const secName = section.type === 'CUSTOM' ? section.name : i18n.t('sec_' + section.type.toLowerCase());
          sectionChip = `<span class="sub-section-chip" style="--chip-color: ${section.color}">${secName}</span>`;
          // Section color indicator on left border (overlay keeps blue, section adds top stripe)
          if (!isOverlay) {
            sectionStyle = `style="--section-color: ${section.color}"`;
          }
        }
      }

      const layerBadge = isOverlay ? '<span class="sub-layer-badge">OVR</span>' : '';
      const sectionClass = section && !isOverlay ? 'has-section' : '';

      return `
        <div class="sub-item ${isActive ? 'active' : ''} ${isOverlap ? 'overlap' : ''} ${isOverlay ? 'overlay-item' : ''} ${sectionClass}"
             data-id="${sub.id}"
             ${sectionStyle}
             title="${isOverlap ? '⚠️ Solapamiento detectado' : ''} ${isOverlay ? 'Overlay (capa 2)' : ''}${section ? ' — ' + section.name : ''}">
          <div class="sub-item-header">
            <span class="sub-index">#${index + 1}</span>
            ${layerBadge}
            ${sectionChip}
            <span class="sub-times">
              ${msToDisplay(sub.startTime)} → ${msToDisplay(sub.endTime)}
            </span>
            <span class="sub-duration">${(duration / 1000).toFixed(1)}s</span>
          </div>
          <div class="sub-item-text" data-sub-id="${sub.id}">${this._escapeHtml(sub.text) || '<em class="empty-text">Texto vacío</em>'}</div>
          ${isOverlap ? '<div class="overlap-badge">⚠️ Overlap</div>' : ''}
        </div>
      `;
    }).join('');

    // Click events
    this.listEl.querySelectorAll('.sub-item').forEach(el => {
      el.addEventListener('click', (e) => {
        // Don't select if we're inline editing
        if (e.target.closest('.inline-edit-area')) return;
        const id = parseInt(el.dataset.id);
        this.select(id, e.shiftKey, e.ctrlKey || e.metaKey);
      });
      el.addEventListener('dblclick', (e) => {
        const id = parseInt(el.dataset.id);
        const textEl = el.querySelector('.sub-item-text');
        // If double-clicked on the text area, start inline editing
        if (e.target === textEl || textEl.contains(e.target)) {
          e.stopPropagation();
          this._startInlineEdit(id, textEl);
          return;
        }
        // Otherwise seek to that subtitle
        const sub = this.manager.get(id);
        if (sub) {
          this.engine.seekTo(sub.startTime / 1000);
        }
      });
    });

    // Keep selected item visible
    if (this.selectedIds.size > 0) {
      // Just scroll to the first active element found
      const activeEl = this.listEl.querySelector('.sub-item.active');
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }

  /**
   * Start inline editing on a subtitle text element
   */
  _startInlineEdit(id, textEl) {
    if (this._inlineEditingId === id) return;
    this._inlineEditingId = id;
    const sub = this.manager.get(id);
    if (!sub) return;

    textEl.innerHTML = `<textarea class="inline-edit-area" rows="2">${this._escapeHtml(sub.text)}</textarea>`;
    const textarea = textEl.querySelector('.inline-edit-area');
    textarea.focus();
    textarea.select();

    let _finished = false;
    const finish = () => {
      if (_finished) return;
      _finished = true;
      this._inlineEditingId = null;
      this.manager.update(id, { text: textarea.value });
    };

    textarea.addEventListener('blur', finish);
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        _finished = true;
        this._inlineEditingId = null;
        this.renderList();
      }
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        finish();
      }
      e.stopPropagation();
    });
  }

  /**
   * Select a subtitle
   */
  select(id, shiftKey = false, ctrlKey = false) {
    if (!id) {
      this.selectedIds.clear();
      this.lastSelectedId = null;
    } else if (shiftKey && this.lastSelectedId) {
      // Select range
      const subs = this.manager.getAll();
      const lastIdx = subs.findIndex(s => s.id === this.lastSelectedId);
      const currIdx = subs.findIndex(s => s.id === id);
      if (lastIdx !== -1 && currIdx !== -1) {
        const start = Math.min(lastIdx, currIdx);
        const end = Math.max(lastIdx, currIdx);
        if (!ctrlKey) this.selectedIds.clear();
        for (let i = start; i <= end; i++) {
          this.selectedIds.add(subs[i].id);
        }
      }
    } else if (ctrlKey) {
      // Toggle
      if (this.selectedIds.has(id)) {
        this.selectedIds.delete(id);
      } else {
        this.selectedIds.add(id);
      }
      this.lastSelectedId = id;
    } else {
      // Single select
      this.selectedIds.clear();
      this.selectedIds.add(id);
      this.lastSelectedId = id;
    }

    this.renderList();
    this.renderEditor();
    
    // Highlight regions
    const allRegions = this.engine.regions ? this.engine.regions.getRegions() : [];
    for (const region of allRegions) {
      if (region.id.startsWith('sub-')) {
        const rId = parseInt(region.id.replace('sub-', ''));
        const sub = this.manager.get(rId);
        
        let sectionColor = null;
        if (sub && this.sectionManager) {
          const section = this.sectionManager.getAtTime(sub.startTime);
          if (section) sectionColor = section.color;
        }

        const isActive = this.selectedIds.has(rId);
        
        let color;
        let borderColor;
        if (sub && sub.layer === 1) {
          color = isActive ? 'rgba(200, 200, 200, 0.42)' : 'rgba(200, 200, 200, 0.18)';
          borderColor = 'rgba(128, 128, 128, 0.7)';
        } else {
          color = sectionColor ? this._hexToRgba(sectionColor, 0.18) : 'rgba(255, 215, 0, 0.15)';
          borderColor = sectionColor ? this._hexToRgba(sectionColor, 0.6) : 'rgba(255, 215, 0, 0.6)';
          if (isActive) {
            color = sectionColor ? this._hexToRgba(sectionColor, 0.42) : 'rgba(255, 255, 0, 0.4)';
            borderColor = sectionColor ? this._hexToRgba(sectionColor, 0.9) : 'rgba(255, 255, 0, 0.9)';
          }
        }

        const regionColor = color; 
        region.setOptions({
          color: regionColor,
        });
        
        let retries = 0;
        const applyBorder = () => {
          if (region && region.element) {
            region.element.style.setProperty('--region-border-color', borderColor);
            region.element.style.setProperty('--region-bg-color', regionColor);
          } else if (retries < 10) {
            retries++;
            setTimeout(applyBorder, 50);
          }
        };
        applyBorder();
      }
    }

    if (this.onSubtitleSelect && id) this.onSubtitleSelect(id);
  }

  /**
   * Render the editor panel for selected subtitle
   */
  renderEditor() {
    if (!this.editorEl) return;

    if (this.selectedIds.size === 0) {
      this.editorEl.innerHTML = `
        <div class="editor-empty">
          <p>Selecciona un subtítulo para editar</p>
        </div>
      `;
      return;
    }

    if (this.selectedIds.size > 1) {
      this.editorEl.innerHTML = `
        <div class="editor-empty">
          <p>${this.selectedIds.size} subtítulos seleccionados</p>
          <p class="empty-hint" style="margin-top: 10px;">Mueve los bloques en el waveform, o usa copiar/pegar.</p>
        </div>
      `;
      return;
    }

    const id = Array.from(this.selectedIds)[0];
    const sub = this.manager.get(id);
    if (!sub) return;

    const duration = sub.endTime - sub.startTime;
    const index = this.manager.indexOf(id);

    // Get section info
    let sectionInfo = '';
    if (this.sectionManager) {
      const section = this.sectionManager.getAtTime(sub.startTime);
      if (section) {
        const secName = section.type === 'CUSTOM' ? section.name : i18n.t('sec_' + section.type.toLowerCase());
        sectionInfo = `<span class="editor-section-badge" style="--chip-color: ${section.color}">${secName}</span>`;
      }
    }

    this.editorEl.innerHTML = `
      <div class="editor-content">
        <div class="editor-title">
          <div class="editor-title-left">
            <span>Subtítulo #${index + 1}</span>
            ${sectionInfo}
          </div>
          <div class="editor-title-actions">
            <button class="btn-icon btn-duplicate-sub" title="Duplicar subtítulo">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
            </button>
            <button class="btn-icon btn-delete-sub" title="Eliminar (Delete)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3,6 5,6 21,6"/><path d="M19,6V20a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6M8,6V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="editor-field">
          <label>Texto</label>
          <textarea id="edit-text" rows="3" placeholder="Escribe el subtítulo...">${this._escapeHtml(sub.text)}</textarea>
        </div>
        <div class="editor-times">
          <div class="editor-field time-field">
            <label>Inicio</label>
            <div class="time-input-group">
              <input type="text" id="edit-start" value="${msToDisplay(sub.startTime)}" />
              <button class="btn-icon btn-set-time" data-target="start" title="Usar tiempo actual">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="editor-field time-field">
            <label>Fin</label>
            <div class="time-input-group">
              <input type="text" id="edit-end" value="${msToDisplay(sub.endTime)}" />
              <button class="btn-icon btn-set-time" data-target="end" title="Usar tiempo actual">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="editor-field time-field">
            <label>Duración</label>
            <span class="duration-display">${(duration / 1000).toFixed(2)}s</span>
          </div>
        </div>
        <div class="editor-layer-row">
          <div class="editor-field">
            <label>Capa</label>
            <select id="edit-layer">
              <option value="0" ${sub.layer === 0 ? 'selected' : ''}>Principal</option>
              <option value="1" ${sub.layer === 1 ? 'selected' : ''}>Overlay</option>
            </select>
          </div>
        </div>
        <div class="editor-actions">
          <button class="btn btn-sm btn-split" title="Dividir en posición actual">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="2" x2="12" y2="22"/><polyline points="8,6 12,2 16,6"/><polyline points="8,18 12,22 16,18"/>
            </svg>
            Dividir
          </button>
          <button class="btn btn-sm btn-merge" title="Fusionar con el siguiente">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M8,6 L12,12 L8,18"/><path d="M16,6 L12,12 L16,18"/>
            </svg>
            Fusionar
          </button>
        </div>
      </div>
    `;

    // Event: Text editing
    const textArea = this.editorEl.querySelector('#edit-text');
    textArea.addEventListener('input', () => {
      this.manager.update(id, { text: textArea.value });
    });

    // Event: Layer change
    const layerSelect = this.editorEl.querySelector('#edit-layer');
    layerSelect.addEventListener('change', () => {
      this.manager.update(id, { layer: parseInt(layerSelect.value) });
    });

    // Event: Time editing
    const startInput = this.editorEl.querySelector('#edit-start');
    const endInput = this.editorEl.querySelector('#edit-end');

    startInput.addEventListener('change', () => {
      const ms = this._parseDisplayTime(startInput.value);
      if (ms !== null) this.manager.update(id, { startTime: ms });
    });

    endInput.addEventListener('change', () => {
      const ms = this._parseDisplayTime(endInput.value);
      if (ms !== null) this.manager.update(id, { endTime: ms });
    });

    // Event: Set time from current playback position
    this.editorEl.querySelectorAll('.btn-set-time').forEach(btn => {
      btn.addEventListener('click', () => {
        const currentMs = this.engine.getCurrentTime() * 1000;
        const target = btn.dataset.target;
        if (target === 'start') {
          this.manager.update(id, { startTime: currentMs });
        } else {
          this.manager.update(id, { endTime: currentMs });
        }
      });
    });

    // Event: Delete
    this.editorEl.querySelector('.btn-delete-sub').addEventListener('click', () => {
      this.manager.remove(id);
      this.engine.removeRegion(id);
      this.selectedIds.delete(id);
      if (this.lastSelectedId === id) this.lastSelectedId = null;
      this.renderEditor();
    });

    // Event: Duplicate
    this.editorEl.querySelector('.btn-duplicate-sub').addEventListener('click', () => {
      const newSub = this.manager.add(sub.endTime + 100, sub.endTime + (sub.endTime - sub.startTime) + 100, sub.text);
      this.select(newSub.id);
    });

    // Event: Split
    this.editorEl.querySelector('.btn-split').addEventListener('click', () => {
      const currentMs = this.engine.getCurrentTime() * 1000;
      this.manager.split(id, currentMs);
    });

    // Event: Merge
    this.editorEl.querySelector('.btn-merge').addEventListener('click', () => {
      const next = this.manager.getNext(id);
      if (next) {
        this.manager.merge(id, next.id);
      }
    });
  }

  /**
   * Update subtitle preview overlay during playback
   */
  updatePreview(currentTimeSec) {
    const currentTimeMs = currentTimeSec * 1000;
    const sub = this.manager.getAtTime(currentTimeMs, 0); // Primary layer
    const overlaySub = this.manager.getAtTime(currentTimeMs, 1); // Overlay layer
    
    if (this.karaokeCurrentEl) {
      if (sub) {
        // Show text preserving line breaks for multi-line
        this.karaokeCurrentEl.innerHTML = this._escapeHtml(sub.text).replace(/\n/g, '<br>');
        
        const prev = this.manager.getPrev(sub.id);
        this.karaokePrevEl.textContent = prev ? prev.text.replace(/\n/g, ' ') : '';
        
        const next = this.manager.getNext(sub.id);
        this.karaokeNextEl.textContent = next ? next.text.replace(/\n/g, ' ') : '';
        
        // Auto-select during playback only when the active subtitle changes
        if (!this._isEditing() && this._lastActiveSubId !== sub.id) {
          this._lastActiveSubId = sub.id;
          this.select(sub.id);
        }
      } else {
        this.karaokeCurrentEl.textContent = '';
        this._lastActiveSubId = null;

        const allSubs = this.manager.getAll();
        const nextSub = allSubs.find(s => s.layer === 0 && s.startTime > currentTimeMs);
        if (nextSub) {
           this.karaokePrevEl.textContent = '';
           this.karaokeNextEl.textContent = nextSub.text.replace(/\n/g, ' ');
        } else {
           this.karaokePrevEl.textContent = '';
           this.karaokeNextEl.textContent = '';
        }
      }

      // Overlay line
      if (this.karaokeOverlayEl) {
        if (overlaySub) {
          this.karaokeOverlayEl.innerHTML = this._escapeHtml(overlaySub.text).replace(/\n/g, '<br>');
          this.karaokeOverlayEl.style.display = 'block';
          this.karaokeOverlayEl.style.opacity = '0.85';
        } else {
          this.karaokeOverlayEl.textContent = '';
          this.karaokeOverlayEl.style.display = 'none';
        }
      }
    }

    // Also update fullscreen karaoke if visible
    this._updateFullscreenKaraoke(currentTimeMs, sub, overlaySub);
  }

  /**
   * Update fullscreen karaoke player
   */
  _updateFullscreenKaraoke(currentTimeMs, sub, overlaySub) {
    const fsContainer = document.getElementById('fs-karaoke-container');
    if (!fsContainer || fsContainer.closest('#fullscreen-player')?.style.display === 'none') return;

    const fsCurrent = document.getElementById('fs-current');
    const fsPrev = document.getElementById('fs-prev');
    const fsNext = document.getElementById('fs-next');
    const fsOverlay = document.getElementById('fs-overlay');
    const fsProgress = document.getElementById('fs-progress-fill');
    const fsTime = document.getElementById('fs-time');
    const fsSectionBadge = document.getElementById('fs-section-badge');

    if (fsSectionBadge && this.sectionManager) {
      const section = this.sectionManager.getAtTime(currentTimeMs);
      if (section) {
        fsSectionBadge.textContent = section.name;
        fsSectionBadge.style.backgroundColor = section.color || '#333';
        fsSectionBadge.style.display = 'block';
      } else {
        fsSectionBadge.style.display = 'none';
      }
    }

    if (fsCurrent) {
      if (sub) {
        fsCurrent.innerHTML = this._escapeHtml(sub.text).replace(/\n/g, '<br>');
        const prev = this.manager.getPrev(sub.id);
        if (fsPrev) fsPrev.textContent = prev ? prev.text.replace(/\n/g, ' ') : '';
        const next = this.manager.getNext(sub.id);
        if (fsNext) fsNext.textContent = next ? next.text.replace(/\n/g, ' ') : '';
      } else {
        fsCurrent.textContent = '';
        if (fsPrev) fsPrev.textContent = '';
        const allSubs = this.manager.getAll();
        const nextSub = allSubs.find(s => s.layer === 0 && s.startTime > currentTimeMs);
        if (fsNext) fsNext.textContent = nextSub ? nextSub.text.replace(/\n/g, ' ') : '';
      }
    }

    if (fsOverlay) {
      if (overlaySub) {
        fsOverlay.innerHTML = this._escapeHtml(overlaySub.text).replace(/\n/g, '<br>');
        fsOverlay.style.display = 'block';
        fsOverlay.style.opacity = '0.85';
      } else {
        fsOverlay.textContent = '';
        fsOverlay.style.display = 'none';
      }
    }

    // Update progress bar
    if (fsProgress && this.engine.isReady) {
      const duration = this.engine.getDuration();
      if (duration > 0) {
        fsProgress.style.width = `${(currentTimeMs / 1000 / duration) * 100}%`;
      }
    }
    if (fsTime && this.engine.isReady) {
      const totalMs = this.engine.getDuration() * 1000;
      fsTime.textContent = `${msToDisplay(currentTimeMs)} / ${msToDisplay(totalMs)}`;
    }
  }

  /**
   * Check if user is currently editing text
   */
  _isEditing() {
    const active = document.activeElement;
    return active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT');
  }

  /**
   * Sync regions with wavesurfer
   */
  syncRegions() {
    if (this._syncTimeout) clearTimeout(this._syncTimeout);
    this._syncTimeout = setTimeout(() => this._doSyncRegions(), 50);
  }

  _doSyncRegions() {
    if (!this.engine.regions) return;

    // Clear only subtitle regions (not section markers)
    const allRegions = this.engine.regions.getRegions();
    for (const region of allRegions) {
      if (region.id.startsWith('sub-')) {
        region.remove();
      }
    }

    const subs = this.manager.getAll();
    const overlaps = this.manager.detectOverlaps();
    const overlapIndices = new Set(overlaps.map(o => o.index));

    for (let i = 0; i < subs.length; i++) {
      const sub = subs[i];
      const isOverlap = overlapIndices.has(i);
      const isActive = this.selectedIds.has(sub.id);
      const isOverlay = sub.layer === 1;

      let sectionColor = null;
      if (this.sectionManager) {
        const section = this.sectionManager.getAtTime(sub.startTime);
        if (section) sectionColor = section.color;
      }

      let color;
      let borderColor;
      if (isOverlay) {
        color = isActive ? 'rgba(200, 200, 200, 0.42)' : 'rgba(200, 200, 200, 0.18)';
        borderColor = 'rgba(128, 128, 128, 0.7)';
      } else {
        color = sectionColor ? this._hexToRgba(sectionColor, 0.18) : 'rgba(255, 215, 0, 0.18)';
        borderColor = sectionColor ? this._hexToRgba(sectionColor, 0.6) : 'rgba(255, 215, 0, 0.6)';
        if (isOverlap) {
          color = 'rgba(239, 68, 68, 0.3)';
          borderColor = 'rgba(239, 68, 68, 0.8)';
        }
        if (isActive) {
          color = sectionColor ? this._hexToRgba(sectionColor, 0.42) : 'rgba(255, 215, 0, 0.42)';
          borderColor = sectionColor ? this._hexToRgba(sectionColor, 0.9) : 'rgba(255, 215, 0, 0.9)';
        }
      }

      const region = this.engine.addRegion(sub.id, sub.startTime / 1000, sub.endTime / 1000, sub.text, color, sub.layer);
      
      // Update border and background safely
      let retries = 0;
      const applyBorder = () => {
        if (region && region.element) {
          region.element.style.setProperty('--region-border-color', borderColor);
          region.element.style.setProperty('--region-bg-color', color);
        } else if (retries < 10) {
          retries++;
          setTimeout(applyBorder, 50);
        }
      };
      applyBorder();
    }
  }

  /**
   * Convert hex to rgba string
   */
  _hexToRgba(hex, alpha) {
    if (!hex) return null;
    let r = 0, g = 0, b = 0;
    // Remove hash
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /**
   * Parse display time format "MM:SS.mmm" to milliseconds
   */
  _parseDisplayTime(str) {
    const match = str.trim().match(/(\d+):(\d+)\.(\d+)/);
    if (!match) return null;
    const [, m, s, ms] = match;
    return parseInt(m) * 60000 + parseInt(s) * 1000 + parseInt(ms.padEnd(3, '0').substring(0, 3));
  }

  /**
   * Escape HTML special characters
   */
  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
