/**
 * Audio Engine
 * Manages wavesurfer.js instance, plugins, and transport controls
 */

import WaveSurfer from 'https://esm.sh/wavesurfer.js@7.12.6';
import RegionsPlugin from 'https://esm.sh/wavesurfer.js@7.12.6/dist/plugins/regions.esm.js';
import TimelinePlugin from 'https://esm.sh/wavesurfer.js@7.12.6/dist/plugins/timeline.esm.js';
import Minimap from 'https://esm.sh/wavesurfer.js@7.12.6/dist/plugins/minimap.esm.js';

export class AudioEngine {
  constructor() {
    this.wavesurfer = null;
    this.regions = null;
    this.timeline = null;
    this.minimap = null;
    this.audioBuffer = null;
    this.isReady = false;
    this.onReady = null;
    this.onTimeUpdate = null;
    this.onRegionUpdate = null;
    this.onSeek = null;
    this._playbackRate = 1;
  }

  /**
   * Initialize wavesurfer with plugins
   */
  init() {
    this.regions = RegionsPlugin.create();
    
    this.timeline = TimelinePlugin.create({
      container: '#timeline',
      primaryLabelInterval: 5,
      secondaryLabelInterval: 1,
      primaryLabelSpacing: 100,
      style: {
        fontSize: '11px',
        color: '#94a3b8',
      }
    });

    this.minimap = Minimap.create({
      height: 30,
      waveColor: '#1e3a5f',
      progressColor: '#3b82f6',
      container: '#minimap',
      cursorColor: '#06b6d4',
    });

    this.wavesurfer = WaveSurfer.create({
      container: '#waveform',
      waveColor: '#1e3a5f',
      progressColor: '#3b82f680',
      cursorColor: '#06b6d4',
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 140,
      normalize: true,
      fillParent: true,
      minPxPerSec: 50,
      autoScroll: true,
      autoCenter: true,
      hideScrollbar: false,
      plugins: [this.regions, this.timeline, this.minimap],
    });

    this._setupEvents();
    this._injectScrollbarStyles();
  }

  /**
   * Inject scrollbar styles into WaveSurfer's shadow root
   * (external CSS cannot style scrollbars inside shadow DOM)
   */
  _injectScrollbarStyles() {
    // WaveSurfer renders into a shadow root — we must inject styles directly
    const waveformEl = document.getElementById('waveform');
    const shadowRoot = waveformEl?.shadowRoot;
    if (!shadowRoot) return;

    const style = document.createElement('style');
    style.textContent = `
      .scroll::-webkit-scrollbar {
        height: 8px !important;
      }
      .scroll::-webkit-scrollbar-track {
        background: #080d1a !important;
        border-top: 1px solid rgba(255,255,255,0.06) !important;
      }
      .scroll::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.16) !important;
        border-radius: 4px !important;
        border: 2px solid #080d1a !important;
      }
      .scroll::-webkit-scrollbar-thumb:hover {
        background: rgba(6,182,212,0.6) !important;
        box-shadow: 0 0 8px rgba(6,182,212,0.4) !important;
      }
    `;
    shadowRoot.appendChild(style);
  }

  /**
   * Setup wavesurfer event listeners
   */
  _setupEvents() {
    this.wavesurfer.on('ready', () => {
      this.isReady = true;
      if (this.onReady) this.onReady(this.wavesurfer.getDuration());
    });

    this.wavesurfer.on('timeupdate', (currentTime) => {
      if (this.onTimeUpdate) this.onTimeUpdate(currentTime);
    });

    this.wavesurfer.on('seeking', (currentTime) => {
      if (this.onSeek) this.onSeek(currentTime);
    });

    this.wavesurfer.on('finish', () => {
      // Could add repeat logic here
    });

    // Region events
    this.regions.on('region-updated', (region) => {
      if (this.onRegionUpdate) this.onRegionUpdate(region);
    });

    this.regions.on('region-clicked', (region, e) => {
      e.stopPropagation();
      if (this.onRegionClick) this.onRegionClick(region);
    });
  }

  /**
   * Load an audio file
   * @param {File} file - Audio file to load
   */
  async loadFile(file) {
    const url = URL.createObjectURL(file);
    this.wavesurfer.load(url);
    
    // Also decode for BPM analysis
    const arrayBuffer = await file.arrayBuffer();
    const audioCtx = new AudioContext();
    this.audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    audioCtx.close();
    
    return this.audioBuffer;
  }

  // --- Transport Controls ---

  play() {
    if (this.isReady) this.wavesurfer.play();
  }

  pause() {
    if (this.isReady) this.wavesurfer.pause();
  }

  playPause() {
    if (this.isReady) this.wavesurfer.playPause();
  }

  stop() {
    if (this.isReady) {
      this.wavesurfer.pause();
      this.wavesurfer.setTime(0);
    }
  }

  seekTo(time) {
    if (this.isReady) this.wavesurfer.setTime(time);
  }

  seekRelative(deltaSeconds) {
    if (this.isReady) {
      const current = this.wavesurfer.getCurrentTime();
      const duration = this.wavesurfer.getDuration();
      const newTime = Math.max(0, Math.min(duration, current + deltaSeconds));
      this.wavesurfer.setTime(newTime);
    }
  }

  getCurrentTime() {
    return this.isReady ? this.wavesurfer.getCurrentTime() : 0;
  }

  getDuration() {
    return this.isReady ? this.wavesurfer.getDuration() : 0;
  }

  isPlaying() {
    return this.isReady ? this.wavesurfer.isPlaying() : false;
  }

  setVolume(value) {
    if (this.isReady) this.wavesurfer.setVolume(value);
  }

  setPlaybackRate(rate) {
    this._playbackRate = rate;
    if (this.isReady) this.wavesurfer.setPlaybackRate(rate);
  }

  getPlaybackRate() {
    return this._playbackRate;
  }

  // --- Zoom ---

  setZoom(pxPerSec) {
    if (this.isReady) this.wavesurfer.zoom(pxPerSec);
  }

  // --- Regions ---

  /**
   * Add a region (subtitle visualization)
   */
  addRegion(id, start, end, text, color = 'rgba(59, 130, 246, 0.2)') {
    return this.regions.addRegion({
      id: `sub-${id}`,
      start,
      end,
      content: text,
      color,
      drag: true,
      resize: true,
      minLength: 0.1,
    });
  }

  /**
   * Update an existing region
   */
  updateRegion(id, start, end, text, color) {
    const regionId = `sub-${id}`;
    const allRegions = this.regions.getRegions();
    const region = allRegions.find(r => r.id === regionId);
    if (region) {
      region.setOptions({
        start,
        end,
        content: text,
        color: color || region.color,
      });
    }
  }

  /**
   * Remove a region
   */
  removeRegion(id) {
    const regionId = `sub-${id}`;
    const allRegions = this.regions.getRegions();
    const region = allRegions.find(r => r.id === regionId);
    if (region) region.remove();
  }

  /**
   * Clear all regions
   */
  clearRegions() {
    this.regions.clearRegions();
  }

  /**
   * Highlight a specific region as active
   */
  highlightRegion(id) {
    const allRegions = this.regions.getRegions();
    for (const region of allRegions) {
      const isActive = region.id === `sub-${id}`;
      region.setOptions({
        color: isActive
          ? 'rgba(6, 182, 212, 0.35)'
          : 'rgba(59, 130, 246, 0.15)',
      });
    }
  }

  // --- Section Markers ---

  /**
   * Add a section marker (visual band with label on the waveform)
   */
  addSectionMarker(id, start, end, label, color) {
    const alpha = '18'; // ~10% opacity hex
    return this.regions.addRegion({
      id: `section-${id}`,
      start,
      end,
      content: label,
      color: color + alpha,
      drag: false,
      resize: false,
    });
  }

  /**
   * Remove a section marker
   */
  removeSectionMarker(id) {
    const regionId = `section-${id}`;
    const allRegions = this.regions.getRegions();
    const region = allRegions.find(r => r.id === regionId);
    if (region) region.remove();
  }

  /**
   * Clear all section markers (but keep subtitle regions)
   */
  clearSectionMarkers() {
    const allRegions = this.regions.getRegions();
    for (const region of allRegions) {
      if (region.id.startsWith('section-')) {
        region.remove();
      }
    }
  }

  /**
   * Destroy the wavesurfer instance
   */
  destroy() {
    if (this.wavesurfer) {
      this.wavesurfer.destroy();
    }
  }
}
