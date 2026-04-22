/**
 * I18n Manager
 * Handles interface translations for ES and EN
 */

export const TRANSLATIONS = {
  es: {
    app_title: "IRXs Lyric Studio",
    welcome_title: "Bienvenido a IRXs Lyric Studio",
    welcome_subtitle: "Carga un archivo de audio para comenzar a crear letras",
    load_audio: "Cargar Audio",
    drag_hint: "O arrastra y suelta un archivo aquí",
    drop_zone_text: "Arrastra un archivo de audio o .lyric aquí",
    btn_audio: "Audio",
    btn_import_lyric: "Importar",
    btn_import_srt: "Importar SRT",
    btn_export_lyric: "Exportar .lyric",
    btn_export_srt: "Exportar .srt",
    btn_save: "Guardar Proyecto",
    btn_load: "Cargar Proyecto",
    label_sections: "Secciones",
    btn_add_section: "Sección",
    btn_add: "Añadir",
    btn_fix_overlaps: "Fix Overlaps",
    btn_auto_detect: "Auto-detect",
    btn_snap_bpm: "Snap BPM",
    btn_magnetic: "Magnético",
    btn_undo: "Deshacer",
    placeholder_lyrics: "Escribe la letra y presiona Enter para añadir...",
    karaoke_empty: "Lyric Player...",
    full_frame: "Full Frame",
    volume: "VOLUMEN",
    speed: "VELOCIDAD",
    zoom: "ZOOM",
    toast_audio_loaded: "Audio cargado correctamente",
    toast_srt_imported: "Archivo importado",
    toast_project_saved: "Proyecto guardado",
    toast_section_deleted: "Sección eliminada",
    toast_section_moved: "Sección y letras movidas",
    copy_modal_title: "Copiar Sección",
    copy_modal_source: "Sección origen:",
    copy_modal_target: "Tiempo destino:",
    copy_modal_btn: "Confirmar Copia",
    sec_intro: "Intro",
    sec_verso: "Verso",
    sec_precoro: "Precoro",
    sec_coro: "Coro",
    sec_puente: "Puente",
    sec_outro: "Outro",
    sec_adlib: "Ad-lib",
    sec_custom: "Custom",
    section_type: "Tipo de sección",
    custom_name: "Nombre personalizado",
  },
  en: {
    app_title: "IRXs Lyric Studio",
    welcome_title: "Welcome to IRXs Lyric Studio",
    welcome_subtitle: "Load an audio file to start creating lyrics",
    load_audio: "Load Audio",
    drag_hint: "Or drag and drop a file here",
    drop_zone_text: "Drag an audio or .lyric file here",
    btn_audio: "Audio",
    btn_import_lyric: "Import",
    btn_import_srt: "Import SRT",
    btn_export_lyric: "Export .lyric",
    btn_export_srt: "Export .srt",
    btn_save: "Save Project",
    btn_load: "Load Project",
    label_sections: "Sections",
    btn_add_section: "Section",
    btn_add: "Add",
    btn_fix_overlaps: "Fix Overlaps",
    btn_auto_detect: "Auto-detect",
    btn_snap_bpm: "Snap BPM",
    btn_magnetic: "Magnetic",
    btn_undo: "Undo",
    placeholder_lyrics: "Type lyrics and press Enter to add...",
    karaoke_empty: "Lyric Player...",
    full_frame: "Full Frame",
    volume: "VOLUME",
    speed: "SPEED",
    zoom: "ZOOM",
    toast_audio_loaded: "Audio loaded successfully",
    toast_srt_imported: "File imported",
    toast_project_saved: "Project saved",
    toast_section_deleted: "Section deleted",
    toast_section_moved: "Section and lyrics moved",
    copy_modal_title: "Copy Section",
    copy_modal_source: "Source section:",
    copy_modal_target: "Target time:",
    copy_modal_btn: "Confirm Copy",
    sec_intro: "Intro",
    sec_verso: "Verse",
    sec_precoro: "Pre-chorus",
    sec_coro: "Chorus",
    sec_puente: "Bridge",
    sec_outro: "Outro",
    sec_adlib: "Ad-lib",
    sec_custom: "Custom",
    section_type: "Section Type",
    custom_name: "Custom Name",
  }
};

export class I18n {
  constructor() {
    this.lang = localStorage.getItem('app_lang') || 'es';
  }

  setLanguage(lang) {
    this.lang = lang;
    localStorage.setItem('app_lang', lang);
    this.apply();
  }

  t(key) {
    return TRANSLATIONS[this.lang][key] || key;
  }

  apply() {
    document.title = this.t('app_title');
    
    // Update elements with data-t attribute
    document.querySelectorAll('[data-t]').forEach(el => {
      const key = el.dataset.t;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = this.t(key);
      } else {
        // Preserving icons if any
        const icon = el.querySelector('svg');
        el.textContent = this.t(key);
        if (icon) el.prepend(icon);
      }
    });

    // Update tooltips/titles
    document.querySelectorAll('[data-t-title]').forEach(el => {
      el.title = this.t(el.dataset.tTitle);
    });

    // Specific updates for complex structures
    const welcomeTitle = document.querySelector('#welcome-screen h2');
    if (welcomeTitle) welcomeTitle.textContent = this.t('welcome_title');
    
    const welcomeSub = document.querySelector('#welcome-screen p');
    if (welcomeSub) welcomeSub.textContent = this.t('welcome_subtitle');

    const dropZoneText = document.querySelector('#drop-zone p');
    if (dropZoneText) dropZoneText.textContent = this.t('drop_zone_text');
  }
}

// Singleton instance for use across modules
const i18n = new I18n();
export default i18n;
