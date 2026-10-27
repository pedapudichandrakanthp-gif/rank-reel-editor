# RankReels Investigation & Editor Architecture Notes

## 1. What We Retained vs. Removed from the Prototype
- **Retained**:
  - Restrained dark-mode zinc/slate color tokens (`#09090b`, `#121216`, `#18181b`, `#27272a`) with high-contrast amber/indigo focus accents (`#f59e0b`, `#6366f1`).
  - Vertical 9:16 preview card proportions and ranking badge visual hierarchy (`#5` through `#1` top-corner/header badges, bold stroke captions).
- **Removed (Out of Scope per Requirements)**:
  - SaaS pricing tiers, subscription checkout, user authentication/account gating, automatic topic research, and paid AI video generation pipelines.

## 2. Flattened MP4 vs. Separate Scene Assets (Technical Reality)
- **Flattened MP4 Exports (e.g., downloaded from RankReels)**:
  - Text, ranking numbers, and background visuals that were already burned into a single MP4 video stream are pixels in the H.264 frame buffer and **cannot** be un-baked or edited as independent vector layers.
  - **Practical Solution Implemented**:
    1. **Scene Splitting**: Cut a flattened MP4 at exact user-defined timestamps (e.g., `3.0s`, `6.0s`) into independent scene clips with non-destructive `trimStart` and `trimEnd` offsets.
    2. **Opaque Masking / Banner Overlays**: Place customizable ranking badges, title banners (with configurable background opacity/color to cover baked-in headers if needed), and styled captions over any scene.
    3. **Per-Scene Media Replacement**: Replace any individual scene's visual background with a fresh MP4 clip or high-resolution image (`JPG`/`PNG`/`WebP`) while preserving the rest of the reel.

## 3. Licensing & Zero-Cost Architecture
- **Node.js Built-in HTTP Server (`server/index.js`)**: Zero external npm runtime dependencies required to start the local backend on Windows (`node server/index.js`), eliminating `node_modules` binary incompatibility issues.
- **FFmpeg & FFprobe**: Uses system-installed open-source FFmpeg (LGPL/GPL) via `child_process.spawn` for frame-accurate splitting, trimming, scaling/cropping to `1080x1920` (9:16), text/overlay burn-in, narration + background music mixing (`amix`/`volume`), and H.264/AAC MP4 output.
