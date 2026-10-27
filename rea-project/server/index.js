#!/usr/bin/env node
/**
 * Personal Rank Reel Editor — Local Node.js + FFmpeg Backend Server
 * Workspace: C:\Users\hp\rea-project
 *
 * Features:
 * - Zero paid APIs, cloud services, or external dependencies required.
 * - Verifies local FFmpeg & FFprobe availability (`/api/ffmpeg-status`).
 * - Serves the Rank Reel Editor UI at `http://localhost:3000` with full HTTP 206 Range streaming
 *   so browser `<video>` / `<audio>` seeking never freezes or restarts.
 * - Handles media imports (`/api/upload`), project save/load (`/api/projects`),
 *   voiceover auto-caption segmentation (`/api/auto-caption`), and 1080x1920 9:16 H.264/AAC MP4
 *   rendering via FFmpeg (`/api/export`) with per-element font family support.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const PROJECTS_DIR = path.join(ROOT_DIR, 'projects');
const EXPORTS_DIR = path.join(ROOT_DIR, 'exports');
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');

for (const dir of [PROJECTS_DIR, EXPORTS_DIR, UPLOADS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function checkFfmpeg() {
  try {
    const ffmpegBin = process.env.FFMPEG_PATH || 'ffmpeg';
    const ffprobeBin = process.env.FFPROBE_PATH || 'ffprobe';
    const ffmpegOut = execSync(`"${ffmpegBin}" -version`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const ffprobeOut = execSync(`"${ffprobeBin}" -version`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const versionLine = (ffmpegOut.split('\n')[0] || 'ffmpeg available').trim();
    return { available: true, version: versionLine, ffprobe: Boolean(ffprobeOut) };
  } catch (err) {
    return {
      available: false,
      error: 'FFmpeg or FFprobe was not found on your system PATH.',
      installInstructions: [
        'Windows (Winget): Open PowerShell and run: winget install Gyan.FFmpeg',
        'Windows (Scoop): scoop install ffmpeg',
        'Windows (Chocolatey): choco install ffmpeg',
        'After installing, close and reopen your terminal and run: ffmpeg -version'
      ]
    };
  }
}

function probeMedia(filePath) {
  try {
    const ffprobeBin = process.env.FFPROBE_PATH || 'ffprobe';
    const out = execSync(
      `"${ffprobeBin}" -v error -show_entries format=duration:stream=codec_type,width,height -of json "${filePath}"`,
      { encoding: 'utf8' }
    );
    const info = JSON.parse(out);
    const duration = info.format && info.format.duration ? parseFloat(info.format.duration) : 3.0;
    const vStream = (info.streams || []).find(s => s.codec_type === 'video');
    const aStream = (info.streams || []).find(s => s.codec_type === 'audio');
    return {
      duration: Number.isFinite(duration) ? Number(duration.toFixed(3)) : 3.0,
      width: vStream ? vStream.width : undefined,
      height: vStream ? vStream.height : undefined,
      hasVideo: Boolean(vStream),
      hasAudio: Boolean(aStream)
    };
  } catch (e) {
    return { duration: 3.0, hasVideo: false, hasAudio: false };
  }
}

function escapeDrawtext(text) {
  if (!text) return '';
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, '')
    .replace(/%/g, '\\%')
    .replace(/\r?\n/g, ' ');
}

function resolveFfmpegFontName(fontFamily) {
  const raw = String(fontFamily || 'Montserrat').trim();
  const map = {
    'Montserrat': 'Montserrat',
    'Inter': 'Inter',
    'Roboto': 'Roboto',
    'Poppins': 'Poppins',
    'Open Sans': 'Open Sans',
    'Lato': 'Lato',
    'Oswald': 'Oswald',
    'Bebas Neue': 'Bebas Neue',
    'Anton': 'Anton',
    'Playfair Display': 'Playfair Display',
    'Arial': 'Arial',
    'Georgia': 'Georgia',
    'Times New Roman': 'Times New Roman',
    'Roboto Mono': 'Roboto Mono',
    'Impact': 'Impact',
    'System Default': 'Sans'
  };
  return escapeDrawtext(map[raw] || raw || 'Sans');
}

function hexToFfmpegColor(hex, opacity = 1.0) {
  const clean = String(hex || '#000000').replace('#', '').trim();
  const full = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean.padEnd(6, '0').slice(0, 6);
  const alpha = Math.max(0, Math.min(1, Number(opacity ?? 1))).toFixed(2);
  return `0x${full}@${alpha}`;
}

/**
 * Renders a structured RankReelProject to a 1080x1920 (9:16) 30fps H.264/AAC MP4 file.
 * Can be called directly by tests or by the `/api/export` HTTP endpoint.
 */
async function renderProjectToMp4(project, outputFileName) {
  const ffStatus = checkFfmpeg();
  if (!ffStatus.available) {
    throw new Error(ffStatus.error + ' ' + ffStatus.installInstructions.join(' | '));
  }

  if (!project || !Array.isArray(project.scenes) || project.scenes.length === 0) {
    throw new Error('Invalid project data: project must contain at least one scene.');
  }

  const ffmpegBin = process.env.FFMPEG_PATH || 'ffmpeg';
  const orderedScenes = [...project.scenes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const mediaMap = new Map((project.mediaLibrary || []).map(m => [m.id, m]));
  const tpl = project.templateSettings || null;

  const tempDir = fs.mkdtempSync(path.join(EXPORTS_DIR, 'tmp_render_'));
  const segmentPaths = [];

  try {
    for (let i = 0; i < orderedScenes.length; i++) {
      const scene = orderedScenes[i];
      const asset = mediaMap.get(scene.mediaAssetId);
      if (!asset) {
        throw new Error(`Missing media asset "${scene.mediaAssetId}" referenced in scene "${scene.label || scene.id}".`);
      }

      const relOrAbs = asset.localPath || (asset.url ? asset.url.replace(/^\//, '') : '');
      const assetPath = path.isAbsolute(relOrAbs) ? relOrAbs : path.join(ROOT_DIR, relOrAbs);
      if (!fs.existsSync(assetPath)) {
        throw new Error(`Media file not found on disk: ${assetPath}`);
      }

      const trimStart = Math.max(0, Number(scene.trimStart ?? 0));
      const rawDuration = Number(scene.trimEnd ?? (trimStart + Number(scene.duration || 3))) - trimStart;
      const duration = Math.max(0.5, Number(rawDuration.toFixed(3)));

      const segPath = path.join(tempDir, `scene_${String(i).padStart(3, '0')}.mp4`);
      const probe = probeMedia(assetPath);

      // Build video filter chain for 1080x1920 9:16 vertical composition + overlays + captions
      const vFilters = [
        'scale=1080:1920:force_original_aspect_ratio=increase',
        'crop=1080:1920',
        'setsar=1',
        'fps=30',
        'format=yuv420p'
      ];

      const ov = scene.overlay || {};
      const activeRankNum = Number(ov.rankNumber ?? (orderedScenes.length - i));

      if (tpl && tpl.style === 'reference-ladder') {
        const h1Font = resolveFfmpegFontName(tpl.headerLine1Font || tpl.lastUsedFont || 'Montserrat');
        const h2Font = resolveFfmpegFontName(tpl.headerLine2Font || tpl.lastUsedFont || 'Montserrat');
        const numFont = resolveFfmpegFontName(tpl.ladderNumbersFont || tpl.lastUsedFont || 'Montserrat');
        const slotFont = resolveFfmpegFontName(tpl.ladderSlotsFont || tpl.lastUsedFont || 'Montserrat');

        if (tpl.headerLine1) {
          const l1 = escapeDrawtext(String(tpl.headerLine1).toUpperCase());
          const l1Col = hexToFfmpegColor(tpl.headerLine1Color || '#ffffff', 1.0);
          vFilters.push(
            `drawtext=font='${h1Font}':text='${l1}':x=(w-text_w)/2:y=95:fontsize=76:fontcolor=${l1Col}:borderw=6:bordercolor=0x000000@0.95`
          );
        }
        if (tpl.headerLine2) {
          const l2 = escapeDrawtext(String(tpl.headerLine2).toUpperCase());
          const l2Col = hexToFfmpegColor(tpl.headerLine2Color || '#fde047', 1.0);
          vFilters.push(
            `drawtext=font='${h2Font}':text='${l2}':x=(w-text_w)/2:y=190:fontsize=78:fontcolor=${l2Col}:borderw=6:bordercolor=0x000000@0.95`
          );
        }

        const totalRanks = Math.max(1, Math.min(10, Number(tpl.totalRanks || 10)));
        const safeTopY = totalRanks >= 8 ? 315 : 350;
        const safeBottomY = totalRanks >= 8 ? 1515 : 1490;
        const availableH = Math.max(200, safeBottomY - safeTopY);
        const rowGap = Math.max(78, Math.min(180, Math.floor(availableH / totalRanks)));
        const numFs = totalRanks >= 8 ? 50 : 68;
        const lblFs = totalRanks >= 8 ? 32 : 42;
        const slots = Array.isArray(tpl.ladderSlots) ? tpl.ladderSlots : [];

        for (let r = 1; r <= totalRanks; r++) {
          const rowY = safeTopY + (r - 1) * rowGap;
          const isCurrent = (r === activeRankNum);
          const col = isCurrent
            ? hexToFfmpegColor(tpl.headerLine2Color || '#fde047', 1.0)
            : '0xffffff@1.0';
          const slotObj = slots[r - 1] || { rank: r, label: `Rank #${r}` };
          const itemFont = resolveFfmpegFontName(slotObj.fontFamily || slotFont);
          const lblRaw = isCurrent && tpl.highlightCurrentClipText ? 'CURRENT CLIP' : (slotObj.label || `Rank #${r}`);
          const lblStr = escapeDrawtext(isCurrent ? String(lblRaw).toUpperCase() : String(lblRaw));
          if (isCurrent) {
            vFilters.push(`drawbox=x=24:y=${rowY - 10}:w=680:h=${numFs + 22}:color=0xfacc15@0.22:t=fill`);
          }
          vFilters.push(
            `drawtext=font='${numFont}':text='${r}.':x=38:y=${rowY}:fontsize=${numFs}:fontcolor=${col}:borderw=4:bordercolor=0x000000@0.9`
          );
          vFilters.push(
            `drawtext=font='${itemFont}':text='${lblStr}':x=145:y=${rowY + 8}:fontsize=${lblFs}:fontcolor=${col}:borderw=3:bordercolor=0x000000@0.9`
          );
        }
      } else {
        const yPct = Math.max(5, Math.min(88, Number(ov.overlayYPercent ?? 14)));
        const bannerY = Math.round((yPct / 100) * 1920);
        const badgeFont = resolveFfmpegFontName(ov.badgeFont || tpl?.lastUsedFont || 'Montserrat');
        const titleFont = resolveFfmpegFontName(ov.titleFont || tpl?.lastUsedFont || 'Inter');
        const subFont = resolveFfmpegFontName(ov.subtitleFont || tpl?.lastUsedFont || 'Inter');

        if (ov.showBadge || ov.titleText || ov.subtitleText) {
          const boxColor = hexToFfmpegColor(ov.bannerBgColor || '#09090b', ov.bannerBgOpacity ?? 0.78);
          vFilters.push(`drawbox=x=40:y=${bannerY}:w=1000:h=190:color=${boxColor}:t=fill`);
        }

        if (ov.showBadge) {
          const badgeBoxColor = hexToFfmpegColor(ov.badgeColor || '#f59e0b', 1.0);
          const badgeX = ov.badgePosition === 'top-right' ? 880 : ov.badgePosition === 'top-center' ? 470 : 60;
          vFilters.push(`drawbox=x=${badgeX}:y=${bannerY + 20}:w=140:h=150:color=${badgeBoxColor}:t=fill`);
          const rankStr = escapeDrawtext(`${ov.rankPrefix ?? '#'}${ov.rankNumber ?? (i + 1)}`);
          const badgeTextCol = hexToFfmpegColor(ov.badgeTextColor || '#09090b', 1.0);
          vFilters.push(
            `drawtext=font='${badgeFont}':text='${rankStr}':x=${badgeX + 24}:y=${bannerY + 58}:fontsize=68:fontcolor=${badgeTextCol}`
          );
        }

        if (ov.titleText) {
          const titleStr = escapeDrawtext(ov.titleText);
          const titleX = ov.showBadge && ov.badgePosition === 'top-left' ? 230 : 70;
          const titleCol = hexToFfmpegColor(ov.titleColor || '#ffffff', 1.0);
          vFilters.push(
            `drawtext=font='${titleFont}':text='${titleStr}':x=${titleX}:y=${bannerY + 42}:fontsize=48:fontcolor=${titleCol}`
          );
        }

        if (ov.subtitleText) {
          const subStr = escapeDrawtext(ov.subtitleText);
          const subX = ov.showBadge && ov.badgePosition === 'top-left' ? 230 : 70;
          vFilters.push(
            `drawtext=font='${subFont}':text='${subStr}':x=${subX}:y=${bannerY + 112}:fontsize=32:fontcolor=0xd4d4d8@1.0`
          );
        }
      }

      const cap = scene.caption || {};
      const capTextSource = (cap.enabled && cap.text)
        ? cap.text
        : (tpl && tpl.style === 'reference-ladder' && tpl.showBottomHookPill ? (tpl.bottomHookText || '') : '');
      if (capTextSource && (cap.enabled || (tpl && tpl.style === 'reference-ladder' && tpl.showBottomHookPill))) {
        const rawCap = cap.uppercase ? String(capTextSource).toUpperCase() : String(capTextSource);
        const capStr = escapeDrawtext(rawCap);
        const capY = cap.placement === 'top' ? 360 : cap.placement === 'middle' ? 920 : 1540;
        const capBoxCol = hexToFfmpegColor(cap.bgColor || '#09090b', cap.bgOpacity ?? 0.75);
        const capTxtCol = hexToFfmpegColor(cap.textColor || '#ffffff', 1.0);
        const fSize = Math.max(24, Math.min(84, Number(cap.fontSize || 48)));
        const capFont = resolveFfmpegFontName(cap.fontFamily || tpl?.bottomHookFont || tpl?.lastUsedFont || 'Inter');
        vFilters.push(`drawbox=x=50:y=${capY - 24}:w=980:h=${fSize + 56}:color=${capBoxCol}:t=fill`);
        vFilters.push(
          `drawtext=font='${capFont}':text='${capStr}':x=(w-text_w)/2:y=${capY}:fontsize=${fSize}:fontcolor=${capTxtCol}`
        );
      }

      const aud = scene.audio || {};
      const clipVol = aud.muteSourceClip ? 0.0 : Math.max(0, Math.min(2.0, Number(aud.sourceClipVolume ?? 1.0)));

      const ffArgs = ['-y'];
      if (asset.type === 'image' || scene.mediaType === 'image' || !probe.hasVideo) {
        ffArgs.push('-loop', '1', '-t', String(duration), '-i', assetPath);
      } else {
        ffArgs.push('-ss', String(trimStart), '-t', String(duration), '-i', assetPath);
      }

      // Add silent audio generator as input 1 so every scene segment is guaranteed to have a normalized 44.1kHz stereo audio stream
      ffArgs.push('-f', 'lavfi', '-t', String(duration), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');

      let filterComplex = `[0:v]${vFilters.join(',')}[vout];`;
      if (probe.hasAudio && asset.type === 'video' && !aud.muteSourceClip) {
        filterComplex += `[0:a]volume=${clipVol.toFixed(2)},aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a0];[a0][1:a]amix=inputs=2:duration=shortest[aout]`;
      } else {
        filterComplex += `[1:a]volume=0.0[aout]`;
      }

      ffArgs.push(
        '-filter_complex', filterComplex,
        '-map', '[vout]',
        '-map', '[aout]',
        '-t', String(duration),
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-ar', '44100',
        '-ac', '2',
        segPath
      );

      await runProcess(ffmpegBin, ffArgs);
      segmentPaths.push(segPath);
    }

    // Concatenate all rendered scene segments in scene order
    const concatListPath = path.join(tempDir, 'concat_list.txt');
    fs.writeFileSync(
      concatListPath,
      segmentPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'),
      'utf8'
    );

    const concatMp4Path = path.join(tempDir, 'concatenated.mp4');
    await runProcess(ffmpegBin, [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
      '-c', 'copy',
      concatMp4Path
    ]);

    const finalName = outputFileName || `rank_reel_export_${Date.now()}.mp4`;
    const finalPath = path.join(EXPORTS_DIR, finalName);

    // Optional global background music mixing
    const bgAssetId = project.globalAudio && project.globalAudio.bgMusicAssetId;
    const bgAsset = bgAssetId ? mediaMap.get(bgAssetId) : null;
    const bgVol = Math.max(0, Math.min(1.5, Number(project.globalAudio?.bgMusicVolume ?? 0.35)));

    if (bgAsset && bgVol > 0) {
      const bgRel = bgAsset.localPath || (bgAsset.url ? bgAsset.url.replace(/^\//, '') : '');
      const bgPath = path.isAbsolute(bgRel) ? bgRel : path.join(ROOT_DIR, bgRel);
      if (fs.existsSync(bgPath)) {
        const masterVol = Math.max(0, Math.min(2.0, Number(project.globalAudio?.masterNarrationVolume ?? 1.0)));
        await runProcess(ffmpegBin, [
          '-y',
          '-i', concatMp4Path,
          '-stream_loop', '-1',
          '-i', bgPath,
          '-filter_complex',
          `[0:a]volume=${masterVol.toFixed(2)}[a_main];[1:a]volume=${bgVol.toFixed(2)}[a_bg];[a_main][a_bg]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
          '-map', '0:v',
          '-map', '[aout]',
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-shortest',
          finalPath
        ]);
      } else {
        fs.copyFileSync(concatMp4Path, finalPath);
      }
    } else {
      fs.copyFileSync(concatMp4Path, finalPath);
    }

    const finalStats = fs.statSync(finalPath);
    const finalProbe = probeMedia(finalPath);

    return {
      success: true,
      fileName: finalName,
      outputPath: finalPath,
      downloadUrl: `/exports/${finalName}`,
      sizeBytes: finalStats.size,
      duration: finalProbe.duration,
      width: finalProbe.width,
      height: finalProbe.height,
      hasVideo: finalProbe.hasVideo,
      hasAudio: finalProbe.hasAudio
    };
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

function runProcess(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', chunk => { stderr += chunk.toString(); });
    proc.on('error', err => reject(err));
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr.slice(-600)}`));
    });
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 50 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Range'
  });
  res.end(JSON.stringify(payload));
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.srt': 'text/plain; charset=utf-8'
};

/**
 * Serves static files with full HTTP 206 Partial Content byte-range support
 * so browser `<video>` and `<audio>` elements seek smoothly without freezing.
 */
function serveStaticFileWithRanges(req, res, targetPath) {
  const stat = fs.statSync(targetPath);
  const fileSize = stat.size;
  const ext = path.extname(targetPath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const rangeHeader = req.headers.range;

  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (!match) {
      res.writeHead(416, {
        'Content-Range': `bytes */${fileSize}`,
        'Access-Control-Allow-Origin': '*'
      });
      return res.end();
    }
    const start = match[1] ? parseInt(match[1], 10) : 0;
    const end = match[2] ? Math.min(fileSize - 1, parseInt(match[2], 10)) : fileSize - 1;
    if (start >= fileSize || start > end) {
      res.writeHead(416, {
        'Content-Range': `bytes */${fileSize}`,
        'Access-Control-Allow-Origin': '*'
      });
      return res.end();
    }
    const chunkSize = end - start + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });
    return fs.createReadStream(targetPath, { start, end }).pipe(res);
  }

  res.writeHead(200, {
    'Content-Length': fileSize,
    'Accept-Ranges': 'bytes',
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*'
  });
  return fs.createReadStream(targetPath).pipe(res);
}

function createServer() {
  return http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      return sendJson(res, 200, { ok: true });
    }

    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);
    const pathname = decodeURIComponent(urlObj.pathname);

    try {
      if (pathname === '/api/ffmpeg-status' && req.method === 'GET') {
        return sendJson(res, 200, checkFfmpeg());
      }

      if (pathname === '/api/sample-project' && req.method === 'GET') {
        const samplePath = path.join(ROOT_DIR, 'sample-project', 'sample-ranking-project.json');
        const data = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
        return sendJson(res, 200, data);
      }

      if (pathname === '/api/projects' && req.method === 'GET') {
        const files = fs.readdirSync(PROJECTS_DIR).filter(f => f.endsWith('.json'));
        const list = files.map(f => {
          const p = path.join(PROJECTS_DIR, f);
          const stat = fs.statSync(p);
          return { fileName: f, updatedAt: stat.mtime.toISOString(), sizeBytes: stat.size };
        });
        return sendJson(res, 200, { projects: list });
      }

      if (pathname === '/api/projects/save' && req.method === 'POST') {
        const body = await readJsonBody(req);
        if (!body || !body.project || !body.project.id) {
          return sendJson(res, 400, { error: 'Invalid project payload: missing project.id' });
        }
        const safeName = `${body.project.id.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
        const savePath = path.join(PROJECTS_DIR, safeName);
        body.project.updatedAt = new Date().toISOString();
        fs.writeFileSync(savePath, JSON.stringify(body.project, null, 2), 'utf8');
        return sendJson(res, 200, { success: true, fileName: safeName, savedAt: body.project.updatedAt });
      }

      if (pathname === '/api/projects/load' && req.method === 'GET') {
        const file = urlObj.searchParams.get('file') || '';
        const safeFile = path.basename(file);
        const fullPath = path.join(PROJECTS_DIR, safeFile);
        if (!fs.existsSync(fullPath)) {
          return sendJson(res, 404, { error: `Saved project not found: ${safeFile}` });
        }
        const project = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        return sendJson(res, 200, { project });
      }

      if (pathname === '/api/upload' && req.method === 'POST') {
        const body = await readJsonBody(req);
        if (!body || !body.fileName || !body.base64Data) {
          return sendJson(res, 400, { error: 'Missing fileName or base64Data' });
        }
        const safeName = `${Date.now()}_${path.basename(body.fileName).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const destPath = path.join(UPLOADS_DIR, safeName);
        const base64Clean = body.base64Data.includes(',') ? body.base64Data.split(',')[1] : body.base64Data;
        fs.writeFileSync(destPath, Buffer.from(base64Clean, 'base64'));
        const probe = probeMedia(destPath);
        return sendJson(res, 200, {
          success: true,
          url: `/uploads/${safeName}`,
          localPath: `uploads/${safeName}`,
          ...probe
        });
      }

      if (pathname === '/api/auto-caption' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const dur = Math.max(1.0, Number(body.duration || 3.0));
        const hint = String(body.transcriptHint || '').trim();
        if (!hint) {
          return sendJson(res, 200, { segments: [] });
        }
        const clauses = hint
          .split(/(?<=[.!?—,;])\s+|\r?\n+/)
          .map(s => s.trim())
          .filter(Boolean);
        const parts = clauses.length > 0 ? clauses : [hint];
        const step = Number((dur / parts.length).toFixed(2));
        const segments = parts.map((text, idx) => ({
          start: Number((idx * step).toFixed(2)),
          end: idx === parts.length - 1 ? dur : Number(((idx + 1) * step).toFixed(2)),
          text
        }));
        return sendJson(res, 200, { segments });
      }

      if (pathname === '/api/export' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const result = await renderProjectToMp4(body.project, body.outputFileName);
        return sendJson(res, 200, result);
      }

      // Serve static files (index.html, sample assets, exports, uploads) with HTTP 206 Range support
      const relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
      const targetPath = path.resolve(ROOT_DIR, relPath);
      if (!targetPath.startsWith(ROOT_DIR)) {
        res.writeHead(403);
        return res.end('Forbidden');
      }
      if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
        return serveStaticFileWithRanges(req, res, targetPath);
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    } catch (err) {
      sendJson(res, 500, { error: err.message || 'Internal server error' });
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  const server = createServer();
  server.listen(port, () => {
    const ff = checkFfmpeg();
    console.log('==========================================================');
    console.log(` Personal Rank Reel Editor running at http://localhost:${port}`);
    console.log(` FFmpeg Status: ${ff.available ? ff.version : 'MISSING - ' + ff.error}`);
    console.log('==========================================================');
  });
}

module.exports = {
  checkFfmpeg,
  probeMedia,
  resolveFfmpegFontName,
  renderProjectToMp4,
  createServer
};
