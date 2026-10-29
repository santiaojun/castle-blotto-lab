// Castle drawing traced from the project's castle artwork (one tower, battlements, window, door).
// viewBox units: tower spans x 2..98, y 2..107; flags rise above y = 2.

const OUTLINE = 'M2.2 2.4 H16.6 V11.4 H32 V2.4 H43.3 V11.4 H56.7 V2.4 H68.3 V11.4 H83.6 V2.4 H97.9 V20.9 L83 30.1 L93.8 106.6 H4.7 L16.6 30.1 L2.2 20.9 Z';
const WINDOW = '<rect x="44.1" y="41.8" width="11.3" height="17.8" class="castle-ink"/>';
const DOOR = '<path d="M41.6 106.6 V91 a7.9 7.9 0 0 1 15.8 0 V106.6 Z" class="castle-ink"/>';
const NOTCHES = [[16.6, 32], [43.3, 56.7], [68.3, 83.6]];
const SLOTS = { 1: [50], 2: [24.3, 76], 3: [24.3, 50, 76], 4: [9.4, 37.6, 62.5, 90.9], 5: [7, 28, 50, 72, 93] };
let uid = 0;

function flagsSVG(k) {
  const xs = SLOTS[k] || [];
  const w = k >= 4 ? 10 : 14, h = k >= 4 ? 7 : 9;
  return xs.map((x) => {
    const base = NOTCHES.some(([a, b]) => x > a && x < b) ? 11.4 : 2.4;
    const top = -20;
    return `<line x1="${x}" y1="${base}" x2="${x}" y2="${top}" class="castle-pole"/>`
      + `<path d="M${x} ${top} L${x + w} ${top + h / 2} L${x} ${top + h} Z" class="castle-flag"/>`;
  }).join('');
}

/**
 * @param {object} o
 * @param {number} o.flags  number of flags (castle value)
 * @param {string} [o.fill] CSS color for the whole tower (winner color); default is the idle color
 * @param {number} [o.level] 0..1, fill the tower from the bottom like a gauge (troop share)
 * @param {string} [o.levelFill] CSS color for the gauge
 * @param {string} [o.label] accessible label
 */
export function castleSVG({ flags = 1, fill, level, levelFill = 'var(--you)', label = '' } = {}) {
  const id = 'cc' + (++uid);
  const lv = Math.max(0, Math.min(1, level ?? 0));
  const y = 106.6 - lv * 104.2;
  const gauge = level == null ? '' :
    `<clipPath id="${id}"><path d="${OUTLINE}"/></clipPath><rect x="0" y="${y}" width="100" height="${107 - y}" fill="${levelFill}" clip-path="url(#${id})" class="castle-level"/>`;
  return `<svg class="castle" viewBox="-3 -24 106 134" role="img" aria-label="${label}">`
    + flagsSVG(flags)
    + `<path d="${OUTLINE}" class="castle-body" style="${fill ? `fill:${fill}` : ''}"/>`
    + gauge + WINDOW + DOOR
    + `<path d="${OUTLINE}" class="castle-line"/>`
    + `</svg>`;
}
