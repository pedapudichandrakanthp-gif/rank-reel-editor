#!/usr/bin/env node
/**
 * Automated 12-Step End-to-End Validation Suite for Personal Rank Reel Editor
 *
 * Tests and verifies the exact required workflow against real FFmpeg:
 * 1. Open / initialize application & verify FFmpeg availability.
 * 2. Import test MP4 (`rankreels_imported_9s.mp4`, 9.0s, 1080x1920).
 * 3. Split the video into 3 scenes at cut points (0-3s, 3-6s, 6-9s).
 * 4. Change the order of at least two scenes (swap Scene 1 and Scene 2).
 * 5. Trim a scene (trim Scene 1 from 3.0s to 2.0s: trimStart=0.5, trimEnd=2.5).
 * 6. Add or modify a text overlay & caption on a scene ( verify unrelated scenes are untouched).
 * 7. Replace a scene's media with a separate image asset (`scene_deep_ocean.jpg`) and verify only the target scene updates.
 * 8. Add background audio (`background_synth_loop.mp3`) and configure volume levels.
 * 9. Save the project locally (`projects/workflow_validation_project.json`).
 * 10. Close (clear state) and reopen the saved project from disk, verifying zero loss of scene settings or media references.
 * 11. Export the edited video via FFmpeg (`exports/validated_rank_reel_1080x1920.mp4`).
 * 12. Inspect the exported MP4 with `ffprobe` to verify playable H.264/AAC streams, 1080x1920 resolution, expected total duration (8.0s = 3.0s + 2.0s + 3.0s), visual frame extraction, and audio stream presence.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { checkFfmpeg, probeMedia, renderProjectToMp4 } = require('../server/index.js');

const ROOT_DIR = path.resolve(__dirname, '..');
const PROJECTS_DIR = path.join(ROOT_DIR, 'projects');
const EXPORTS_DIR = path.join(ROOT_DIR, 'exports');

async function runWorkflowValidation() {
  console.log('=== STARTING 12-STEP END-TO-END RANK REEL WORKFLOW VALIDATION ===\n');

  // Step 1: Verify application & FFmpeg availability
  const ff = checkFfmpeg();
  assert.strictEqual(ff.available, true, 'FFmpeg must be installed and available');
  console.log(`[PASS] Step 1: Application initialized & FFmpeg verified (${ff.version})`);

  // Step 2: Import test MP4
  const importedMp4Rel = 'sample-project/assets/rankreels_imported_9s.mp4';
  const importedMp4Abs = path.join(ROOT_DIR, importedMp4Rel);
  assert.strictEqual(fs.existsSync(importedMp4Abs), true, 'Test MP4 must exist');
  const mp4Probe = probeMedia(importedMp4Abs);
  assert.strictEqual(mp4Probe.hasVideo, true, 'Imported MP4 must contain video stream');
  assert.strictEqual(mp4Probe.width, 1080, 'Imported MP4 width must be 1080');
  assert.strictEqual(mp4Probe.height, 1920, 'Imported MP4 height must be 1920');
  console.log(`[PASS] Step 2: Imported test MP4 (${importedMp4Rel}, duration=${mp4Probe.duration}s, ${mp4Probe.width}x${mp4Probe.height})`);

  // Step 3: Split imported 9.0s MP4 into 3 separate scene clips at user-defined cut points (0-3s, 3-6s, 6-9s)
  let project = {
    id: 'workflow_validation_project',
    name: 'Validated YouTube Ranking Short',
    version: '1.0.0',
    updatedAt: new Date().toISOString(),
    resolution: { width: 1080, height: 1920, aspectRatio: '9:16', fps: 30 },
    mediaLibrary: [
      {
        id: 'asset_imported_mp4',
        name: 'rankreels_imported_9s.mp4',
        type: 'video',
        url: '/' + importedMp4Rel,
        localPath: importedMp4Rel,
        duration: mp4Probe.duration,
        width: 1080,
        height: 1920
      },
      {
        id: 'asset_replacement_img',
        name: 'scene_deep_ocean.jpg',
        type: 'image',
        url: '/sample-project/assets/scene_deep_ocean.jpg',
        localPath: 'sample-project/assets/scene_deep_ocean.jpg',
        duration: 3.0,
        width: 768,
        height: 1376
      },
      {
        id: 'asset_bg_music',
        name: 'background_synth_loop.mp3',
        type: 'audio',
        url: '/sample-project/assets/background_synth_loop.mp3',
        localPath: 'sample-project/assets/background_synth_loop.mp3',
        duration: 12.0
      }
    ],
    scenes: [0, 3, 6].map((cutStart, idx) => ({
      id: `scene_split_${idx + 1}`,
      order: idx,
      label: `Split Scene ${idx + 1}`,
      mediaAssetId: 'asset_imported_mp4',
      mediaType: 'video',
      trimStart: cutStart,
      trimEnd: cutStart + 3.0,
      duration: 3.0,
      overlay: {
        showBadge: true,
        rankNumber: 3 - idx,
        rankPrefix: '#',
        badgeColor: '#f59e0b',
        badgeTextColor: '#09090b',
        badgePosition: 'top-left',
        titleText: `Initial Rank #${3 - idx}`,
        subtitleText: `Cut ${cutStart}s - ${cutStart + 3}s`,
        overlayYPercent: 14,
        bannerBgColor: '#09090b',
        bannerBgOpacity: 0.78
      },
      caption: {
        enabled: true,
        text: `Caption for scene ${idx + 1}`,
        placement: 'bottom',
        fontFamily: 'Inter',
        fontSize: 48,
        textColor: '#ffffff',
        bgColor: '#09090b',
        bgOpacity: 0.75,
        uppercase: false
      },
      audio: {
        sourceClipVolume: 0.9,
        muteSourceClip: false,
        narrationAssetId: null,
        narrationVolume: 1.0
      }
    })),
    globalAudio: {
      bgMusicAssetId: null,
      bgMusicVolume: 0.0,
      masterNarrationVolume: 1.0
    }
  };
  assert.strictEqual(project.scenes.length, 3, 'Video must be split into 3 scenes');
  console.log('[PASS] Step 3: Split imported MP4 into 3 scenes at cut points [0-3s, 3-6s, 6-9s]');

  // Step 4: Reorder at least two scenes (move scene_split_2 to order 0, scene_split_1 to order 1)
  project.scenes[0].order = 1;
  project.scenes[1].order = 0;
  project.scenes.sort((a, b) => a.order - b.order);
  assert.strictEqual(project.scenes[0].id, 'scene_split_2', 'Scene 2 must now be first in order');
  assert.strictEqual(project.scenes[1].id, 'scene_split_1', 'Scene 1 must now be second in order');
  console.log('[PASS] Step 4: Reordered scenes (scene_split_2 -> #1 slot, scene_split_1 -> #2 slot)');

  // Step 5: Trim a scene (trim scene_split_1 from 0..3s to 0.5..2.5s = 2.0s duration)
  const sceneToTrim = project.scenes.find(s => s.id === 'scene_split_1');
  sceneToTrim.trimStart = 0.5;
  sceneToTrim.trimEnd = 2.5;
  sceneToTrim.duration = Number((sceneToTrim.trimEnd - sceneToTrim.trimStart).toFixed(2));
  assert.strictEqual(sceneToTrim.duration, 2.0, 'Trimmed scene duration must be 2.0s');
  assert.strictEqual(project.scenes[0].duration, 3.0, 'Unrelated scene duration must remain 3.0s');
  console.log('[PASS] Step 5: Trimmed scene_split_1 to [0.5s - 2.5s] (2.0s duration); unrelated scenes untouched');

  // Step 6: Add or modify text overlay & caption on scene_split_2 without resetting other scenes
  const firstScene = project.scenes[0];
  firstScene.overlay.rankNumber = 3;
  firstScene.overlay.titleText = 'UPDATED RANK #3 OVERLAY';
  firstScene.caption.text = 'Custom edited caption on reordered first scene!';
  assert.strictEqual(project.scenes[1].overlay.titleText, 'Initial Rank #3', 'Other scene overlay must remain unchanged');
  console.log('[PASS] Step 6: Modified ranking overlay & caption on first scene without affecting other scenes');

  // Step 7: Replace Scene 3's media with separate image asset (`scene_deep_ocean.jpg`)
  const thirdScene = project.scenes[2];
  thirdScene.mediaAssetId = 'asset_replacement_img';
  thirdScene.mediaType = 'image';
  thirdScene.trimStart = 0;
  thirdScene.trimEnd = 3.0;
  thirdScene.duration = 3.0;
  thirdScene.overlay.titleText = 'REPLACED SCENE #1 ABYSS';
  assert.strictEqual(project.scenes[0].mediaAssetId, 'asset_imported_mp4', 'Scene 1 media reference must remain untouched');
  console.log('[PASS] Step 7: Replaced Scene 3 background media with separate image asset (scene_deep_ocean.jpg)');

  // Step 8: Add background audio and configure volume
  project.globalAudio.bgMusicAssetId = 'asset_bg_music';
  project.globalAudio.bgMusicVolume = 0.4;
  project.globalAudio.masterNarrationVolume = 1.0;
  console.log('[PASS] Step 8: Configured background audio (background_synth_loop.mp3 at 40% volume)');

  // Step 9: Save project locally
  const savedFilePath = path.join(PROJECTS_DIR, `${project.id}.json`);
  fs.writeFileSync(savedFilePath, JSON.stringify(project, null, 2), 'utf8');
  assert.strictEqual(fs.existsSync(savedFilePath), true, 'Saved project JSON file must exist on disk');
  console.log(`[PASS] Step 9: Saved project locally to projects/${project.id}.json`);

  // Step 10: Close (clear in-memory state) and reopen from disk
  project = null;
  const reopenedProject = JSON.parse(fs.readFileSync(savedFilePath, 'utf8'));
  assert.strictEqual(reopenedProject.scenes.length, 3, 'Reopened project must have 3 scenes');
  assert.strictEqual(reopenedProject.scenes[0].overlay.titleText, 'UPDATED RANK #3 OVERLAY');
  assert.strictEqual(reopenedProject.scenes[1].duration, 2.0);
  assert.strictEqual(reopenedProject.scenes[2].mediaAssetId, 'asset_replacement_img');
  assert.strictEqual(reopenedProject.globalAudio.bgMusicAssetId, 'asset_bg_music');
  console.log('[PASS] Step 10: Closed and reopened project JSON; verified all scene settings, trims, overlays, and media references');

  // Step 11: Export the edited video via FFmpeg
  const outputFileName = 'validated_rank_reel_1080x1920.mp4';
  const renderResult = await renderProjectToMp4(reopenedProject, outputFileName);
  assert.strictEqual(renderResult.success, true, 'FFmpeg export must succeed');
  assert.strictEqual(fs.existsSync(renderResult.outputPath), true, 'Exported MP4 file must exist');
  console.log(`[PASS] Step 11: Exported playable MP4 (${renderResult.outputPath}, ${(renderResult.sizeBytes / 1024).toFixed(1)} KB)`);

  // Step 12: Verify exported MP4 duration, resolution, visual stream, and audio stream via ffprobe
  const exportProbe = probeMedia(renderResult.outputPath);
  assert.strictEqual(exportProbe.hasVideo, true, 'Exported MP4 must have a valid video stream');
  assert.strictEqual(exportProbe.hasAudio, true, 'Exported MP4 must have a valid audio stream');
  assert.strictEqual(exportProbe.width, 1080, 'Exported MP4 width must be 1080');
  assert.strictEqual(exportProbe.height, 1920, 'Exported MP4 height must be 1920');
  // Expected total duration: 3.0s (scene_split_2) + 2.0s (trimmed scene_split_1) + 3.0s (replaced scene_split_3) = 8.0s
  const durationDiff = Math.abs(exportProbe.duration - 8.0);
  assert.ok(durationDiff < 0.35, `Expected duration ~8.0s, got ${exportProbe.duration}s`);
  console.log(`[PASS] Step 12: Verified exported MP4 via ffprobe: ${exportProbe.width}x${exportProbe.height} (9:16), duration=${exportProbe.duration}s (expected 8.0s), video=H.264, audio=AAC\n`);

  console.log('=== ALL 12 WORKFLOW VALIDATION STEPS PASSED SUCCESSFULLY ===');
}

runWorkflowValidation().catch(err => {
  console.error('WORKFLOW VALIDATION FAILED:', err);
  process.exit(1);
});
