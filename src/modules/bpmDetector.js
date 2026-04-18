/**
 * BPM Detector
 * Uses Web Audio API OfflineAudioContext for tempo analysis
 */

export class BPMDetector {
  constructor() {
    this.bpm = null;
    this.beats = [];
    this.confidence = 0;
  }

  /**
   * Analyze an AudioBuffer and detect BPM
   * @param {AudioBuffer} audioBuffer
   * @returns {Promise<{bpm: number, beats: number[], confidence: number}>}
   */
  async analyze(audioBuffer) {
    // Use OfflineAudioContext for fast processing
    const offlineCtx = new OfflineAudioContext(
      1,
      audioBuffer.length,
      audioBuffer.sampleRate
    );

    // Create a source from the buffer
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;

    // Low-pass filter to isolate bass/kick frequencies
    const lowpass = offlineCtx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 150;
    lowpass.Q.value = 1;

    // High-pass filter to remove sub-bass rumble
    const highpass = offlineCtx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 30;
    highpass.Q.value = 1;

    source.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(offlineCtx.destination);
    source.start(0);

    const renderedBuffer = await offlineCtx.startRendering();
    const channelData = renderedBuffer.getChannelData(0);
    const sampleRate = renderedBuffer.sampleRate;

    // Peak detection
    const peaks = this._detectPeaks(channelData, sampleRate);
    
    if (peaks.length < 2) {
      return { bpm: 0, beats: [], confidence: 0 };
    }

    // Calculate intervals between peaks
    const intervals = [];
    for (let i = 1; i < peaks.length; i++) {
      intervals.push(peaks[i] - peaks[i - 1]);
    }

    // Build histogram of intervals
    const bpmResult = this._calculateBPM(intervals, sampleRate);
    
    // Convert peak positions to time in seconds
    this.beats = peaks.map(p => p / sampleRate);
    this.bpm = bpmResult.bpm;
    this.confidence = bpmResult.confidence;

    return {
      bpm: this.bpm,
      beats: this.beats,
      confidence: this.confidence
    };
  }

  /**
   * Detect peaks in the audio data
   */
  _detectPeaks(data, sampleRate) {
    const peaks = [];
    const windowSize = Math.floor(sampleRate * 0.05); // 50ms window
    const minPeakDistance = Math.floor(sampleRate * 0.3); // Min 300ms between beats (~200 BPM max)

    // Calculate RMS energy in windows
    const energies = [];
    for (let i = 0; i < data.length - windowSize; i += windowSize) {
      let sum = 0;
      for (let j = i; j < i + windowSize; j++) {
        sum += data[j] * data[j];
      }
      energies.push(Math.sqrt(sum / windowSize));
    }

    // Calculate adaptive threshold
    const avgEnergy = energies.reduce((a, b) => a + b, 0) / energies.length;
    const threshold = avgEnergy * 1.4;

    let lastPeak = -minPeakDistance;
    for (let i = 1; i < energies.length - 1; i++) {
      const pos = i * windowSize;
      if (
        energies[i] > threshold &&
        energies[i] > energies[i - 1] &&
        energies[i] >= energies[i + 1] &&
        pos - lastPeak >= minPeakDistance
      ) {
        peaks.push(pos);
        lastPeak = pos;
      }
    }

    return peaks;
  }

  /**
   * Calculate BPM from peak intervals using histogram approach
   */
  _calculateBPM(intervals, sampleRate) {
    // Convert intervals to BPM candidates
    const bpmCandidates = intervals
      .map(interval => (60 * sampleRate) / interval)
      .filter(bpm => bpm >= 40 && bpm <= 220);

    if (bpmCandidates.length === 0) {
      return { bpm: 0, confidence: 0 };
    }

    // Create histogram with 1 BPM resolution
    const histogram = {};
    for (const bpm of bpmCandidates) {
      const rounded = Math.round(bpm);
      // Check nearby BPMs too (±2)
      for (let b = rounded - 2; b <= rounded + 2; b++) {
        histogram[b] = (histogram[b] || 0) + 1;
      }
    }

    // Find the most common BPM
    let maxCount = 0;
    let bestBPM = 0;
    for (const [bpm, count] of Object.entries(histogram)) {
      if (count > maxCount) {
        maxCount = count;
        bestBPM = parseInt(bpm);
      }
    }

    // Calculate confidence as percentage of intervals matching the best BPM
    const tolerance = 4;
    const matching = bpmCandidates.filter(
      bpm => Math.abs(bpm - bestBPM) <= tolerance
    ).length;
    const confidence = Math.round((matching / bpmCandidates.length) * 100);

    return { bpm: bestBPM, confidence };
  }

  /**
   * Get the nearest beat time to a given time
   * @param {number} time - Time in seconds
   * @returns {number} Nearest beat time in seconds
   */
  getNearestBeat(time) {
    if (!this.beats.length) return time;
    let nearest = this.beats[0];
    let minDist = Math.abs(time - nearest);
    for (const beat of this.beats) {
      const dist = Math.abs(time - beat);
      if (dist < minDist) {
        minDist = dist;
        nearest = beat;
      }
    }
    return nearest;
  }

  /**
   * Generate beat positions from BPM (for visualization)
   * @param {number} duration - Total duration in seconds
   * @returns {number[]} Array of beat times in seconds
   */
  generateBeatGrid(duration) {
    if (!this.bpm || this.bpm === 0) return [];
    const interval = 60 / this.bpm;
    // Find the offset from first detected beat
    const offset = this.beats.length > 0 ? this.beats[0] % interval : 0;
    const grid = [];
    for (let t = offset; t < duration; t += interval) {
      grid.push(t);
    }
    return grid;
  }
}
