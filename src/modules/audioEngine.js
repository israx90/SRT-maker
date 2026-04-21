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
        color: '#ffd700',
      }
    });

    this.minimap = Minimap.create({
      height: 30,
      waveColor: '#222',
      progressColor: '#ffd700',
      container: '#minimap',
      cursorColor: '#ffff00',
    });

    this.wavesurfer = WaveSurfer.create({
      container: '#waveform',
      waveColor: '#333',
      progressColor: '#ffd70080',
      cursorColor: '#ffff00',
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
   */
  _injectScrollbarStyles() {
    const waveformEl = document.getElementById('waveform');
    const shadowRoot = waveformEl?.shadowRoot;
    if (!shadowRoot) return;

    const style = document.createElement('style');
    style.textContent = `
      *::-webkit-scrollbar {
        height: 8px !important;
        width: 8px !important;
      }
      *::-webkit-scrollbar-track {
        background: #000 !important;
      }
      *::-webkit-scrollbar-thumb {
        background: rgba(255,215,0,0.4) !important;
        border-radius: 4px !important;
        border: 2px solid #000 !important;
      }
      *::-webkit-scrollbar-thumb:hover {
        background: rgba(255,255,0,0.8) !important;
      }
      
      /* Regions styling */
      .region {
        border: 1px solid rgba(255, 215, 0, 0.6) !important;
        border-radius: 4px !important;
        overflow: hidden !important;
        display: flex !important;
        align-items: center !important;
        padding: 0 4px !important;
        box-sizing: border-box !important;
      }
      .region-content {
        color: #fff !important;
        font-size: 10px !important;
        font-weight: 500 !important;
        text-shadow: 0 1px 2px #000 !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        pointer-events: none !important;
        width: 100% !important;
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
  addRegion(id, start, end, text, color = 'rgba(255, 215, 0, 0.2)') {
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
   * Get a region by subtitle ID
   */
  getRegion(id) {
    const regionId = `sub-${id}`;
    return this.regions.getRegions().find(r => r.id === regionId) || null;
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
          ? 'rgba(255, 255, 0, 0.4)'
          : 'rgba(255, 215, 0, 0.15)',
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
      drag: true,
      resize: true,
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
