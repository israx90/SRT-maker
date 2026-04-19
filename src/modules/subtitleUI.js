/**
 * Subtitle UI
 * Manages the subtitle list panel, editor, and visual sync
 * Enhanced with inline editing, section labels, and duplicate support
 */

import { msToDisplay } from './srtParser.js';

export class SubtitleUI {
  constructor(subtitleManager, audioEngine) {
    this.manager = subtitleManager;
    this.engine = audioEngine;
    this.sectionManager = null; // Set externally
    this.selectedId = null;
    this.listEl = null;
    this.editorEl = null;
    this.previewEl = null;
    this.onSubtitleSelect = null;
    this._inlineEditingId = null;
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

    // Listen for manager changes
    this.manager.onChange = (subs) => {
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
      const isActive = sub.id === this.selectedId;
      const isOverlap = overlapIndices.has(index);
      const duration = sub.endTime - sub.startTime;

      // Get section info if available
      let sectionChip = '';
      if (this.sectionManager) {
        const section = this.sectionManager.getAtTime(sub.startTime);
        if (section) {
          sectionChip = `<span class="sub-section-chip" style="--chip-color: ${section.color}">${section.name}</span>`;
        }
      }

      return `
        <div class="sub-item ${isActive ? 'active' : ''} ${isOverlap ? 'overlap' : ''}"
             data-id="${sub.id}"
             title="${isOverlap ? '⚠️ Solapamiento detectado' : ''}">
          <div class="sub-item-header">
            <span class="sub-index">#${index + 1}</span>
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
        this.select(id);
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
    if (this.selectedId) {
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

    const finish = () => {
      this.manager.update(id, { text: textarea.value });
      this._inlineEditingId = null;
    };

    textarea.addEventListener('blur', finish);
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this._inlineEditingId = null;
        this.renderList();
      }
      // Ctrl+Enter to confirm
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        finish();
      }
      // Stop propagation so space/enter don't trigger global shortcuts
      e.stopPropagation();
    });
  }

  /**
   * Select a subtitle
   */
  select(id) {
    this.selectedId = id;
    this.renderList();
    this.renderEditor(id);
    this.engine.highlightRegion(id);
    if (this.onSubtitleSelect) this.onSubtitleSelect(id);
  }

  /**
   * Render the editor panel for selected subtitle
   */
  renderEditor(id) {
    if (!this.editorEl) return;

    if (!id) {
      this.editorEl.innerHTML = `
        <div class="editor-empty">
          <p>Selecciona un subtítulo para editar</p>
        </div>
      `;
      return;
    }

    const sub = this.manager.get(id);
    if (!sub) return;

    const duration = sub.endTime - sub.startTime;
    const index = this.manager.indexOf(id);

    // Get section info
    let sectionInfo = '';
    if (this.sectionManager) {
      const section = this.sectionManager.getAtTime(sub.startTime);
      if (section) {
        sectionInfo = `<span class="editor-section-badge" style="--chip-color: ${section.color}">${section.name}</span>`;
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
      this.selectedId = null;
      this.renderEditor(null);
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
    const sub = this.manager.getAtTime(currentTimeMs);
    
    if (this.karaokeCurrentEl) {
      if (sub) {
        this.karaokeCurrentEl.textContent = sub.text.replace(/\n/g, ' ');
        
        const prev = this.manager.getPrev(sub.id);
        this.karaokePrevEl.textContent = prev ? prev.text.replace(/\n/g, ' ') : '';
        
        const next = this.manager.getNext(sub.id);
        this.karaokeNextEl.textContent = next ? next.text.replace(/\n/g, ' ') : '';
        
        // Auto-select during playback if not editing
        if (sub.id !== this.selectedId && !this._isEditing()) {
          this.select(sub.id);
        }
      } else {
        this.karaokeCurrentEl.textContent = '';
        
        // If there's no active subtitle, find the closest upcoming subtitle
        const allSubs = this.manager.getAll();
        const nextSub = allSubs.find(s => s.startTime > currentTimeMs);
        if (nextSub) {
           this.karaokePrevEl.textContent = '';
           this.karaokeNextEl.textContent = nextSub.text.replace(/\n/g, ' ');
        } else {
           this.karaokePrevEl.textContent = '';
           this.karaokeNextEl.textContent = '';
        }
      }
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
    // Clear only subtitle regions (not section markers)
    const allRegions = this.engine.regions ? this.engine.regions.getRegions() : [];
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
      const isActive = sub.id === this.selectedId;
      let color = 'rgba(59, 130, 246, 0.15)';
      if (isOverlap) color = 'rgba(239, 68, 68, 0.25)';
      if (isActive) color = 'rgba(6, 182, 212, 0.35)';

      this.engine.addRegion(sub.id, sub.startTime / 1000, sub.endTime / 1000, '', color);
    }
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
