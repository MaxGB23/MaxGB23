#!/usr/bin/env node
/**
 * Regenerates the download badges used by README.md.
 *
 * Why this exists: the previous badges were shields.io `dynamic/json` endpoints.
 * Shields has to call the upstream API before it answers, so the response often
 * takes longer than GitHub's camo proxy is willing to wait. Camo then answers
 * with "Error Fetching Resource" and the badge disappears from the README.
 *
 * The SVGs below are repository-owned copies in the same visual style as the
 * shields `for-the-badge` badges around them, so rendering depends on nothing
 * but raw.githubusercontent.com. Run this script to refresh the numbers; the
 * `Update download badges` workflow runs it once a day.
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
/** Horizontal padding per badge segment. */
const PADDING = 12;
const HEIGHT = 28;
const LABEL_COLOR = '#555555';
const textFont = 'Verdana,Geneva,DejaVu Sans,sans-serif';

const BADGES = [
  {
    file: 'open-vsx-downloads.svg',
    label: 'OPEN VSX',
    color: '#97ca00',
    url: 'https://open-vsx.org/api/MaxGB23/funky-theme-vscode',
    read: (json) => json.downloadCount,
  },
  {
    file: 'zed-downloads.svg',
    label: 'ZED',
    color: '#8b5cf6',
    // Every entry of `data` repeats the extension total, so take the largest
    // instead of relying on array order.
    url: 'https://api.zed.dev/extensions/funky-theme',
    read: (json) =>
      Array.isArray(json.data) && json.data.length > 0
        ? Math.max(...json.data.map((entry) => Number(entry.download_count) || 0))
        : undefined,
  },
];

const round = (value) => Math.round(value * 100) / 100;
const textWidth = (text) => [...text].reduce((sum, glyph) => sum + (GLYPH_WIDTH[glyph] ?? FALLBACK_GLYPH_WIDTH), 0) * STRETCH;
const formatCount = (value) => value.toLocaleString('en-US');

function renderBadge({ label, color }, count) {
  const labelText = label;
  const valueText = `${formatCount(count)} DOWNLOADS`;
  const labelWidth = round(textWidth(labelText) + PADDING * 2);
  const valueWidth = round(textWidth(valueText) + PADDING * 2);
  const totalWidth = round(labelWidth + valueWidth);
  const aria = `${labelText}: ${valueText}`;
  // The <text> nodes are scaled by 0.1, so every local coordinate (x, y and
  // textLength) is expressed in tenths of a pixel.
  const scaled = (pixels) => round(pixels * 10);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${HEIGHT}" role="img" aria-label="${aria}">`,
    `<title>${aria}</title>`,
    '<g shape-rendering="crispEdges">',
    `<rect width="${labelWidth}" height="${HEIGHT}" fill="${LABEL_COLOR}"/>`,
    `<rect x="${labelWidth}" width="${valueWidth}" height="${HEIGHT}" fill="${color}"/>`,
    '</g>',
    `<g fill="#fff" text-anchor="middle" font-family="${textFont}" text-rendering="geometricPrecision" font-size="100">`,
    `<text transform="scale(.1)" x="${scaled(labelWidth / 2)}" y="${scaled(17.5)}" textLength="${scaled(textWidth(labelText))}" font-weight="bold">${labelText}</text>`,
    `<text transform="scale(.1)" x="${scaled(labelWidth + valueWidth / 2)}" y="${scaled(17.5)}" textLength="${scaled(textWidth(valueText))}" font-weight="bold">${valueText}</text>`,
    '</g>',
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

await mkdir(OUT_DIR, { recursive: true });

const failures = [];
for (const badge of BADGES) {
  try {
    const count = Number(badge.read(await fetchJson(badge.url)));
    if (!Number.isFinite(count) || count < 0) throw new Error('upstream returned no usable download count');

    const svg = renderBadge(badge, count);
    const previous = await readExisting(badge.file);
    if (previous === svg) {
      console.log(`unchanged  ${badge.file}  ${formatCount(count)} downloads`);
      continue;
    }
    await writeFile(join(OUT_DIR, badge.file), svg, 'utf8');
    console.log(`updated    ${badge.file}  ${formatCount(count)} downloads`);
  } catch (error) {
    failures.push(`${badge.file}: ${error.message}`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAILED     ${failure}`);
  console.error('Kept the existing SVG for every failed badge.');
  process.exit(1);
}
