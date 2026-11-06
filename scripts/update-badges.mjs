#!/usr/bin/env node
/**
 * Generates every badge used by README.md.
 *
 * Why this exists: the badges used to come from shields.io. Its `dynamic/json`
 * endpoints call the upstream API before they answer, so the response often
 * takes longer than GitHub's camo proxy is willing to wait: camo then serves
 * "Error Fetching Resource" and the badge disappears. Two simple-icons slugs
 * used by the header badges had also been retired, so those icons silently
 * vanished as well.
 *
 * Owning the SVGs keeps the whole header independent of shields and camo, and
 * the download counts stay live because `Update download badges` runs this
 * script once a day. Badges are plain `for-the-badge` geometry: height 28,
 * bold 10px Verdana, uppercase, 12px padding per segment.
 *
 * Manual refresh: `node scripts/update-badges.mjs`
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'assets', 'readme');

/** Glyph widths for bold 10px Verdana, measured with canvas measureText. */
const GLYPH_WIDTH = {
  A: 7.764, B: 7.617, C: 7.236, D: 8.301, E: 6.831, F: 6.504, G: 8.11, H: 8.374,
  I: 5.459, J: 5.552, K: 7.71, L: 6.372, M: 9.478, N: 8.467, O: 8.501, P: 7.329,
  Q: 8.501, R: 7.822, S: 7.104, T: 6.816, U: 8.12, V: 7.637, W: 11.284, X: 7.637,
  Y: 7.368, Z: 6.919,
  0: 7.109, 1: 7.109, 2: 7.109, 3: 7.109, 4: 7.109,
  5: 7.109, 6: 7.109, 7: 7.109, 8: 7.109, 9: 7.109,
  ' ': 3.418, ',': 3.613, '.': 3.613,
};
const FALLBACK_GLYPH_WIDTH = 7.5;

/** shields.io `for-the-badge` draws the same glyphs 1.16x wider for its spacing. */
const STRETCH = 1.16;
/** Horizontal padding of a segment without an icon. */
const PADDING = 12;
/** Left padding, icon box and gap before the text of a segment with an icon. */
const ICON_LEFT = 9;
const ICON_SIZE = 14;
const ICON_GAP = 9;
const HEIGHT = 28;
const LABEL_COLOR = '#555555';
const TEXT_COLOR = '#ffffff';
const TEXT_FONT = 'Verdana,Geneva,DejaVu Sans,sans-serif';

/** Icon glyphs on a 24x24 grid, drawn white. LinkedIn is pinned to the last
 *  simple-icons release that still shipped the brand. */
const ICONS = {
  vercel: 'm12 1.608 12 20.784H0Z',
  gmail:
    'M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z',
  googledocs:
    'M14.727 6.727H14V0H4.91c-.905 0-1.637.732-1.637 1.636v20.728c0 .904.732 1.636 1.636 1.636h14.182c.904 0 1.636-.732 1.636-1.636V6.727h-6zm-.545 10.455H7.09v-1.364h7.09v1.364zm2.727-3.273H7.091v-1.364h9.818v1.364zm0-3.273H7.091V9.273h9.818v1.363zM14.727 6h6l-6-6v6z',
  linkedin:
    'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
};

const BADGES = [
  {
    file: 'portfolio.svg',
    name: 'Portfolio',
    segments: [{ text: 'PORTFOLIO', color: '#6e56cf', icon: 'vercel' }],
  },
  {
    file: 'resume.svg',
    name: 'Resume',
    segments: [{ text: 'RESUME', color: '#1f6feb', icon: 'googledocs' }],
  },
  {
    file: 'email.svg',
    name: 'Email',
    segments: [{ text: 'EMAIL', color: '#cd4433', icon: 'gmail' }],
  },
  {
    file: 'linkedin.svg',
    name: 'LinkedIn',
    segments: [{ text: 'LINKEDIN', color: '#0a66c2', icon: 'linkedin' }],
  },
  {
    file: 'open-vsx-downloads.svg',
    label: 'OPEN VSX',
    name: 'Open VSX',
    color: '#2b6cb0',
    url: 'https://open-vsx.org/api/MaxGB23/funky-theme-vscode',
    read: (json) => json.downloadCount,
  },
  {
    file: 'zed-downloads.svg',
    label: 'ZED',
    name: 'Zed',
    color: '#6e56cf',
    // Every entry of `data` repeats the extension total, so take the largest
    // instead of relying on array order.
    url: 'https://api.zed.dev/extensions/funky-theme',
    read: (json) =>
      Array.isArray(json.data) && json.data.length > 0
        ? Math.max(...json.data.map((entry) => Number(entry.download_count) || 0))
        : undefined,
  },
];

/** WCAG AA minimum for small text: the badge labels are 10px bold. */
const MIN_CONTRAST = 4.5;

const channelLuminance = (hex, offset) => {
  const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};
const relativeLuminance = (hex) =>
  0.2126 * channelLuminance(hex, 1) +
  0.7152 * channelLuminance(hex, 3) +
  0.0722 * channelLuminance(hex, 5);

function contrastRatio(colorA, colorB) {
  const [lighter, darker] = [relativeLuminance(colorA), relativeLuminance(colorB)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

const round = (value) => Math.round(value * 100) / 100;
const textWidth = (text) =>
  [...text].reduce((sum, glyph) => sum + (GLYPH_WIDTH[glyph] ?? FALLBACK_GLYPH_WIDTH), 0) * STRETCH;
const formatCount = (value) => value.toLocaleString('en-US');
const iconBlock = (segment) => (segment.icon ? ICON_LEFT + ICON_SIZE + ICON_GAP : PADDING);

function renderBadge(file, segments, ariaLabel) {
  const rects = [];
  const shapes = [];
  let x = 0;

  for (const segment of segments) {
    const ratio = contrastRatio(TEXT_COLOR, segment.color);
    if (ratio < MIN_CONTRAST) {
      throw new Error(
        `${file}: text on ${segment.color} reaches only ${ratio.toFixed(2)}:1, below the ${MIN_CONTRAST}:1 minimum`,
      );
    }
    const width = round(iconBlock(segment) + textWidth(segment.text) + PADDING);
    rects.push(`<rect x="${round(x)}" width="${width}" height="${HEIGHT}" fill="${segment.color}"/>`);

    // The <text> nodes are scaled by 0.1, so every local coordinate (x, y and
    // textLength) is expressed in tenths of a pixel.
    if (segment.icon) {
      const iconPath = ICONS[segment.icon];
      if (!iconPath) throw new Error(`${file}: unknown icon ${segment.icon}`);
      shapes.push(
        `<path d="${iconPath}" fill="${TEXT_COLOR}" transform="translate(${round(x + ICON_LEFT)},7) scale(${round((ICON_SIZE / 24) * 10000) / 10000})"/>`,
      );
    }
    const centerX = x + iconBlock(segment) + textWidth(segment.text) / 2;
    shapes.push(
      `<text transform="scale(.1)" x="${round(centerX * 10)}" y="${round(17.5 * 10)}" textLength="${round(textWidth(segment.text) * 10)}" font-weight="bold">${segment.text}</text>`,
    );

    x += width;
  }

  const totalWidth = round(x);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${HEIGHT}" role="img" aria-label="${ariaLabel}">`,
    `<title>${ariaLabel}</title>`,
    `<g shape-rendering="crispEdges">${rects.join('')}</g>`,
    `<g fill="${TEXT_COLOR}" text-anchor="middle" font-family="${TEXT_FONT}" text-rendering="geometricPrecision" font-size="100">${shapes.join('')}</g>`,
    '</svg>',
    '',
  ].join('\n');
}

async function fetchJson(url, attempt = 1) {
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'MaxGB23/MaxGB23 badge updater' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (attempt >= 3) throw new Error(`${url}: ${error.message}`);
    await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    return fetchJson(url, attempt + 1);
  }
}

async function readExisting(file) {
  try {
    return await readFile(join(OUT_DIR, file), 'utf8');
  } catch {
    return null;
  }
}

async function segmentsFor(badge) {
  if (!badge.url) return badge.segments;

  const count = Number(badge.read(await fetchJson(badge.url)));
  if (!Number.isFinite(count) || count < 0) {
    throw new Error('upstream returned no usable download count');
  }
  return [
    { text: badge.label, color: LABEL_COLOR },
    { text: `${formatCount(count)} DOWNLOADS`, color: badge.color },
  ];
}

await mkdir(OUT_DIR, { recursive: true });

const failures = [];
for (const badge of BADGES) {
  try {
    const segments = await segmentsFor(badge);
    const value = segments.length > 1 ? ': ' + segments[1].text.toLowerCase() : '';
    const svg = renderBadge(badge.file, segments, `${badge.name}${value}`);
    const previous = await readExisting(badge.file);
    if (previous === svg) {
      console.log(`unchanged  ${badge.file}`);
      continue;
    }
    await writeFile(join(OUT_DIR, badge.file), svg, 'utf8');
    console.log(`updated    ${badge.file}`);
  } catch (error) {
    failures.push(`${badge.file}: ${error.message}`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAILED     ${failure}`);
  console.error('Kept the existing SVG for every failed badge.');
  process.exit(1);
}
