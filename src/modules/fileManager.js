/**
 * File Manager
 * Handles file import/export for audio and SRT files
 */

import { parseSRT, serializeSRT } from './srtParser.js';

export class FileManager {
  constructor() {
    this.onAudioLoaded = null;
    this.onSRTLoaded = null;
    this.currentFileName = '';
  }

  /**
   * Setup drag & drop zone
   */
  setupDropZone(element) {
    element.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      element.classList.add('drag-over');
    });

    element.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      element.classList.remove('drag-over');
    });

    element.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      element.classList.remove('drag-over');
      const files = Array.from(e.dataTransfer.files);
      this._handleFiles(files);
    });
  }

  /**
   * Open file picker for audio
   */
  openAudioPicker() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.mp3,.wav,.ogg,.m4a,.flac,.aac,.webm';
    input.onchange = (e) => {
      if (e.target.files.length > 0) {
        this._handleAudioFile(e.target.files[0]);
      }
    };
    input.click();
  }

  /**
   * Open file picker for SRT
   */
  openSRTPicker() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.srt,.txt';
    input.onchange = (e) => {
      if (e.target.files.length > 0) {
        this._handleSRTFile(e.target.files[0]);
      }
    };
    input.click();
  }

  /**
   * Handle dropped files by type detection
   */
  _handleFiles(files) {
    for (const file of files) {
      const ext = file.name.split('.').pop().toLowerCase();
      if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'webm'].includes(ext)) {
        this._handleAudioFile(file);
      } else if (['srt', 'txt'].includes(ext)) {
        this._handleSRTFile(file);
      }
    }
  }

  /**
   * Process audio file
   */
  _handleAudioFile(file) {
    this.currentFileName = file.name.replace(/\.[^/.]+$/, '');
    if (this.onAudioLoaded) this.onAudioLoaded(file);
  }

  /**
   * Process SRT file
   */
  async _handleSRTFile(file) {
    try {
      const text = await file.text();
      const subtitles = parseSRT(text);
      if (this.onSRTLoaded) this.onSRTLoaded(subtitles, file.name);
    } catch (err) {
      console.error('Error parsing SRT file:', err);
    }
  }

  /**
   * Export subtitles as SRT file
   */
  exportSRT(subtitles, filename) {
    const srtContent = serializeSRT(subtitles);
    const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `${this.currentFileName || 'subtitles'}.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Save project as JSON (audio name + subtitles)
   */
  saveProject(subtitles, metadata) {
    const project = {
      version: '1.0',
      audioFile: this.currentFileName,
      metadata: metadata || {},
      subtitles: subtitles,
      savedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.currentFileName || 'project'}.srt-project.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Load project from JSON
   */
  openProjectPicker() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      if (e.target.files.length > 0) {
        try {
          const text = await e.target.files[0].text();
          const project = JSON.parse(text);
          if (project.subtitles && this.onSRTLoaded) {
            this.currentFileName = project.audioFile || '';
            this.onSRTLoaded(project.subtitles, project.audioFile);
          }
        } catch (err) {
          console.error('Error loading project:', err);
        }
      }
    };
    input.click();
  }
}
