#!/usr/bin/env node
// Footage triage: turns a folder of raw clips/photos into things an editor who
// cannot "watch" video can actually review — a timestamped contact sheet per
// clip, scene-cut times, a per-second loudness curve with candidate peaks
// (cheers, whistles, goals), and basic tech specs. Writes footage-report.md +
// footage-report.json into the output folder.
//
// Usage: node triage-footage.mjs <input-dir> <output-dir> [--tiles 30]
// Requires ffmpeg + ffprobe on PATH.

import { spawnSync } from 'node:child_process';
import { readdirSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join, extname, basename, resolve } from 'node:path';

const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.avi', '.3gp', '.webm']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic']);

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node triage-footage.mjs <input-dir> <output-dir> [--tiles 30]');
  process.exit(1);
}
const inputDir = resolve(args[0]);
const outDir = resolve(args[1]);
const tilesIdx = args.indexOf('--tiles');
const TARGET_TILES = tilesIdx > -1 ? Number(args[tilesIdx + 1]) : 30;

const sheetsDir = join(outDir, 'contact-sheets');
mkdirSync(sheetsDir, { recursive: true });

function run(cmd, cmdArgs) {
  const r = spawnSync(cmd, cmdArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status, out: r.stdout ?? '', err: r.stderr ?? '' };
}

function probe(file) {
  const r = run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]);
  if (r.code !== 0) return null;
  const j = JSON.parse(r.out);
  const v = j.streams.find((s) => s.codec_type === 'video');
  const a = j.streams.find((s) => s.codec_type === 'audio');
  // Phones store portrait video as landscape + a rotation tag; report the displayed size.
  const rot = Math.abs(
    Number(v?.tags?.rotate ?? v?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? 0),
  );
  let w = v?.width ?? 0;
  let h = v?.height ?? 0;
  if (rot === 90 || rot === 270) [w, h] = [h, w];
  const [fn, fd] = (v?.avg_frame_rate ?? '0/1').split('/').map(Number);
  return {
    duration: Number(j.format.duration ?? 0),
    width: w,
    height: h,
    orientation: h > w ? 'portrait' : h === w ? 'square' : 'landscape',
    fps: fd ? Math.round((fn / fd) * 100) / 100 : 0,
    codec: v?.codec_name ?? null,
    hasAudio: Boolean(a),
    sizeMB: Math.round((Number(j.format.size ?? 0) / 1048576) * 10) / 10,
  };
}

const fmt = (t) => {
  const m = Math.floor(t / 60);
  const s = (t - m * 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
};

// Timestamped contact sheet. Each tile is stamped with its source time so the
// reviewer can cite "clip 07 @ 0:42" without guessing tile math.
function contactSheet(file, duration, outPath) {
  const interval = Math.max(0.5, duration / TARGET_TILES);
  const tiles = Math.min(TARGET_TILES, Math.max(1, Math.floor(duration / interval)));
  const cols = 6;
  const rows = Math.ceil(tiles / cols);
  const stamp =
    "drawtext=font='Arial':text='%{pts\\:hms}':x=6:y=6:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=4";
  const base = `fps=1/${interval.toFixed(3)},scale=320:-2`;
  let r = run('ffmpeg', ['-y', '-v', 'error', '-i', file, '-vf', `${base},${stamp},tile=${cols}x${rows}:padding=4:margin=4`, '-frames:v', '1', '-q:v', '3', outPath]);
  if (r.code !== 0) {
    // drawtext needs a usable font; fall back to an unstamped sheet rather than nothing.
    r = run('ffmpeg', ['-y', '-v', 'error', '-i', file, '-vf', `${base},tile=${cols}x${rows}:padding=4:margin=4`, '-frames:v', '1', '-q:v', '3', outPath]);
    return { ok: r.code === 0, stamped: false, interval, tiles };
  }
  return { ok: true, stamped: true, interval, tiles };
}

function sceneCuts(file, threshold = 0.3) {
  const r = run('ffmpeg', ['-v', 'info', '-i', file, '-vf', `select='gt(scene,${threshold})',showinfo`, '-an', '-f', 'null', '-']);
  return [...r.err.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(Number(m[1]).toFixed(2)));
}

// Per-second RMS loudness (dBFS). Peaks well above the clip's median are
// candidate moments: crowd cheers, whistles, ball strikes, celebrations.
function loudness(file) {
  const r = run('ffmpeg', [
    '-v', 'error', '-i', file, '-vn',
    '-af', 'aresample=16000,asetnsamples=n=16000,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-',
    '-f', 'null', '-',
  ]);
  const curve = [];
  let t = null;
  for (const line of r.out.split(/\r?\n/)) {
    const tm = line.match(/pts_time:([\d.]+)/);
    if (tm) t = Number(tm[1]);
    const lv = line.match(/RMS_level=(-?[\d.]+|-inf)/);
    if (lv && t !== null) curve.push({ t: Math.round(t), db: lv[1] === '-inf' ? -90 : Number(Number(lv[1]).toFixed(1)) });
  }
  if (!curve.length) return { curve, median: null, peaks: [] };
  const sorted = [...curve].map((c) => c.db).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const peaks = curve
    .filter((c) => c.db >= median + 6)
    .sort((a, b) => b.db - a.db)
    .slice(0, 5)
    .sort((a, b) => a.t - b.t);
  return { curve, median, peaks };
}

function sparkline(curve) {
  if (!curve.length) return '';
  const chars = '▁▂▃▄▅▆▇█';
  const dbs = curve.map((c) => c.db);
  const lo = Math.min(...dbs);
  const hi = Math.max(...dbs);
  return dbs.map((d) => chars[hi === lo ? 0 : Math.round(((d - lo) / (hi - lo)) * 7)]).join('');
}

const files = readdirSync(inputDir)
  .filter((f) => statSync(join(inputDir, f)).isFile())
  .filter((f) => VIDEO_EXT.has(extname(f).toLowerCase()) || IMAGE_EXT.has(extname(f).toLowerCase()))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const report = { generatedAt: new Date().toISOString(), inputDir, clips: [], photos: [] };

files.forEach((f, i) => {
  const file = join(inputDir, f);
  const id = String(i + 1).padStart(2, '0');
  const meta = probe(file);
  if (!meta) {
    report.clips.push({ id, file: f, error: 'ffprobe could not read this file' });
    return;
  }
  if (IMAGE_EXT.has(extname(f).toLowerCase())) {
    report.photos.push({ id, file: f, width: meta.width, height: meta.height, orientation: meta.orientation });
    return;
  }
  process.stderr.write(`[${id}] ${f} (${fmt(meta.duration)})\n`);
  const sheetName = `${id}-${basename(f, extname(f))}.jpg`;
  const sheet = contactSheet(file, meta.duration, join(sheetsDir, sheetName));
  const cuts = sceneCuts(file);
  const loud = meta.hasAudio ? loudness(file) : { curve: [], median: null, peaks: [] };
  const flags = [];
  if (meta.orientation === 'landscape') flags.push('landscape → needs 9:16 reframe');
  if (meta.height < 1080 && meta.width < 1080) flags.push('below 1080p');
  if (meta.fps >= 50) flags.push('high fps → slow-mo capable');
  if (!meta.hasAudio) flags.push('no audio track');
  report.clips.push({ id, file: f, ...meta, sheet: `contact-sheets/${sheetName}`, sheetInfo: sheet, sceneCuts: cuts, loudness: loud, flags });
});

writeFileSync(join(outDir, 'footage-report.json'), JSON.stringify(report, null, 2));

const md = [];
md.push(`# Footage report`, ``, `Source: \`${inputDir}\`  `, `Generated: ${report.generatedAt}`, ``);
const total = report.clips.reduce((s, c) => s + (c.duration ?? 0), 0);
md.push(`**${report.clips.length} clips** (${fmt(total)} total), **${report.photos.length} photos**.`, ``);
md.push(`| # | File | Len | Size | Orient. | FPS | Audio peaks (s) | Flags |`, `|---|---|---|---|---|---|---|---|`);
for (const c of report.clips) {
  if (c.error) { md.push(`| ${c.id} | ${c.file} | — | — | — | — | — | ${c.error} |`); continue; }
  const peaks = c.loudness.peaks.map((p) => p.t).join(', ') || '—';
  md.push(`| ${c.id} | ${c.file} | ${fmt(c.duration)} | ${c.width}×${c.height} | ${c.orientation} | ${c.fps} | ${peaks} | ${c.flags.join('; ')} |`);
}
md.push(``);
for (const c of report.clips) {
  if (c.error) continue;
  md.push(`## ${c.id} — ${c.file}`, ``);
  md.push(`- Contact sheet: \`${c.sheet}\` (${c.sheetInfo.tiles} tiles, one every ${c.sheetInfo.interval.toFixed(1)}s${c.sheetInfo.stamped ? ', timestamped' : ', NOT timestamped — tile n ≈ n×interval'})`);
  md.push(`- Scene cuts at: ${c.sceneCuts.length ? c.sceneCuts.join(', ') : 'none (single continuous shot)'}`);
  if (c.loudness.curve.length) {
    md.push(`- Loudness (1 char = 1s, median ${c.loudness.median} dBFS): \`${sparkline(c.loudness.curve)}\``);
    md.push(`- Candidate moments (loud peaks): ${c.loudness.peaks.map((p) => `${fmt(p.t)} (${p.db} dB)`).join(', ') || 'none stand out'}`);
  }
  md.push(``);
}
if (report.photos.length) {
  md.push(`## Photos`, ``);
  for (const p of report.photos) md.push(`- ${p.id} ${p.file} — ${p.width}×${p.height} ${p.orientation}`);
}
writeFileSync(join(outDir, 'footage-report.md'), md.join('\n'));
console.log(`Wrote ${join(outDir, 'footage-report.md')}`);
