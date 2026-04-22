/**
 * File Manager
 * Handles file import/export for audio, SRT, and .lyric files
 */

import { parseSRT, serializeSRT } from './srtParser.js';
import { parseLyric, serializeLyric } from './lyricParser.js';

export class FileManager {
  constructor() {
    this.onAudioLoaded = null;
    this.onSRTLoaded = null;
    this.onLyricLoaded = null;
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
   * Open file picker for .lyric files
   */
  openLyricPicker() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.lyric,.srt,.txt';
    input.onchange = (e) => {
      if (e.target.files.length > 0) {
        const file = e.target.files[0];
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'lyric') {
          this._handleLyricFile(file);
        } else {
          this._handleSRTFile(file);
        }
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
      } else if (ext === 'lyric') {
        this._handleLyricFile(file);
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
   * Process .lyric file
   */
  async _handleLyricFile(file) {
    try {
      const text = await file.text();
      const result = parseLyric(text);
      this.currentFileName = file.name.replace(/\.[^/.]+$/, '');
      if (this.onLyricLoaded) {
        this.onLyricLoaded(result);
      }
    } catch (err) {
      console.error('Error parsing .lyric file:', err);
    }
  }

  /**
   * Export subtitles as SRT file (compatibility)
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
   * Export as .lyric file (native format)
   */
  exportLyric(subtitles, sections, filename) {
    const lyricContent = serializeLyric(subtitles, sections);
    const blob = new Blob([lyricContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `${this.currentFileName || 'project'}.lyric`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Save project as .lyric (replaces old JSON project save)
   */
  saveProject(subtitles, sections) {
    this.exportLyric(subtitles, sections);
  }

  /**
   * Load project — accepts .lyric or legacy .json
   */
  openProjectPicker() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.lyric,.json';
    input.onchange = async (e) => {
      if (e.target.files.length > 0) {
        const file = e.target.files[0];
        const ext = file.name.split('.').pop().toLowerCase();

        if (ext === 'lyric') {
          this._handleLyricFile(file);
        } else if (ext === 'json') {
          // Legacy JSON project support
          try {
            const text = await file.text();
            const project = JSON.parse(text);
            if (project.subtitles && this.onSRTLoaded) {
              this.currentFileName = project.audioFile || '';
              this.onSRTLoaded(project.subtitles, project.audioFile);
            }
          } catch (err) {
            console.error('Error loading legacy project:', err);
          }
        }
      }
    };
    input.click();
  }
}
