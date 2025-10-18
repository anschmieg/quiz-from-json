// Script to evaluate candidate difficulty colors and choose accessible pairs
// Run with: node scripts/pick-difficulty-colors.js

const candidates = {
  // make easy bluer
  easy: ['#1f3a57', '#283e4f', '#2b4a63', '#1e3a55', '#2a4658'],
  // make medium darker and greyer
  medium: ['#9a7a5a', '#8f7a66', '#8b7562', '#7f6b58', '#71614f'],
  // make hard much redder
  hard: ['#7f2626', '#8c2020', '#a22b2b', '#9b2a2a', '#b03030']
};

function hexToRgb(hex) {
  hex = hex.replace('#', '');
  const bigint = parseInt(hex, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return [r, g, b];
}

function srgbToLin(v) {
  v = v / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function lum(hex) {
  const [r, g, b] = hexToRgb(hex);
  const R = srgbToLin(r);
  const G = srgbToLin(g);
  const B = srgbToLin(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrast(hex1, hex2) {
  const L1 = lum(hex1);
  const L2 = lum(hex2);
  const hi = Math.max(L1, L2);
  const lo = Math.min(L1, L2);
  return +((hi + 0.05) / (lo + 0.05)).toFixed(2);
}

function blend(hex, ratio) {
  // blend with white by default (ratio 0..1), ratio=0 -> original, 1->white
  const [r, g, b] = hexToRgb(hex);
  const nr = Math.round(r + (255 - r) * ratio);
  const ng = Math.round(g + (255 - g) * ratio);
  const nb = Math.round(b + (255 - b) * ratio);
  return '#' + ((1 << 24) + (nr << 16) + (ng << 8) + nb).toString(16).slice(1);
}

// Preferences: easy & hard use white text, medium uses dark text (#111)
const white = '#ffffff';
const black = '#111111';

const darkPageBg = '#1a1a1a'; // dark theme page background in this project

console.log('Evaluating candidates for accessibility (contrast >= 4.5)');

const picks = {};
for (const role of Object.keys(candidates)) {
  let found = false;
  for (const c of candidates[role]) {
    const textColor = (role === 'medium' ? black : white);
    const cr = contrast(c, textColor);
    // create a dark-mode variant by blending toward white (lighten) to keep contrast under dark bg
    let darkVariant = blend(c, 0.28);
    const crDark = contrast(darkVariant, textColor);
    // also ensure the pill bg in dark mode itself is not too similar to page bg (avoid near-black)
    const bgVsPage = contrast(darkVariant, darkPageBg);

    if (cr >= 4.5 && crDark >= 4.5 && bgVsPage >= 1.5) {
      picks[role] = { light: c, dark: darkVariant, text: textColor, contrast_light: cr, contrast_dark: crDark };
      found = true;
      break;
    }
  }
  if (!found) {
    // fallback: pick middle candidate and force a stronger dark blend
    const c = candidates[role][1];
    const darkVariant = blend(c, 0.45);
    const textColor = (role === 'medium' ? black : white);
    picks[role] = { light: c, dark: darkVariant, text: textColor, contrast_light: contrast(c, textColor), contrast_dark: contrast(darkVariant, textColor) };
  }
}

console.log(JSON.stringify(picks, null, 2));

// Print summary table
for (const k of Object.keys(picks)) {
  const p = picks[k];
  console.log(`\n${k.toUpperCase()}\n  light: ${p.light} (text ${p.text}) contrast ${p.contrast_light}\n  dark:  ${p.dark} (text ${p.text}) contrast ${p.contrast_dark}`);
}
