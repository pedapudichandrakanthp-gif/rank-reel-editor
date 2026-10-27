export type MediaType = 'video' | 'image' | 'audio' | 'subtitle';

export type EditorFontFamily =
  | 'Montserrat'
  | 'Inter'
  | 'Roboto'
  | 'Poppins'
  | 'Open Sans'
  | 'Lato'
  | 'Oswald'
  | 'Bebas Neue'
  | 'Anton'
  | 'Playfair Display'
  | 'Arial'
  | 'Georgia'
  | 'Times New Roman'
  | 'System Default';

export interface MediaAsset {
  id: string;
  name: string;
  type: MediaType;
  url: string;
  localPath?: string; // Relative path on local disk for FFmpeg backend rendering
  duration: number;   // Seconds (default 3.0 for still images)
  width?: number;
  height?: number;
  thumbnail?: string;
}

export interface OverlayConfig {
  showBadge: boolean;
  rankNumber: number;
  rankPrefix: string; // e.g. "#" or "TOP "
  badgeColor: string;
  badgeTextColor: string;
  badgePosition: 'top-left' | 'top-center' | 'top-right';
  badgeFont?: EditorFontFamily;
  titleText: string;
  titleFont?: EditorFontFamily;
  titleColor?: string;
  titleWordColors?: string[];
  subtitleText: string;
  subtitleFont?: EditorFontFamily;
  overlayYPercent: number; // 5 to 90
  bannerBgColor: string;
  bannerBgOpacity: number; // 0 to 1 (useful for covering baked-in text on flattened MP4s)
}

export interface TimedCaptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface CaptionConfig {
  enabled: boolean;
  text: string;
  placement: 'top' | 'middle' | 'bottom';
  fontFamily: EditorFontFamily | string;
  fontSize: number;      // px on 1080x1920 canvas (e.g., 52)
  textColor: string;     // hex
  bgColor: string;       // hex
  bgOpacity: number;     // 0 to 1
  uppercase: boolean;
  wordHighlight?: boolean;
  segments?: TimedCaptionSegment[];
}

export interface SceneAudioConfig {
  sourceClipVolume: number; // 0 to 1.5 (100% = 1.0)
  muteSourceClip: boolean;
  narrationAssetId: string | null;
  narrationVolume: number;  // 0 to 1.5
  viralSfxAssetId?: string | null;
  viralSfxVolume?: number;
}

export interface LadderSlotConfig {
  rank: number;
  label: string;
  fontFamily?: EditorFontFamily;
}

export interface TemplateSettingsConfig {
  style: 'reference-ladder' | 'classic-banner';
  totalRanks: number;
  autoFitScreen: boolean;
  customScalePct: number;
  headerLine1: string;
  headerLine1Color: string;
  headerLine1Font?: EditorFontFamily;
  headerLine2: string;
  headerLine2Color: string;
  headerLine2Font?: EditorFontFamily;
  ladderNumbersFont?: EditorFontFamily;
  ladderSlotsFont?: EditorFontFamily;
  highlightCurrentClipText: boolean;
  ladderSlots: LadderSlotConfig[];
  showBottomHookPill: boolean;
  bottomHookText: string;
  bottomHookFont?: EditorFontFamily;
  showRoundedProgressBar: boolean;
  lastUsedFont?: EditorFontFamily;
}

export interface Scene {
  id: string;
  order: number;
  label: string;
  mediaAssetId: string;
  mediaType: 'video' | 'image';
  trimStart: number; // Seconds into source video
  trimEnd: number;   // Seconds into source video (duration = trimEnd - trimStart)
  duration: number;  // Computed or explicit duration in seconds
  overlay: OverlayConfig;
  caption: CaptionConfig;
  audio: SceneAudioConfig;
}

export interface GlobalAudioConfig {
  bgMusicAssetId: string | null;
  bgMusicVolume: number;      // 0 to 1.0
  masterNarrationVolume: number; // 0 to 1.5
}

export interface RankReelProject {
  id: string;
  name: string;
  version: string;
  updatedAt: string;
  resolution: {
    width: 1080;
    height: 1920;
    aspectRatio: '9:16';
    fps: 30;
  };
  templateSettings?: TemplateSettingsConfig;
  mediaLibrary: MediaAsset[];
  scenes: Scene[];
  globalAudio: GlobalAudioConfig;
}
