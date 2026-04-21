/**
 * Subtitle Manager
 * Handles CRUD operations, overlap detection, sorting, and sync
 */

import { msToSrtTime, msToDisplay } from './srtParser.js';

let _nextId = 1;

export class SubtitleManager {
  constructor() {
    /** @type {Array<{id: number, startTime: number, endTime: number, text: string}>} */
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
      id: _nextId++
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
  add(startTime, endTime, text = '') {
    this._saveState();
    const id = _nextId++;
    const sub = { id, startTime, endTime, text };
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
  getAtTime(timeMs) {
    return this.subtitles.find(
      s => timeMs >= s.startTime && timeMs <= s.endTime
    ) || null;
  }

  /**
   * Get the index of a subtitle by id
   */
  indexOf(id) {
    return this.subtitles.findIndex(s => s.id === id);
  }

  /**
   * Get next subtitle after the given id
   */
  getNext(id) {
    const idx = this.indexOf(id);
    if (idx === -1 || idx >= this.subtitles.length - 1) return null;
    return this.subtitles[idx + 1];
  }

  /**
   * Get previous subtitle before the given id
   */
  getPrev(id) {
    const idx = this.indexOf(id);
    if (idx <= 0) return null;
    return this.subtitles[idx - 1];
  }

  /**
   * Detect overlapping subtitles
   * @returns {Array<{index: number, overlapWith: number, overlapMs: number}>}
   */
  detectOverlaps() {
    const overlaps = [];
    for (let i = 1; i < this.subtitles.length; i++) {
      if (this.subtitles[i].startTime < this.subtitles[i - 1].endTime) {
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
      if (this.subtitles[i].startTime < this.subtitles[i - 1].endTime) {
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
    const words = sub.text.split(' ');
    const midWord = Math.ceil(words.length / 2);
    const text1 = words.slice(0, midWord).join(' ');
    const text2 = words.slice(midWord).join(' ');

    sub.endTime = splitTimeMs;
    sub.text = text1;

    const newSub = {
      id: _nextId++,
      startTime: splitTimeMs,
      endTime: sub.endTime + (splitTimeMs - sub.startTime),
      text: text2
    };
    // Fix: use the original end time for the second part
    const originalEnd = sub.endTime + (splitTimeMs - sub.startTime);
    newSub.endTime = originalEnd > splitTimeMs ? originalEnd : splitTimeMs + 2000;

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
    const merged = {
      ...sub1,
      endTime: Math.max(sub1.endTime, sub2.endTime),
      text: `${sub1.text}\n${sub2.text}`.trim()
    };
    Object.assign(sub1, merged);
    this.remove(sub2.id);
    // remove already calls _notify
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
