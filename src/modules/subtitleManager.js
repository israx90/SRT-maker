/**
 * Subtitle Manager
 * Handles CRUD operations, overlap detection, sorting, and sync
 */


let _nextId = 1;

export class SubtitleManager {
  constructor() {
    /** @type {Array<{id: number, startTime: number, endTime: number, text: string, layer: number}>} */
    this.subtitles = [];
    this.undoStack = [];
    this.maxUndo = 50;
    this.onChange = null;
  }

  /**
   * Save current state for undo
   */
  _saveState() {
    this.undoStack.push(JSON.stringify(this.subtitles));
    if (this.undoStack.length > this.maxUndo) {
      this.undoStack.shift();
    }
  }

  /**
   * Undo last action
   */
  undo() {
    if (this.undoStack.length === 0) return false;
    const prev = JSON.parse(this.undoStack.pop());
    this.subtitles = prev;
    this._notify();
    return true;
  }

  /**
   * Notify listeners of changes
   */
  _notify() {
    if (this.onChange) this.onChange(this.subtitles);
  }

  /**
   * Load subtitles from parsed SRT
   */
  load(subtitles) {
    this._saveState();
    this.subtitles = subtitles.map(s => ({
      ...s,
      id: _nextId++,
      layer: s.layer || 0
    }));
    this._sort();
    this._notify();
  }

  /**
   * Clear all subtitles
   */
  clear() {
    this._saveState();
    this.subtitles = [];
    this._notify();
  }

  /**
   * Sort subtitles by start time
   */
  _sort() {
    this.subtitles.sort((a, b) => a.startTime - b.startTime);
  }

  /**
   * Add a new subtitle
   */
  add(startTime, endTime, text = '', layer = 0) {
    this._saveState();
    const id = _nextId++;
    const sub = { id, startTime, endTime, text, layer };
    this.subtitles.push(sub);
    this._sort();
    this._notify();
    return sub;
  }

  /**
   * Update a subtitle's properties
   */
  update(id, changes) {
    this._saveState();
    const sub = this.subtitles.find(s => s.id === id);
    if (!sub) return null;
    Object.assign(sub, changes);
    this._sort();
    this._notify();
    return sub;
  }

  /**
   * Update a subtitle without triggering onChange (used when syncing from waveform drag)
   */
  updateSilent(id, changes) {
    const sub = this.subtitles.find(s => s.id === id);
    if (!sub) return null;
    Object.assign(sub, changes);
    this._sort();
    return sub;
  }

  /**
   * Remove a subtitle
   */
  remove(id) {
    this._saveState();
    const index = this.subtitles.findIndex(s => s.id === id);
    if (index === -1) return false;
    this.subtitles.splice(index, 1);
    this._notify();
    return true;
  }

  /**
   * Get subtitle by id
   */
  get(id) {
    return this.subtitles.find(s => s.id === id) || null;
  }

  /**
   * Get subtitle at a given time
   */
  getAtTime(timeMs, layer = 0) {
    return this.subtitles.find(
      s => s.layer === layer && timeMs >= s.startTime && timeMs <= s.endTime
    ) || null;
  }

  /**
   * Get ALL subtitles active at a given time (across all layers)
   * @returns {Array} Array of subtitle objects active at timeMs
   */
  getAllAtTime(timeMs) {
    return this.subtitles.filter(
      s => timeMs >= s.startTime && timeMs <= s.endTime
    );
  }

  /**
   * Get the index of a subtitle by id
   */
  indexOf(id) {
    return this.subtitles.findIndex(s => s.id === id);
  }

  /**
   * Get next subtitle after the given id on the same layer
   */
  getNext(id) {
    const sub = this.get(id);
    if (!sub) return null;
    const layerSubs = this.subtitles.filter(s => s.layer === sub.layer);
    const idx = layerSubs.findIndex(s => s.id === id);
    if (idx === -1 || idx >= layerSubs.length - 1) return null;
    return layerSubs[idx + 1];
  }

  /**
   * Get previous subtitle before the given id on the same layer
   */
  getPrev(id) {
    const sub = this.get(id);
    if (!sub) return null;
    const layerSubs = this.subtitles.filter(s => s.layer === sub.layer);
    const idx = layerSubs.findIndex(s => s.id === id);
    if (idx <= 0) return null;
    return layerSubs[idx - 1];
  }

  /**
   * Detect overlapping subtitles
   * @returns {Array<{index: number, overlapWith: number, overlapMs: number}>}
   */
  detectOverlaps() {
    const overlaps = [];
    for (let i = 1; i < this.subtitles.length; i++) {
      // Only detect overlaps within the same layer
      if (this.subtitles[i].layer === this.subtitles[i - 1].layer &&
          this.subtitles[i].startTime < this.subtitles[i - 1].endTime) {
        overlaps.push({
          index: i,
          overlapWith: i - 1,
          overlapMs: this.subtitles[i - 1].endTime - this.subtitles[i].startTime
        });
      }
    }
    return overlaps;
  }

  /**
   * Fix all overlapping subtitles by adjusting end times
   */
  fixOverlaps(gapMs = 10) {
    this._saveState();
    this._sort();
    let fixed = 0;
    for (let i = 1; i < this.subtitles.length; i++) {
      // Only fix overlaps within the same layer
      if (this.subtitles[i].layer === this.subtitles[i - 1].layer &&
          this.subtitles[i].startTime < this.subtitles[i - 1].endTime) {
        this.subtitles[i - 1].endTime = this.subtitles[i].startTime - gapMs;
        if (this.subtitles[i - 1].endTime <= this.subtitles[i - 1].startTime) {
          this.subtitles[i - 1].endTime = this.subtitles[i - 1].startTime + 100;
        }
        fixed++;
      }
    }
    this._notify();
    return fixed;
  }

  /**
   * Split a subtitle at a given time
   */
  split(id, splitTimeMs) {
    const sub = this.get(id);
    if (!sub) return null;
    if (splitTimeMs <= sub.startTime || splitTimeMs >= sub.endTime) return null;

    this._saveState();
    const originalEndTime = sub.endTime;
    const words = sub.text.split(' ');
    const midWord = Math.ceil(words.length / 2);
    const text1 = words.slice(0, midWord).join(' ');
    const text2 = words.slice(midWord).join(' ');

    sub.endTime = splitTimeMs;
    sub.text = text1;

    const newSub = {
      id: _nextId++,
      startTime: splitTimeMs,
      endTime: originalEndTime,
      text: text2,
      layer: sub.layer || 0,
    };

    this.subtitles.push(newSub);
    this._sort();
    this._notify();
    return [sub, newSub];
  }

  /**
   * Merge two consecutive subtitles
   */
  merge(id1, id2) {
    const sub1 = this.get(id1);
    const sub2 = this.get(id2);
    if (!sub1 || !sub2) return null;

    this._saveState();
    sub1.endTime = Math.max(sub1.endTime, sub2.endTime);
    sub1.text = `${sub1.text}\n${sub2.text}`.trim();

    // Direct splice — avoids a second _saveState() call from remove()
    const idx = this.subtitles.findIndex(s => s.id === sub2.id);
    if (idx !== -1) this.subtitles.splice(idx, 1);

    this._notify();
    return sub1;
  }

  /**
   * Shift all subtitles by a time offset
   */
  shiftAll(offsetMs) {
    this._saveState();
    for (const sub of this.subtitles) {
      sub.startTime = Math.max(0, sub.startTime + offsetMs);
      sub.endTime = Math.max(sub.startTime + 100, sub.endTime + offsetMs);
    }
    this._notify();
  }

  /**
   * Get all subtitles as array (for serialization)
   */
  getAll() {
    return [...this.subtitles].sort((a, b) => a.startTime - b.startTime);
  }

  /**
   * Get total count
   */
  get count() {
    return this.subtitles.length;
  }
}
