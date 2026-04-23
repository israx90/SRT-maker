/**
 * Section Manager
 * Manages song sections (CORO, VERSO, PRECORO, etc.)
 * Sections are visual/organizational markers that also export as SRT entries.
 */

let _sectionNextId = 1;

/** Predefined section types with default colors */
export const SECTION_TYPES = [
  { type: 'INTRO',    label: 'Intro',    color: '#64748b' }, // Slate
  { type: 'VERSO',    label: 'Verso',    color: '#10b981' }, // Emerald
  { type: 'PRECORO',  label: 'Precoro',  color: '#f59e0b' }, // Amber
  { type: 'CORO',     label: 'Coro',     color: '#f43f5e' }, // Rose
  { type: 'PUENTE',   label: 'Puente',   color: '#8b5cf6' }, // Violet
  { type: 'OUTRO',    label: 'Outro',    color: '#475569' }, // Darker Slate
  { type: 'ADLIB',    label: 'Ad-lib',   color: '#06b6d4' }, // Cyan
  { type: 'CUSTOM',   label: 'Custom',   color: '#eab308' }, // Yellow
];

export class SectionManager {
  constructor() {
    /** @type {Array<{id: number, type: string, name: string, startTime: number, endTime: number, color: string}>} */
    this.sections = [];
    this.onChange = null;
  }

  /**
   * Get info for a section type
   */
  static getTypeInfo(type) {
    return SECTION_TYPES.find(t => t.type === type) || SECTION_TYPES[SECTION_TYPES.length - 1];
  }

  /**
   * Notify listeners
   */
  _notify() {
    if (this.onChange) this.onChange(this.sections);
  }

  /**
   * Sort sections by start time
   */
  _sort() {
    this.sections.sort((a, b) => a.startTime - b.startTime);
  }

  /**
   * Add a new section
   */
  add(type, startTime, endTime, customName = '') {
    const typeInfo = SectionManager.getTypeInfo(type);
    const id = _sectionNextId++;
    
    let color = typeInfo.color;
    if (type === 'CUSTOM') {
      const customColors = ['#f43f5e', '#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#6366f1', '#14b8a6', '#f97316'];
      color = customColors[Math.floor(Math.random() * customColors.length)];
    }

    const section = {
      id,
      type,
      name: customName || typeInfo.label,
      startTime,
      endTime,
      color,
    };
    this.sections.push(section);
    this._sort();
    this._notify();
    return section;
  }

  /**
   * Remove a section
   */
  remove(id) {
    const idx = this.sections.findIndex(s => s.id === id);
    if (idx === -1) return false;
    this.sections.splice(idx, 1);
    this._notify();
    return true;
  }

  /**
   * Update a section
   */
  update(id, changes) {
    const section = this.sections.find(s => s.id === id);
    if (!section) return null;
    Object.assign(section, changes);
    this._sort();
    this._notify();
    return section;
  }

  /**
   * Get section by id
   */
  get(id) {
    return this.sections.find(s => s.id === id) || null;
  }

  /**
   * Get section at a given time
   */
  getAtTime(timeMs) {
    return this.sections.find(
      s => timeMs >= s.startTime && timeMs < s.endTime
    ) || null;
  }

  /**
   * Get all sections
   */
  getAll() {
    return [...this.sections].sort((a, b) => a.startTime - b.startTime);
  }

  /**
   * Get all subtitles within a section's time range
   */
  getSubtitlesInSection(sectionId, subtitleManager) {
    const section = this.get(sectionId);
    if (!section) return [];
    return subtitleManager.getAll().filter(
      sub => sub.startTime >= section.startTime && sub.endTime <= section.endTime
    );
  }

  /**
   * Copy all subtitles from a section to a target time position
   * Returns the newly created subtitles
   */
  copySectionSubtitles(sectionId, targetTimeMs, subtitleManager) {
    const section = this.get(sectionId);
    if (!section) return [];

    const subs = this.getSubtitlesInSection(sectionId, subtitleManager);
    if (subs.length === 0) return [];

    const offset = targetTimeMs - section.startTime;
    const newSubs = [];

    for (const sub of subs) {
      const newSub = subtitleManager.add(
        sub.startTime + offset,
        sub.endTime + offset,
        sub.text
      );
      newSubs.push(newSub);
    }

    // Also create a new section at the target position
    const sectionDuration = section.endTime - section.startTime;
    this.add(section.type, targetTimeMs, targetTimeMs + sectionDuration, section.name);

    return newSubs;
  }

  /**
   * Move all subtitles within a section by a given offset
   */
  moveSectionSubtitles(sectionId, offsetMs, subtitleManager) {
    const section = this.get(sectionId);
    if (!section) return;

    const subs = this.getSubtitlesInSection(sectionId, subtitleManager);
    for (const sub of subs) {
      // Use silent update to avoid firing syncRegions on every drag pixel
      subtitleManager.updateSilent(sub.id, {
        startTime: sub.startTime + offsetMs,
        endTime: sub.endTime + offsetMs
      });
    }
  }

  /**
   * Magnetic snap: adjust section boundaries to match the outermost subtitles within it.
   * The section's start snaps to the first subtitle's startTime,
   * and the section's end snaps to the last subtitle's endTime.
   * @returns {{ snapped: boolean, startDelta: number, endDelta: number }}
   */
  magneticSnapSection(sectionId, subtitleManager) {
    const section = this.get(sectionId);
    if (!section) return { snapped: false, startDelta: 0, endDelta: 0 };

    // Find all subtitles that fall within or overlap with this section
    const subs = subtitleManager.getAll().filter(
      sub => sub.startTime >= section.startTime - 2000 && sub.endTime <= section.endTime + 2000
        && sub.startTime < section.endTime && sub.endTime > section.startTime
    );

    if (subs.length === 0) return { snapped: false, startDelta: 0, endDelta: 0 };

    const firstSub = subs[0]; // Already sorted by startTime
    const lastSub = subs[subs.length - 1];

    const startDelta = firstSub.startTime - section.startTime;
    const endDelta = lastSub.endTime - section.endTime;

    section.startTime = firstSub.startTime;
    section.endTime = lastSub.endTime;

    this._sort();
    this._notify();

    return { snapped: true, startDelta, endDelta };
  }

  /**
   * Load sections from saved data
   */
  load(sections) {
    this.sections = sections.map(s => ({
      ...s,
      id: _sectionNextId++,
    }));
    this._sort();
    this._notify();
  }

  /**
   * Clear all sections
   */
  clear() {
    this.sections = [];
    this._notify();
  }

  /**
   * Get count
   */
  get count() {
    return this.sections.length;
  }
}
