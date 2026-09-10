export type GameId = 'maimai' | 'snake' | '2048' | 'flappy' | 'caro';

export interface GameMetadata {
  id: GameId;
  title: string;
  subtitle: string;
  category: string;
  badge: string;
  accentColor: 'cyan' | 'pink' | 'amber' | 'emerald' | 'purple';
  iconName: string;
  description: string;
}

// Maimai Types
export type MaimaiNoteType = 'tap' | 'hold' | 'slide' | 'break';

export interface MaimaiNote {
  id: string;
  time: number; // in seconds
  button: number; // 1 to 8 (1 is top-right, goes clockwise around the ring)
  type: MaimaiNoteType;
  duration?: number; // for hold notes in seconds
  endButton?: number; // for slide notes
  isBreak?: boolean;
}

export type Judgement = 'CRITICAL' | 'PERFECT' | 'GREAT' | 'GOOD' | 'MISS';

export interface MaimaiTrack {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  difficulty: 'EASY' | 'BASIC' | 'ADVANCED' | 'EXPERT' | 'MASTER' | 'Re:MASTER' | 'CUSTOM';
  level: string; // e.g. "12+"
  jacketColor: string;
  notes: MaimaiNote[];
  audioUrl?: string;
  videoUrl?: string;
  hasVideo?: boolean;
  isCustom?: boolean;
  createdAt?: number;
  simaiCode?: string;
  totalNotes: number;
}

export interface MajmajHistoryItem {
  id: string;
  trackId: string;
  trackTitle: string;
  difficulty: string;
  level: string;
  accuracy: number;
  rank: MaimaiScoreResult['rank'];
  dxScore: number;
  maxCombo: number;
  critical: number;
  perfect: number;
  great: number;
  good: number;
  miss: number;
  playedAt: number;
}

export interface MaimaiScoreResult {
  critical: number;
  perfect: number;
  great: number;
  good: number;
  miss: number;
  maxCombo: number;
  accuracy: number; // e.g. 100.45%
  dxScore: number;
  rank: 'SSS+' | 'SSS' | 'SS+' | 'SS' | 'S+' | 'S' | 'AAA' | 'AA' | 'A' | 'B' | 'C' | 'D';
}

// High Scores Record
export interface ArcadeScores {
  maimai: { [trackId: string]: number };
  snake: number;
  '2048': number;
  flappy: number;
  caro: { wins: number; losses: number; draws: number };
}
