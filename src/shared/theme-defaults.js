/**
 * Shared theme defaults — single source of truth for all UI colors.
 *
 * Pure-value module with no Node or DOM dependencies so it can be loaded
 * in both the renderer (<script> tag) and the backend (require()).
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();          // Node / backend
  } else {
    root.ThemeDefaults = factory();       // Browser / renderer
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ── Core palette ──────────────────────────────────────────── */

  const colors = {

    /* Backgrounds */
    bg: {
      primary:    '#1a1a1a',
      secondary:  '#242424',
      tertiary:   '#2e2e2e',
      input:      '#1e1e1e',
      hover:      '#383838',
    },

    /* Text */
    text: {
      primary:    '#e0e0e0',
      secondary:  '#999999',
      muted:      '#666666',
      gold:       '#b8860b',
      updateGreen:'#4caf50',
      darkGreen:  '#08120b',
    },

    /* Accent */
    accent: {
      primary:    '#2ecc71',
      secondary:  '#CA50F7',
      hover:      '#27ae60',
      gold:       '#FFCB05',
      orange:     '#e8952e',
      coral:      '#ff8c5c',
    },

    /* Status */
    status: {
      success:    '#48ca48',
      successDim: '#2d7a2d',
      warning:    '#f6a14f',
      error:      '#ff5252',
      errorLight: '#e04545',
    },

    /* Borders */
    border: {
      default:    '#3a3a3a',
      focus:      '#2ecc71',
      subtle:     '#666666',
    },

    /* Surfaces */
    surface: {
      black:          '#000000',
      white:          '#ffffff',
      scrollbarHover: 'rgba(45, 122, 45, 0.15)',
    },

    /* Syntax highlighting (YAML/code) */
    syntax: {
      yamlKey:        '#7fbfff',
      purple:         '#c084fc',
      purpleBorder:   '#7c3aed',
      purpleHover:    '#a78bfa',
      darkGold:       '#b8860b',
    },

    /* Status backgrounds (dark tinted) */
    statusBg: {
      code:           '#2a1a3a',
      codeHover:      '#3a2a4a',
      success:        '#1a3a1a',
      successHover:   '#245224',
      error:          '#3a2020',
      errorHover:     '#4a2a2a',
      edited:         '#2d5a7a',
      warning:        '#3a3020',
    },

    /* Button backgrounds */
    button: {
      export:         '#8b4513',
      danger:         '#3a1515',
      success:        '#1a5c1a',
    },

    /* Map */
    map: {
      marker:         '#48ca48',
    },

    /* Shadows (full shadow values, not just colors) */
    shadow: {
      default:  '0 2px 8px rgba(0,0,0,0.3)',
      lg:       '0 4px 20px rgba(0,0,0,0.5)',
    },

    /* OCR highlight */
    ocrHighlight: 'rgba(202, 80, 247, 0.45)',

    /* ── Semi-transparent overlays ────────────────────────────── */

    /* White glass at various opacities (borders, separators, hover) */
    glass: {
      '02': 'rgba(255,255,255,0.02)',
      '03': 'rgba(255,255,255,0.03)',
      '04': 'rgba(255,255,255,0.04)',
      '05': 'rgba(255,255,255,0.05)',
      '06': 'rgba(255,255,255,0.06)',
      '08': 'rgba(255,255,255,0.08)',
      '12': 'rgba(255,255,255,0.12)',
      '16': 'rgba(255,255,255,0.16)',
      '20': 'rgba(255,255,255,0.20)',
    },

    /* Accent green tints */
    accentTint: {
      '06': 'rgba(46, 204, 113, 0.06)',
      '08': 'rgba(46, 204, 113, 0.08)',
      '10': 'rgba(46, 204, 113, 0.10)',
      '15': 'rgba(46, 204, 113, 0.15)',
      '20': 'rgba(46, 204, 113, 0.20)',
      '22': 'rgba(46, 204, 113, 0.22)',
    },

    /* Blue (cat-0) tints */
    blueTint: {
      '08': 'rgba(71, 158, 245, 0.08)',
      '15': 'rgba(71, 158, 245, 0.15)',
      '18': 'rgba(71, 158, 245, 0.18)',
    },

    /* Warning orange tints */
    warningTint: {
      '10': 'rgba(246, 161, 79, 0.10)',
      '12': 'rgba(246, 161, 79, 0.12)',
      '18': 'rgba(246, 161, 79, 0.18)',
      '15': 'rgba(246, 161, 79, 0.15)',
    },

    /* Error red tints */
    errorTint: {
      '08': 'rgba(255, 82, 82, 0.08)',
      '12': 'rgba(255, 82, 82, 0.12)',
      '35': 'rgba(255, 82, 82, 0.35)',
    },

    /* Success-dim green tint */
    successDimTint: {
      '15': 'rgba(45, 122, 45, 0.15)',
    },

    /* Black overlays / dimming */
    dim: {
      '18': 'rgba(0,0,0,0.18)',
      '28': 'rgba(0,0,0,0.28)',
      '50': 'rgba(0,0,0,0.50)',
      '60': 'rgba(0,0,0,0.60)',
      '85': 'rgba(0,0,0,0.85)',
    },
  };

  /* ── User-configurable defaults ────────────────────────────── */

  const settings = {
    rowColorOdd:  '#2f2f2f',
    rowColorEven: '#242424',
    catColors: {
      cat0:    '#479EF5',
      cat1:    '#CA50F7',
      cat2:    '#48CA48',
      cat3:    '#A0A220',
      cat4:    '#FF5C5C',
      cat5:    '#7fffff',
      cat6:    '#ffff7f',
      catMisc: '#888888',
    },
  };

  /* ── Category color labels (for settings UI) ───────────────── */

  const categoryLabels = [
    ['cat0', 'Geography'],
    ['cat1', 'Taxonomy'],
    ['cat2', 'Collecting'],
    ['cat3', 'Locality'],
    ['cat4', 'Cat 5'],
    ['cat5', 'Cat 6'],
    ['cat6', 'Cat 7'],
    ['catMisc', 'Misc'],
  ];

  return { colors, settings, categoryLabels };
});
