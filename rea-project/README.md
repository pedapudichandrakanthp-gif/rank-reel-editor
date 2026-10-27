# Personal Rank Reel Editor (`rea-project` v2.0)

A personal desktop-first & mobile-ready web-based 9:16 vertical video editor (`1080 × 1920`, `30 FPS`) for YouTube Shorts and ranking videos.

---

## What's New in v2.0 (Playback Engine, Font Studio & UI Audit)

### 1. Hardware-Synced Video Playback & Non-Blocking Seek Engine
- **Pure Canvas Render Loop (`renderSceneToCanvas`)**: Decoupled canvas rendering from media element mutations. `renderSceneToCanvas()` never calls `vid.play()`, `vid.pause()`, or `vid.currentTime = ...` during 60fps drawing.
- **Queued Asynchronous Seek Controller (`safeSeekVideo`)**: Coalesces rapid timeline scrubbing while `vid.seeking` is `true` so overlapping seeks never choke the browser video decoder or freeze on stale frames. Automatically triggers a canvas repaint when the `seeked` event fires.
- **Authoritative Master Playback Clock**: Tracks `vid.readyState`, `vid.seeking`, `waiting`, `stalled`, and `error` events. Holds the playhead steady during brief seek/decode windows (`<= 450ms`) so the timeline never drifts ahead of the video and triggers a seek-thrash loop, with bounded fallback recovery if a media stream stalls.
- **Seamless Contiguous Split-Clip Transitions**: When a single imported MP4 is split into multiple scenes sharing the same `mediaAssetId`, contiguous cut boundaries (`trimEnd === nextScene.trimStart`) keep the `<video>` element playing continuously without pausing or flushing the decoder.
- **HTTP 206 Partial Content Range Streaming (`server/index.js`)**: Full `Accept-Ranges: bytes` and `206 Partial Content` streaming for `.mp4`, `.webm`, `.mp3`, and `.wav` assets so browser seeking is instantaneous.

### 2. Full Font Control for Every Text Element (`Text Font Studio`)
- **16 Bundled Google & Web-Safe Fonts**: `Montserrat`, `Inter`, `Roboto`, `Poppins`, `Open Sans`, `Lato`, `Oswald`, `Bebas Neue`, `Anton`, `Playfair Display`, `Arial`, `Georgia`, `Times New Roman`, `Roboto Mono`, `Impact`, and `System Default`.
- **Independent Font Selection per Text Element**:
  - Top Header Line 1 (`templateSettings.headerLine1Font`)
  - Top Header Line 2 (`templateSettings.headerLine2Font`)
  - 1–10 Ranking List Numbers & Rank Badges (`templateSettings.ladderNumbersFont`, `scene.overlay.badgeFont`)
  - 1–10 Ranking List Item Labels (`templateSettings.ladderSlotsFont` & per-slot `fontFamily`)
  - Scene Ranking Title Headline (`scene.overlay.titleFont`)
  - Scene Supporting Subtitle / Description (`scene.overlay.subtitleFont`)
  - Voiceover Captions & Timed Subtitles (`scene.caption.fontFamily`)
  - Bottom Hook Pill (`templateSettings.bottomHookFont`)
- **Universal Font Studio Bar + Click-on-Canvas Selection**: Click any text area directly on the 9:16 preview canvas (or select from the dropdown in the right-hand **Text Font Studio** bar) to change its font with live preview, or click **✨ Apply to All Text** to unify all typography in one click.
- **Preview & Export Fidelity**: Selected fonts are preloaded via `document.fonts.load(...)` and applied in both the HTML5 Canvas 1080×1920 renderer and the local FFmpeg `drawtext` export pipeline.

---

## Quick Start on Windows (PowerShell)

```powershell
# 1. Navigate to your project folder
cd C:\Users\hp\rea-project

# 2. Verify Node.js and FFmpeg are installed
node -v
ffmpeg -version
ffprobe -version

# (Optional) If FFmpeg is not installed on Windows yet:
# winget install Gyan.FFmpeg

# 3. Run the automated validation & regression test suites
npm test

# 4. Start the local Rank Reel Editor server
npm start
```

Then open **`http://localhost:3000`** in Chrome, Edge, or Brave (or open `rank_reel_editor.html` directly in your browser for standalone offline editing).

### Optional Environment Variables (PowerShell)
- `PORT`: Custom HTTP port (default `3000`). Example: `$env:PORT=4000; npm start`
- `FFMPEG_PATH`: Custom path to `ffmpeg.exe` if not on system `PATH`. Example: `$env:FFMPEG_PATH="C:\ffmpeg\bin\ffmpeg.exe"`
- `FFPROBE_PATH`: Custom path to `ffprobe.exe` if not on system `PATH`. Example: `$env:FFPROBE_PATH="C:\ffmpeg\bin\ffprobe.exe"`
