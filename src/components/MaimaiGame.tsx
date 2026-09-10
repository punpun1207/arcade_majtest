import React, { useState, useEffect, useRef, useCallback } from 'react';
import JSZip from 'jszip';
import {
  Play,
  RotateCcw,
  Upload,
  Music,
  Zap,
  Eye,
  FolderUp,
  Film,
  History,
  Trash2,
  ExternalLink,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Volume2,
  VolumeX,
  Volume1,
  FileArchive,
  Code,
  Sparkles,
  Flame
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { MaimaiTrack, MaimaiNote, Judgement, MaimaiScoreResult, MajmajHistoryItem } from '../types';
import { sound } from '../utils/audio';
import {
  BUILTIN_TRACKS,
  parseMaidataHeader,
  parseSimaiToNotes,
  readFileAsSimaiText,
  ParsedMaidataChart
} from '../utils/simaiParser';
import {
  saveCustomTrack,
  loadCustomTracks,
  deleteCustomTrack,
  savePlayHistory,
  loadPlayHistory
} from '../utils/trackStorage';

interface Props {
  onBack: () => void;
  onUpdateHighScore: (trackId: string, score: number) => void;
  highScore: number;
}

export interface HitVisualEffect {
  id: number;
  button: number;
  xPercent: number;
  yPercent: number;
  judge: Judgement;
  isBreak: boolean;
  isSlide: boolean;
  particles: {
    id: number;
    dx: string;
    dy: string;
    size: number;
    color: string;
  }[];
}

export interface ComboMilestone {
  id: number;
  text: string;
  count: number;
}

// 8 Majmaj sensor angles in degrees (clockwise around the ring)
const BUTTON_CONFIG = [
  { id: 1, angle: -67.5, key: 'E', label: '1' },
  { id: 2, angle: -22.5, key: 'D', label: '2' },
  { id: 3, angle: 22.5, key: 'C', label: '3' },
  { id: 4, angle: 67.5, key: 'X', label: '4' },
  { id: 5, angle: 112.5, key: 'Z', label: '5' },
  { id: 6, angle: 157.5, key: 'A', label: '6' },
  { id: 7, angle: 202.5, key: 'Q', label: '7' },
  { id: 8, angle: 247.5, key: 'W', label: '8' }
];

export const MaimaiGame: React.FC<Props> = ({ onBack, onUpdateHighScore, highScore }) => {
  const [tracks, setTracks] = useState<MaimaiTrack[]>(BUILTIN_TRACKS);
  const [selectedTrackIndex, setSelectedTrackIndex] = useState<number>(0);
  const currentTrack = tracks[selectedTrackIndex] || tracks[0];

  // Game state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isGameOver, setIsGameOver] = useState<boolean>(false);
  const [isAutoPlay, setIsAutoPlay] = useState<boolean>(false);
  const [hiSpeed, setHiSpeed] = useState<number>(3.5);
  const [offsetMs, setOffsetMs] = useState<number>(0);
  const [bgaBrightness, setBgaBrightness] = useState<number>(0.6); // BGA Video opacity

  // Scoring & Judgement state
  const [combo, setCombo] = useState<number>(0);
  const [maxCombo, setMaxCombo] = useState<number>(0);
  const [scorePercentage, setScorePercentage] = useState<number>(0);
  const [dxScore, setDxScore] = useState<number>(0);
  const [recentJudgement, setRecentJudgement] = useState<{ text: Judgement; id: number } | null>(null);
  const [stats, setStats] = useState({ critical: 0, perfect: 0, great: 0, good: 0, miss: 0 });

  // Modals state
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [historyList, setHistoryList] = useState<MajmajHistoryItem[]>([]);

  // Import form state
  const [importStatus, setImportStatus] = useState<string>('');
  const [folderFilesFound, setFolderFilesFound] = useState<{
    chartName?: string;
    audioName?: string;
    videoName?: string;
  }>({});
  const [parsedChartData, setParsedChartData] = useState<{
    chartText: string;
    audioBlob?: Blob;
    videoBlob?: Blob;
    title: string;
    artist: string;
    bpm: number;
    offset: number;
    charts: ParsedMaidataChart[];
  } | null>(null);
  const [selectedDifficultyIdx, setSelectedDifficultyIdx] = useState<number>(0);
  const [pastedSimaiCode, setPastedSimaiCode] = useState<string>('');
  const [importTab, setImportTab] = useState<'files' | 'zip' | 'paste'>('zip');

  // Sensors visual press state (button 1..8)
  const [activeButtons, setActiveButtons] = useState<Record<number, boolean>>({});
  const [buttonJudgeTheme, setButtonJudgeTheme] = useState<Record<number, { judge: Judgement; isBreak: boolean }>>({});

  // Dynamic hit visual animations (shrinking rings, explosive bursts, spark particles)
  const [hitVisuals, setHitVisuals] = useState<HitVisualEffect[]>([]);
  const [comboMilestone, setComboMilestone] = useState<ComboMilestone | null>(null);
  const [screenFlash, setScreenFlash] = useState<{ id: number; color: string } | null>(null);

  // Audio volume & mute state
  const [volume, setVolume] = useState<number>(85);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Sync volume with sound controller and audio element
  useEffect(() => {
    sound.setVolume(volume / 100);
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100;
    }
  }, [volume, isMuted]);

  useEffect(() => {
    sound.setMute(isMuted);
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Canvas & Media Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const startTimeRef = useRef<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const liveNotesRef = useRef<{ note: MaimaiNote; judged: boolean; holding?: boolean; startJudge?: Judgement }[]>([]);
  const lastBeatIndexRef = useRef<number>(-1);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);
  const zipInputRef = useRef<HTMLInputElement | null>(null);
  const ringContainerRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef<Record<number, number>>({});
  const activeButtonsRef = useRef<Record<number, boolean>>({});

  // Visual ripples on mouse tap
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number; color: string }[]>([]);

  // Keyboard mapping
  const keyMapRef = useRef<Record<string, number>>({
    e: 1, E: 1, '1': 1,
    d: 2, D: 2, '2': 2,
    c: 3, C: 3, '3': 3,
    x: 4, X: 4, '4': 4,
    z: 5, Z: 5, '5': 5,
    a: 6, A: 6, '6': 6,
    q: 7, Q: 7, '7': 7,
    w: 8, W: 8, '8': 8,
  });

  // Calculate button 1..8 based on mouse click coordinates on the circular screen
  const getButtonFromCoords = useCallback((clientX: number, clientY: number, container: HTMLElement): number | null => {
    const rect = container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Ignore clicks in inner 18% of center circle (HUD)
    if (dist < rect.width * 0.16) return null;

    let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (angleDeg < 0) angleDeg += 360;

    if (angleDeg < 45) return 3;
    if (angleDeg < 90) return 4;
    if (angleDeg < 135) return 5;
    if (angleDeg < 180) return 6;
    if (angleDeg < 225) return 7;
    if (angleDeg < 270) return 8;
    if (angleDeg < 315) return 1;
    return 2;
  }, []);

  // Load custom tracks & history from IndexedDB on startup
  const refreshCustomTracks = useCallback(async () => {
    const customList = await loadCustomTracks();
    setTracks([...customList, ...BUILTIN_TRACKS]);
  }, []);

  const refreshHistory = useCallback(async () => {
    const history = await loadPlayHistory();
    setHistoryList(history);
  }, []);

  useEffect(() => {
    refreshCustomTracks();
    refreshHistory();
  }, [refreshCustomTracks, refreshHistory]);

  // Calculate DX Rank
  const getRank = (acc: number): MaimaiScoreResult['rank'] => {
    if (acc >= 100.5) return 'SSS+';
    if (acc >= 100.0) return 'SSS';
    if (acc >= 99.5) return 'SS+';
    if (acc >= 99.0) return 'SS';
    if (acc >= 98.0) return 'S+';
    if (acc >= 97.0) return 'S';
    if (acc >= 94.0) return 'AAA';
    if (acc >= 90.0) return 'AA';
    if (acc >= 80.0) return 'A';
    if (acc >= 70.0) return 'B';
    if (acc >= 60.0) return 'C';
    return 'D';
  };

  // Start game session
  const startGame = useCallback(() => {
    if (!currentTrack || currentTrack.notes.length === 0) return;

    // Wake Web Audio Context immediately within user gesture
    sound.unlock();

    liveNotesRef.current = currentTrack.notes.map(n => ({
      note: { ...n },
      judged: false,
      holding: false,
      startJudge: undefined
    }));

    setCombo(0);
    setMaxCombo(0);
    setScorePercentage(0);
    setDxScore(0);
    setRecentJudgement(null);
    setHitVisuals([]);
    setComboMilestone(null);
    setScreenFlash(null);
    setButtonJudgeTheme({});
    setStats({ critical: 0, perfect: 0, great: 0, good: 0, miss: 0 });
    setIsGameOver(false);
    setIsPaused(false);
    setIsPlaying(true);
    lastBeatIndexRef.current = -1;

    startTimeRef.current = performance.now();

    // Start Audio immediately in user interaction
    if (currentTrack.audioUrl) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const aud = new Audio(currentTrack.audioUrl);
      aud.volume = isMuted ? 0 : volume / 100;
      audioRef.current = aud;

      const playPromise = aud.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.warn('Audio playback was delayed or blocked by browser:', err);
        });
      }
    }

    // Start Video (BGA)
    if (currentTrack.videoUrl && videoRef.current) {
      videoRef.current.currentTime = 0;
      const vidPromise = videoRef.current.play();
      if (vidPromise !== undefined) {
        vidPromise.catch(err => {
          console.warn('Video playback warning:', err);
        });
      }
    }
  }, [currentTrack, isMuted, volume]);

  // Finish game session & save results
  const finishGame = useCallback(() => {
    setIsPlaying(false);
    setIsGameOver(true);
    if (audioRef.current) audioRef.current.pause();
    if (videoRef.current) videoRef.current.pause();

    sound.playFanfare();
    confetti({ particleCount: 140, spread: 85, origin: { y: 0.6 } });

    // Save to IndexedDB Play History
    const finalRank = getRank(scorePercentage);
    const historyRecord: MajmajHistoryItem = {
      id: `history_${Date.now()}`,
      trackId: currentTrack.id,
      trackTitle: currentTrack.title,
      difficulty: currentTrack.difficulty,
      level: currentTrack.level,
      accuracy: Math.round(scorePercentage * 1000) / 1000,
      rank: finalRank,
      dxScore,
      maxCombo,
      critical: stats.critical,
      perfect: stats.perfect,
      great: stats.great,
      good: stats.good,
      miss: stats.miss,
      playedAt: Date.now()
    };

    savePlayHistory(historyRecord).then(() => {
      refreshHistory();
    });
  }, [currentTrack, scorePercentage, dxScore, maxCombo, stats, refreshHistory]);

  // Visual effects extraction
  const triggerHitVisuals = useCallback((buttonId: number, judge: Judgement, isBreak: boolean, isSlide: boolean) => {
    setButtonJudgeTheme(prev => ({
      ...prev,
      [buttonId]: { judge, isBreak }
    }));

    const btnConf = BUTTON_CONFIG.find(b => b.id === buttonId);
    if (btnConf) {
      const rad = (btnConf.angle * Math.PI) / 180;
      const xPercent = 50 + Math.cos(rad) * 42;
      const yPercent = 50 + Math.sin(rad) * 42;

      const numParticles = isBreak ? 10 : 8;
      const particles = Array.from({ length: numParticles }, (_, i) => {
        const pAngle = (i / numParticles) * Math.PI * 2 + (Math.random() * 0.35 - 0.175);
        const dist = isBreak ? 30 + Math.random() * 32 : 22 + Math.random() * 26;
        const pColor = isBreak
          ? (i % 2 === 0 ? '#fbbf24' : '#f43f5e')
          : judge === 'CRITICAL'
          ? (i % 2 === 0 ? '#fde047' : '#f59e0b')
          : judge === 'PERFECT'
          ? '#fb923c'
          : judge === 'GREAT'
          ? '#34d399'
          : '#38bdf8';

        return {
          id: i,
          dx: `${Math.cos(pAngle) * dist}px`,
          dy: `${Math.sin(pAngle) * dist}px`,
          size: isBreak ? (i % 2 === 0 ? 5.5 : 3.5) : (i % 2 === 0 ? 4.5 : 2.5),
          color: pColor,
        };
      });

      const hitId = Date.now() + Math.random();
      setHitVisuals(prev => [
        ...prev.slice(-12),
        { id: hitId, button: buttonId, xPercent, yPercent, judge, isBreak, isSlide, particles }
      ]);

      setTimeout(() => {
        setHitVisuals(prev => prev.filter(h => h.id !== hitId));
      }, 460);

      if (isBreak) {
        setScreenFlash({ id: Date.now(), color: 'rgba(245, 158, 11, 0.35)' });
        setTimeout(() => setScreenFlash(null), 250);
      }
    }
  }, []);

  const scoreNote = useCallback((judge: Judgement, isBreak: boolean, buttonId: number, isAuto: boolean) => {
    let pts = 0;
    let dxPts = 0;

    if (judge === 'MISS') {
      setCombo(0);
      setRecentJudgement({ text: 'MISS', id: Date.now() });
      sound.playMiss();
      setStats(prev => ({ ...prev, miss: prev.miss + 1 }));
      setScreenFlash({ id: Date.now(), color: 'rgba(244, 63, 94, 0.28)' });
      setTimeout(() => setScreenFlash(null), 240);
      return;
    }

    if (judge === 'CRITICAL') {
      pts = 101; dxPts = 3;
    } else if (judge === 'PERFECT') {
      pts = 100; dxPts = 2;
    } else if (judge === 'GREAT') {
      pts = 80; dxPts = 1;
    } else if (judge === 'GOOD') {
      pts = 50; dxPts = 0;
    }

    triggerHitVisuals(buttonId, judge, isBreak, false);
    setRecentJudgement({ text: judge, id: Date.now() });

    setCombo(prev => {
      const next = prev + 1;
      setMaxCombo(m => Math.max(m, next));
      if (next === 50 || (next >= 100 && next % 100 === 0)) {
        setComboMilestone({ id: Date.now(), text: `${next} COMBO!`, count: next });
        setScreenFlash({ id: Date.now(), color: 'rgba(236, 72, 153, 0.32)' });
        setTimeout(() => setComboMilestone(null), 1200);
      }
      return next;
    });

    setStats(prev => {
      const key = judge.toLowerCase() as keyof typeof prev;
      return { ...prev, [key]: prev[key] + 1 };
    });

    setScorePercentage(prev => {
      const total = currentTrack?.notes.length || 1;
      const add = pts / total;
      const nextScore = Math.min(101.0, prev + add);
      if (nextScore > highScore) {
        onUpdateHighScore(currentTrack.id, Math.round(nextScore * 1000) / 1000);
      }
      return nextScore;
    });
    setDxScore(prev => prev + dxPts);
  }, [triggerHitVisuals, currentTrack, highScore, onUpdateHighScore]);

  // Handle Note Hit Judgement
  const handleHit = useCallback((buttonId: number, isAuto = false) => {
    if (!isPlaying || isPaused) return;

    sound.unlock();
    const nowSec = audioRef.current && !audioRef.current.paused
      ? audioRef.current.currentTime + (offsetMs / 1000)
      : (performance.now() - startTimeRef.current) / 1000 + (offsetMs / 1000);
    const HIT_WINDOW = 0.18;
    const target = liveNotesRef.current.find(
      item => !item.judged && item.note.button === buttonId && Math.abs(nowSec - item.note.time) <= HIT_WINDOW
    );

    if (target) {
      const diff = Math.abs(nowSec - target.note.time);
      let judge: Judgement = 'MISS';

      if (diff <= 0.04 || isAuto) {
        judge = 'CRITICAL';
        target.note.isBreak ? sound.playMaimaiBreak() : sound.playMaimaiTap(true);
      } else if (diff <= 0.08) {
        judge = 'PERFECT';
        target.note.isBreak ? sound.playMaimaiBreak() : sound.playMaimaiTap(false);
      } else if (diff <= 0.13) {
        judge = 'GREAT';
        sound.playMaimaiTap(false);
      } else {
        judge = 'GOOD';
        sound.playMaimaiTap(false);
      }

      if (target.note.type === 'slide') {
        sound.playMaimaiSlide();
      }

      if (target.note.type === 'hold') {
        target.holding = true;
        target.startJudge = judge;
        triggerHitVisuals(buttonId, judge, !!target.note.isBreak, false);
      } else {
        target.judged = true;
        scoreNote(judge, !!target.note.isBreak, buttonId, isAuto);
      }
    }
  }, [isPlaying, isPaused, offsetMs, scoreNote, triggerHitVisuals]);

  // Toggle pause
  const togglePause = useCallback(() => {
    setIsPaused(p => {
      const next = !p;
      if (next) {
        if (audioRef.current) audioRef.current.pause();
        if (videoRef.current) videoRef.current.pause();
      } else {
        if (audioRef.current && currentTrack.audioUrl) {
          audioRef.current.play().catch(() => {});
        }
        if (videoRef.current && currentTrack.videoUrl) {
          videoRef.current.play().catch(() => {});
        }
      }
      return next;
    });
  }, [currentTrack]);

  // Keyboard Event Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const btn = keyMapRef.current[e.key];
      if (btn) {
        activeButtonsRef.current[btn] = true;
        setActiveButtons(prev => ({ ...prev, [btn]: true }));
        handleHit(btn);
      }
      if (e.code === 'Space' && isPlaying) togglePause();
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      const btn = keyMapRef.current[e.key];
      if (btn) {
        activeButtonsRef.current[btn] = false;
        setActiveButtons(prev => ({ ...prev, [btn]: false }));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    }
  }, [handleHit, isPlaying, togglePause]);

  // Main Render Loop for Majmaj circular track
  useEffect(() => {
    if (!isPlaying || isPaused) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      const centerX = width / 2;
      const centerY = height / 2;
      const outerRadius = Math.min(width, height) * 0.42;
      const innerRadius = outerRadius * 0.28;

      ctx.clearRect(0, 0, width, height);

      const nowSec = audioRef.current && !audioRef.current.paused
        ? audioRef.current.currentTime + (offsetMs / 1000)
        : (performance.now() - startTimeRef.current) / 1000 + (offsetMs / 1000);

      // Synthesizer beats if no external audio
      if (!currentTrack.audioUrl && currentTrack.bpm > 0 && nowSec >= 0) {
        const beatDuration = 60 / currentTrack.bpm;
        const currentBeatIndex = Math.floor(nowSec / beatDuration);
        if (currentBeatIndex !== lastBeatIndexRef.current && currentBeatIndex >= 0) {
          lastBeatIndexRef.current = currentBeatIndex;
          sound.playSynthBeat(currentTrack.bpm, currentBeatIndex);
        }
      }

      // Draw Rings & Radial Guides
      ctx.save();
      // Outer Glowing Ring
      ctx.beginPath();
      ctx.arc(centerX, centerY, outerRadius, 0, Math.PI * 2);
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 14;
      ctx.stroke();

      // Inner Ring
      ctx.beginPath();
      ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
      ctx.strokeStyle = '#ec4899';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#ec4899';
      ctx.shadowBlur = 10;
      ctx.stroke();

      // 8 Radial sensor zones
      BUTTON_CONFIG.forEach(b => {
        const rad = (b.angle * Math.PI) / 180;
        const x1 = centerX + Math.cos(rad) * innerRadius;
        const y1 = centerY + Math.sin(rad) * innerRadius;
        const x2 = centerX + Math.cos(rad) * outerRadius;
        const y2 = centerY + Math.sin(rad) * outerRadius;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.stroke();

        const isPressed = activeButtons[b.id];
        ctx.beginPath();
        ctx.arc(x2, y2, isPressed ? 20 : 16, 0, Math.PI * 2);
        ctx.fillStyle = isPressed ? '#ec4899' : '#0f172a';
        ctx.fill();
        ctx.strokeStyle = isPressed ? '#ffffff' : '#38bdf8';
        ctx.lineWidth = isPressed ? 3.5 : 2;
        ctx.shadowColor = isPressed ? '#f43f5e' : '#38bdf8';
        ctx.shadowBlur = isPressed ? 20 : 8;
        ctx.stroke();
      });
      ctx.restore();

      // Travel logic
      const travelDuration = 2.4 / (hiSpeed || 3.5);
      let unjudgedCount = 0;

      liveNotesRef.current.forEach(item => {
        if (item.judged) return;
        unjudgedCount++;

        const timeDiff = item.note.time - nowSec;
        const endTime = item.note.time + (item.note.duration || 0);
        const endDiff = endTime - nowSec;

        if (isAutoPlay) {
          if (timeDiff <= 0 && !item.holding) {
            if (item.note.type === 'hold') {
              item.holding = true;
              item.startJudge = 'CRITICAL';
              triggerHitVisuals(item.note.button, 'CRITICAL', !!item.note.isBreak, false);
            } else {
              handleHit(item.note.button, true);
              return;
            }
          }
          if (item.note.type === 'hold' && item.holding && endDiff <= 0) {
            item.judged = true;
            scoreNote('CRITICAL', !!item.note.isBreak, item.note.button, true);
            return;
          }
        }

        if (item.note.type === 'hold') {
          if (item.holding) {
            if (!activeButtonsRef.current[item.note.button] && !isAutoPlay) {
              item.judged = true;
              const earlyBy = endDiff;
              let endJudge: Judgement = 'MISS';
              if (earlyBy <= 0.1) endJudge = 'CRITICAL';
              else if (earlyBy <= 0.2) endJudge = 'PERFECT';
              else if (earlyBy <= 0.3) endJudge = 'GREAT';
              else if (earlyBy <= 0.4) endJudge = 'GOOD';
              
              const startRankNum = item.startJudge === 'CRITICAL' ? 4 : item.startJudge === 'PERFECT' ? 3 : item.startJudge === 'GREAT' ? 2 : item.startJudge === 'GOOD' ? 1 : 0;
              const endRankNum = endJudge === 'CRITICAL' ? 4 : endJudge === 'PERFECT' ? 3 : endJudge === 'GREAT' ? 2 : endJudge === 'GOOD' ? 1 : 0;
              const finalRankNum = Math.min(startRankNum, endRankNum);
              let finalJudge: Judgement = 'MISS';
              if (finalRankNum === 4) finalJudge = 'CRITICAL';
              else if (finalRankNum === 3) finalJudge = 'PERFECT';
              else if (finalRankNum === 2) finalJudge = 'GREAT';
              else if (finalRankNum === 1) finalJudge = 'GOOD';

              scoreNote(finalJudge, !!item.note.isBreak, item.note.button, false);
              return;
            } else if (endDiff <= 0) {
              item.judged = true;
              scoreNote(item.startJudge || 'CRITICAL', !!item.note.isBreak, item.note.button, false);
              return;
            }
          } else {
            if (timeDiff < -0.16) {
              item.judged = true;
              scoreNote('MISS', !!item.note.isBreak, item.note.button, false);
              return;
            }
          }
        } else {
          if (timeDiff < -0.16) {
            item.judged = true;
            scoreNote('MISS', !!item.note.isBreak, item.note.button, false);
            return;
          }
        }

        const btnConf = BUTTON_CONFIG.find(b => b.id === item.note.button);
        if (!btnConf) return;
        const rad = (btnConf.angle * Math.PI) / 180;

        if (item.note.type === 'hold') {
          const headProgress = 1 - timeDiff / travelDuration;
          const tailProgress = 1 - endDiff / travelDuration;
          
          if (tailProgress <= 1.08 && headProgress >= 0) {
            const headClamped = Math.max(0, Math.min(1.08, headProgress));
            const tailClamped = Math.max(0, Math.min(1.08, tailProgress));
            
            const actualHeadProgress = item.holding ? 1.0 : headClamped;
            const rHead = innerRadius + (outerRadius - innerRadius) * actualHeadProgress;
            const rTail = innerRadius + (outerRadius - innerRadius) * tailClamped;
            
            const hX = centerX + Math.cos(rad) * rHead;
            const hY = centerY + Math.sin(rad) * rHead;
            const tX = centerX + Math.cos(rad) * rTail;
            const tY = centerY + Math.sin(rad) * rTail;
            
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(tX, tY);
            ctx.lineTo(hX, hY);
            ctx.lineWidth = 14;
            ctx.strokeStyle = item.holding ? 'rgba(234, 179, 8, 0.85)' : 'rgba(234, 179, 8, 0.4)';
            ctx.lineCap = 'round';
            ctx.shadowColor = '#eab308';
            ctx.shadowBlur = item.holding ? 12 : 0;
            ctx.stroke();
            
            if (!item.holding) {
               ctx.beginPath();
               ctx.arc(hX, hY, 16, 0, Math.PI * 2);
               ctx.fillStyle = '#eab308';
               ctx.fill();
               ctx.lineWidth = 3;
               ctx.strokeStyle = '#fef9c3';
               ctx.shadowColor = '#eab308';
               ctx.shadowBlur = 12;
               ctx.stroke();
            }
            ctx.restore();
          }
        } else {
          if (timeDiff <= travelDuration && timeDiff >= -0.16) {
            const progress = 1 - timeDiff / travelDuration;
            const currentRadius = innerRadius + (outerRadius - innerRadius) * Math.max(0, Math.min(1.08, progress));
            const noteX = centerX + Math.cos(rad) * currentRadius;
            const noteY = centerY + Math.sin(rad) * currentRadius;

            ctx.save();
            if (item.note.isBreak) {
              ctx.beginPath();
              ctx.arc(noteX, noteY, 18, 0, Math.PI * 2);
              ctx.fillStyle = '#f59e0b';
              ctx.fill();
              ctx.lineWidth = 3;
              ctx.strokeStyle = '#fef08a';
              ctx.shadowColor = '#fbbf24';
              ctx.shadowBlur = 18;
              ctx.stroke();

              ctx.beginPath();
              ctx.arc(noteX, noteY, 6, 0, Math.PI * 2);
              ctx.fillStyle = '#ffffff';
              ctx.fill();
            } else if (item.note.type === 'slide') {
              ctx.beginPath();
              ctx.arc(noteX, noteY, 16, 0, Math.PI * 2);
              ctx.fillStyle = '#06b6d4';
              ctx.fill();
              ctx.lineWidth = 3;
              ctx.strokeStyle = '#cffafe';
              ctx.shadowColor = '#06b6d4';
              ctx.shadowBlur = 14;
              ctx.stroke();

              if (item.note.endButton) {
                const endConf = BUTTON_CONFIG.find(b => b.id === item.note.endButton);
                if (endConf) {
                  const endRad = (endConf.angle * Math.PI) / 180;
                  const endX = centerX + Math.cos(endRad) * outerRadius;
                  const endY = centerY + Math.sin(endRad) * outerRadius;
                  ctx.beginPath();
                  ctx.moveTo(noteX, noteY);
                  ctx.lineTo(endX, endY);
                  ctx.strokeStyle = 'rgba(6, 182, 212, 0.45)';
                  ctx.lineWidth = 2;
                  ctx.setLineDash([4, 4]);
                  ctx.stroke();
                  ctx.setLineDash([]);
                }
              }
            } else {
              ctx.beginPath();
              ctx.arc(noteX, noteY, 15, 0, Math.PI * 2);
              ctx.fillStyle = '#ec4899';
              ctx.fill();
              ctx.lineWidth = 3;
              ctx.strokeStyle = '#fdf2f8';
              ctx.shadowColor = '#f43f5e';
              ctx.shadowBlur = 12;
              ctx.stroke();

              ctx.beginPath();
              ctx.arc(noteX, noteY, 5, 0, Math.PI * 2);
              ctx.fillStyle = '#ffffff';
              ctx.fill();
            }
            ctx.restore();
          }
        }
      });

      if (unjudgedCount === 0 && nowSec > (currentTrack.notes[currentTrack.notes.length - 1]?.time || 0) + 1.5) {
        finishGame();
        return;
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, isPaused, hiSpeed, offsetMs, currentTrack, isAutoPlay, handleHit, activeButtons, finishGame]);

  // Handle AstroDX ZIP/ADX archives, Folders, and Multi-Files Upload
  const processSelectedFiles = async (files: FileList | File[]) => {
    try {
      setImportStatus('Đang đọc các tệp tin...');
      const fileList = Array.from(files);

      // Check if user selected an AstroDX zip or .adx archive
      const archiveFile = fileList.find(f => {
        const n = f.name.toLowerCase();
        return n.endsWith('.zip') || n.endsWith('.adx');
      });

      if (archiveFile) {
        setImportStatus('Đang giải nén gói bài hát AstroDX (.zip/.adx)...');
        const zip = await JSZip.loadAsync(archiveFile);
        const entries = Object.values(zip.files).filter(entry => !entry.dir);

        // Find chart file with priority for maidata.txt
        const chartEntry = entries.find(e => e.name.toLowerCase().endsWith('maidata.txt') || e.name.toLowerCase().includes('maidata'))
          || entries.find(e => e.name.toLowerCase().includes('inote'))
          || entries.find(e => e.name.toLowerCase().endsWith('.simai') || e.name.toLowerCase().endsWith('.maidata'))
          || entries.find(e => {
            const n = e.name.toLowerCase();
            return n.endsWith('.txt') && !n.includes('readme') && !n.includes('info') && !n.includes('credit') && !n.includes('license');
          })
          || entries.find(e => e.name.toLowerCase().endsWith('.txt'));

        // Find audio file with priority
        const audioEntry = entries.find(e => {
          const n = e.name.toLowerCase();
          return (n.includes('track') || n.includes('music') || n.includes('audio') || n.includes('song') || n.includes('bgm')) &&
            (n.endsWith('.mp3') || n.endsWith('.ogg') || n.endsWith('.wav') || n.endsWith('.m4a') || n.endsWith('.flac'));
        }) || entries.find(e => {
          const n = e.name.toLowerCase();
          return n.endsWith('.mp3') || n.endsWith('.ogg') || n.endsWith('.wav') || n.endsWith('.m4a') || n.endsWith('.flac');
        });

        // Find video file with priority
        const videoEntry = entries.find(e => {
          const n = e.name.toLowerCase();
          return (n.includes('videoplayback') || n.includes('pv') || n.includes('bg') || n.includes('movie') || n.includes('bga')) &&
            (n.endsWith('.mp4') || n.endsWith('.webm') || n.endsWith('.mov'));
        }) || entries.find(e => {
          const n = e.name.toLowerCase();
          return n.endsWith('.mp4') || n.endsWith('.webm') || n.endsWith('.mov');
        });

        if (!chartEntry) {
          setImportStatus('Không tìm thấy tệp maidata.txt bên trong gói .zip/.adx.');
          return;
        }

        const chartBuf = await chartEntry.async('arraybuffer');
        const chartText = await readFileAsSimaiText(new File([chartBuf], chartEntry.name));

        const audioBlob = audioEntry ? await audioEntry.async('blob') : undefined;
        const videoBlob = videoEntry ? await videoEntry.async('blob') : undefined;

        setFolderFilesFound({
          chartName: chartEntry.name,
          audioName: audioEntry ? audioEntry.name : undefined,
          videoName: videoEntry ? videoEntry.name : undefined
        });

        const parsed = parseMaidataHeader(chartText);
        if (parsed.charts.length === 0) {
          setImportStatus('Đã giải nén maidata.txt nhưng không tìm thấy nốt nào (&inote_1..&inote_7). Vui lòng kiểm tra lại file!');
          return;
        }

        setParsedChartData({
          chartText,
          audioBlob,
          videoBlob,
          title: parsed.title || archiveFile.name.replace(/\.[^/.]+$/, ''),
          artist: parsed.artist || 'AstroDX Track',
          bpm: parsed.bpm || 150,
          offset: parsed.offset || 0,
          charts: parsed.charts
        });

        const masterIdx = parsed.charts.findIndex(c => c.difficulty === 'MASTER');
        setSelectedDifficultyIdx(masterIdx !== -1 ? masterIdx : parsed.charts.length - 1);

        setImportStatus(
          `Đọc thành công gói AstroDX: "${parsed.title}" (Tìm thấy ${parsed.charts.length} độ khó, BPM ${parsed.bpm}). ${
            audioBlob ? '✓ Có Audio' : '⚠ Không có Audio'
          } ${videoBlob ? '✓ Có Video' : ''}`
        );
        return;
      }

      // Regular folder or separate files with priority
      const chartFile = fileList.find(f => f.name.toLowerCase().endsWith('maidata.txt') || f.name.toLowerCase().includes('maidata'))
        || fileList.find(f => f.name.toLowerCase().includes('inote'))
        || fileList.find(f => f.name.toLowerCase().endsWith('.simai') || f.name.toLowerCase().endsWith('.maidata'))
        || fileList.find(f => {
          const n = f.name.toLowerCase();
          return (n.endsWith('.txt') || f.type === 'text/plain') &&
            !n.includes('readme') && !n.includes('info') && !n.includes('credit') && !n.includes('license');
        })
        || fileList.find(f => f.name.toLowerCase().endsWith('.txt') || f.type === 'text/plain');

      const audioFile = fileList.find(f => {
        const n = f.name.toLowerCase();
        return (n.includes('track') || n.includes('music') || n.includes('audio') || n.includes('song') || n.includes('bgm')) &&
          (n.endsWith('.mp3') || n.endsWith('.ogg') || n.endsWith('.wav') || n.endsWith('.m4a') || n.endsWith('.flac') || f.type.startsWith('audio/'));
      }) || fileList.find(f => {
        const n = f.name.toLowerCase();
        return n.endsWith('.mp3') || n.endsWith('.ogg') || n.endsWith('.wav') || n.endsWith('.m4a') || n.endsWith('.flac') || f.type.startsWith('audio/');
      });

      const videoFile = fileList.find(f => {
        const n = f.name.toLowerCase();
        return (n.includes('videoplayback') || n.includes('pv') || n.includes('bg') || n.includes('movie') || n.includes('bga')) &&
          (n.endsWith('.mp4') || n.endsWith('.webm') || n.endsWith('.mov') || f.type.startsWith('video/'));
      }) || fileList.find(f => {
        const n = f.name.toLowerCase();
        return n.endsWith('.mp4') || n.endsWith('.webm') || n.endsWith('.mov') || f.type.startsWith('video/');
      });

      setFolderFilesFound({
        chartName: chartFile ? (chartFile as File).name : undefined,
        audioName: audioFile ? (audioFile as File).name : undefined,
        videoName: videoFile ? (videoFile as File).name : undefined
      });

      if (!chartFile) {
        setImportStatus('Không tìm thấy tệp .txt / maidata.txt trong thư mục hoặc danh sách file. Vui lòng kiểm tra lại!');
        return;
      }

      // Read text with encoding fallback (UTF-16, UTF-8, Shift-JIS, GBK)
      const chartText = await readFileAsSimaiText(chartFile as File);
      const parsed = parseMaidataHeader(chartText);

      if (parsed.charts.length === 0) {
        setImportStatus('Đã đọc file nhưng không tìm thấy đoạn nốt nào (&inote_1..&inote_7). Hãy kiểm tra lại định dạng tệp!');
        return;
      }

      setParsedChartData({
        chartText,
        audioBlob: audioFile ? (audioFile as File) : undefined,
        videoBlob: videoFile ? (videoFile as File) : undefined,
        title: parsed.title || (chartFile as File).name.replace(/\.[^/.]+$/, ''),
        artist: parsed.artist || 'Simai Custom',
        bpm: parsed.bpm || 150,
        offset: parsed.offset || 0,
        charts: parsed.charts
      });

      // Default selection to MASTER if available, otherwise the highest difficulty chart
      const masterIdx = parsed.charts.findIndex(c => c.difficulty === 'MASTER');
      setSelectedDifficultyIdx(masterIdx !== -1 ? masterIdx : parsed.charts.length - 1);

      setImportStatus(
        `Đọc thành công: "${parsed.title}" (Tìm thấy ${parsed.charts.length} độ khó, BPM ${parsed.bpm}). ${
          audioFile ? '✓ Có Audio' : '⚠ Không có Audio'
        } ${videoFile ? '✓ Có Video BGA' : ''}`
      );
    } catch (err) {
      console.error(err);
      setImportStatus('Lỗi khi đọc file: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Handle direct Simai code pasting
  const handleParsePastedCode = () => {
    if (!pastedSimaiCode.trim()) return;
    try {
      setImportStatus('Đang phân tích mã Simai...');
      const parsed = parseMaidataHeader(pastedSimaiCode);
      if (parsed.charts.length === 0) {
        setImportStatus('Không tìm thấy nốt nào trong đoạn mã đã dán. Vui lòng kiểm tra lại cú pháp Simai!');
        return;
      }

      setFolderFilesFound({
        chartName: 'Mã Simai dán trực tiếp'
      });

      setParsedChartData({
        chartText: pastedSimaiCode,
        title: parsed.title || 'Mã Simai Tự Tạo',
        artist: parsed.artist || 'Custom Simai',
        bpm: parsed.bpm || 150,
        offset: parsed.offset || 0,
        charts: parsed.charts
      });

      const masterIdx = parsed.charts.findIndex(c => c.difficulty === 'MASTER');
      setSelectedDifficultyIdx(masterIdx !== -1 ? masterIdx : parsed.charts.length - 1);
      setImportStatus(`Đã phân tích thành công: ${parsed.charts.length} độ khó (BPM ${parsed.bpm})!`);
    } catch (err) {
      setImportStatus('Lỗi phân tích: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Save parsed track into IndexedDB permanently
  const handleConfirmSaveTrack = async () => {
    if (!parsedChartData || parsedChartData.charts.length === 0) return;

    try {
      setImportStatus('Đang lưu bài hát và media vào IndexedDB...');
      const chosenChart = parsedChartData.charts[selectedDifficultyIdx] || parsedChartData.charts[0];

      const notes = (chosenChart.parsedNotes && chosenChart.parsedNotes.length > 0)
        ? chosenChart.parsedNotes
        : parseSimaiToNotes(chosenChart.rawCode, parsedChartData.bpm, parsedChartData.offset);

      if (notes.length === 0) {
        alert('Không tìm thấy nốt nào trong chart độ khó đã chọn. Vui lòng chọn một độ khó khác!');
        return;
      }

      const trackId = `majmaj_custom_${Date.now()}`;
      await saveCustomTrack(
        {
          id: trackId,
          title: parsedChartData.title,
          artist: parsedChartData.artist,
          bpm: parsedChartData.bpm,
          difficulty: chosenChart.difficulty,
          level: chosenChart.level,
          jacketColor: 'from-emerald-600 via-cyan-700 to-black',
          notes,
          totalNotes: notes.length
        },
        parsedChartData.audioBlob,
        parsedChartData.videoBlob
      );

      await refreshCustomTracks();
      setSelectedTrackIndex(0);
      setShowImportModal(false);
      setParsedChartData(null);
      setFolderFilesFound({});
      setPastedSimaiCode('');
      setImportStatus('');
      alert(`Đã lưu bài hát "${parsedChartData.title}" (${chosenChart.difficulty} ${chosenChart.level}, ${notes.length} nốt) thành công vào kho lưu trữ!`);
    } catch (err) {
      console.error(err);
      alert('Lỗi lưu trữ: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Delete custom track
  const handleDeleteTrack = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Bạn có chắc chắn muốn xóa bài hát này khỏi kho lưu trữ?')) {
      await deleteCustomTrack(id);
      await refreshCustomTracks();
      setSelectedTrackIndex(0);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#080811] text-white select-none">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b border-cyan-900/40 bg-[#0d0f1d]/85 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="px-3 py-1.5 text-xs font-cyber tracking-wider uppercase bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded border border-cyan-500/30 transition-all flex items-center gap-1.5"
          >
            ← Arcade Hub
          </button>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></span>
            <h1 className="font-arcade text-xs sm:text-sm text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-pink-400 to-amber-300">
              MAJMAJ DX
            </h1>
            <span className="text-[10px] font-cyber px-2 py-0.5 rounded bg-pink-500/20 text-pink-400 border border-pink-500/30 hidden sm:inline">
              ARCADE V3
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* History Button */}
          <button
            onClick={() => setShowHistoryModal(true)}
            className="px-2.5 py-1.5 text-xs font-cyber bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 flex items-center gap-1.5 transition-all"
            title="Xem lịch sử kết quả chơi"
          >
            <History className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Lịch Sử ({historyList.length})</span>
          </button>

          {/* Import Folder / Files */}
          <button
            onClick={() => setShowImportModal(true)}
            className="px-2.5 py-1.5 text-xs font-cyber bg-cyan-950 hover:bg-cyan-900 text-cyan-300 rounded border border-cyan-500/40 flex items-center gap-1.5 shadow-sm transition-all"
          >
            <FolderUp className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Nạp Thư Mục Majmaj</span>
          </button>

          {/* Auto Play Toggle */}
          <button
            onClick={() => setIsAutoPlay(p => !p)}
            className={`px-2.5 py-1.5 text-xs font-cyber rounded border transition-all flex items-center gap-1 ${
              isAutoPlay
                ? 'bg-amber-500/20 text-amber-300 border-amber-500 shadow-amber-500/20 shadow-md'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Auto {isAutoPlay ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </div>

      {/* Main Game Stage */}
      <div className="flex-1 flex flex-col lg:flex-row items-center justify-center p-2 sm:p-4 gap-4 overflow-hidden relative">
        {/* Left Side: Track Selector & Adjustments */}
        <div className="w-full lg:w-72 flex flex-col gap-3 order-2 lg:order-1 max-h-[35vh] lg:max-h-full overflow-y-auto pr-1">
          {/* Active Track Card */}
          <div className="bg-[#101326] border border-cyan-500/30 rounded-xl p-3.5 shadow-lg relative overflow-hidden">
            <div className={`absolute -right-8 -top-8 w-28 h-28 bg-gradient-to-br ${currentTrack.jacketColor} opacity-25 blur-xl rounded-full`}></div>
            
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-cyber uppercase tracking-wider text-cyan-400/80 font-bold">
                Bài Hát Đang Chọn
              </span>
              {currentTrack.hasVideo && (
                <span className="text-[9px] font-cyber px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1">
                  <Film className="w-2.5 h-2.5" />
                  BGA Video
                </span>
              )}
            </div>

            <h2 className="text-base font-bold font-cyber text-slate-100 truncate mt-0.5">
              {currentTrack.title}
            </h2>
            <p className="text-xs text-slate-400 font-cyber truncate">{currentTrack.artist}</p>

            <div className="flex items-center gap-1.5 mt-2.5 text-xs font-cyber flex-wrap">
              <span className="px-2 py-0.5 rounded bg-pink-500/20 text-pink-300 border border-pink-500/40 font-bold">
                {currentTrack.difficulty} {currentTrack.level}
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                BPM {currentTrack.bpm}
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300">
                {currentTrack.notes.length} Notes
              </span>
            </div>

            {/* Song Switcher */}
            {!isPlaying && (
              <div className="mt-3 pt-3 border-t border-slate-800/80">
                <label className="text-[11px] font-cyber text-slate-400 block mb-1.5">
                  Kho bài hát ({tracks.length}):
                </label>
                <div className="flex flex-col gap-1 max-h-32 overflow-y-auto pr-1">
                  {tracks.map((t, idx) => (
                    <div
                      key={t.id}
                      onClick={() => {
                        setSelectedTrackIndex(idx);
                        setIsGameOver(false);
                      }}
                      className={`text-xs font-cyber px-2.5 py-1.5 rounded transition-all flex items-center justify-between cursor-pointer ${
                        selectedTrackIndex === idx
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          : 'bg-slate-900/70 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        {t.isCustom && <span className="text-amber-400 text-[9px] font-bold">[CUSTOM]</span>}
                        <span className="truncate">{t.title}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-1">
                        {t.hasVideo && <Film className="w-3 h-3 text-purple-400" />}
                        {t.isCustom && (
                          <button
                            onClick={e => handleDeleteTrack(t.id, e)}
                            className="p-1 hover:text-rose-400 text-slate-500"
                            title="Xóa bài hát này"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Speed, Offset & BGA Brightness */}
          <div className="bg-[#101326] border border-slate-800 rounded-xl p-3 text-xs font-cyber space-y-2.5">
            <div className="flex items-center justify-between text-slate-300">
              <span>Tốc độ nốt (Hi-Speed):</span>
              <span className="text-cyan-400 font-bold text-sm">{hiSpeed.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="1.0"
              max="7.0"
              step="0.5"
              value={hiSpeed}
              onChange={e => setHiSpeed(parseFloat(e.target.value))}
              className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded cursor-pointer"
            />

            <div className="flex items-center justify-between text-slate-300 pt-1">
              <span>Độ trễ (Audio Offset):</span>
              <span className="text-pink-400 font-bold">{offsetMs > 0 ? `+${offsetMs}` : offsetMs} ms</span>
            </div>
            <input
              type="range"
              min="-150"
              max="150"
              step="10"
              value={offsetMs}
              onChange={e => setOffsetMs(parseInt(e.target.value))}
              className="w-full accent-pink-400 h-1.5 bg-slate-800 rounded cursor-pointer"
            />

            {currentTrack.hasVideo && (
              <>
                <div className="flex items-center justify-between text-slate-300 pt-1">
                  <span>Độ sáng Video BGA:</span>
                  <span className="text-purple-400 font-bold">{Math.round(bgaBrightness * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.1"
                  value={bgaBrightness}
                  onChange={e => setBgaBrightness(parseFloat(e.target.value))}
                  className="w-full accent-purple-400 h-1.5 bg-slate-800 rounded cursor-pointer"
                />
              </>
            )}
          </div>

          {/* Audio & Sound Settings */}
          <div className="bg-[#101326] border border-slate-800 rounded-xl p-3 text-xs font-cyber space-y-2.5">
            <div className="flex items-center justify-between text-slate-200">
              <span className="font-bold flex items-center gap-1.5 text-cyan-400">
                <Volume2 className="w-3.5 h-3.5" />
                Âm Lượng & Loa:
              </span>
              <button
                onClick={() => {
                  sound.unlock();
                  sound.playTestSound();
                }}
                className="px-2 py-0.5 rounded bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/40 text-[10px] text-cyan-300 font-bold transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                title="Bấm để phát thử âm thanh Tap và Break"
              >
                <Zap className="w-2.5 h-2.5 text-yellow-400" />
                Thử tiếng
              </button>
            </div>

            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1">
                <button
                  onClick={() => setIsMuted(m => !m)}
                  className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title={isMuted ? 'Bật âm thanh' : 'Tắt tiếng'}
                >
                  {isMuted ? (
                    <VolumeX className="w-4 h-4 text-rose-400" />
                  ) : (
                    <Volume1 className="w-4 h-4 text-cyan-400" />
                  )}
                </button>
                <span>Âm lượng:</span>
              </span>
              <span className="text-cyan-400 font-bold">{isMuted ? 'Đang tắt' : `${volume}%`}</span>
            </div>

            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={isMuted ? 0 : volume}
              onChange={e => {
                if (isMuted) setIsMuted(false);
                setVolume(parseInt(e.target.value));
              }}
              className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded cursor-pointer"
            />

            <div className="text-[10px] p-1.5 rounded bg-slate-900/80 border border-slate-800/80 text-slate-400">
              {currentTrack.audioUrl ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                  Nhạc phát từ file MP3 đã nạp
                </span>
              ) : (
                <span className="text-cyan-400 flex items-center gap-1">
                  <Music className="w-3 h-3 shrink-0" />
                  Nhạc EDM Synthesizer tự động
                </span>
              )}
            </div>
          </div>

          {/* Key Layout Guide */}
          <div className="bg-[#101326] border border-slate-800 rounded-xl p-2.5 text-[11px] font-cyber text-slate-400">
            <p className="font-bold text-slate-200 mb-1 flex items-center gap-1">
              <Zap className="w-3 h-3 text-amber-400" />
              Phím Vòng Tròn 8 Nút:
            </p>
            <div className="grid grid-cols-2 gap-1 text-[10px]">
              <div>1: <span className="text-cyan-300 font-bold">E / 1</span> (Góc trên phải)</div>
              <div>2: <span className="text-cyan-300 font-bold">D / 2</span> (Phải trên)</div>
              <div>3: <span className="text-cyan-300 font-bold">C / 3</span> (Phải dưới)</div>
              <div>4: <span className="text-cyan-300 font-bold">X / 4</span> (Góc dưới phải)</div>
              <div>5: <span className="text-cyan-300 font-bold">Z / 5</span> (Góc dưới trái)</div>
              <div>6: <span className="text-cyan-300 font-bold">A / 6</span> (Trái dưới)</div>
              <div>7: <span className="text-cyan-300 font-bold">Q / 7</span> (Trái trên)</div>
              <div>8: <span className="text-cyan-300 font-bold">W / 8</span> (Góc trên trái)</div>
            </div>
            <p className="text-[10px] text-cyan-300 mt-1 font-bold flex items-center gap-1">
              🖱️ Chơi chuột: Bấm chuột bất kỳ điểm nào trên vòng để Tap nốt!
            </p>
          </div>
        </div>

        {/* Center: Majmaj Arcade Ring Screen */}
        <div className="flex-1 flex flex-col items-center justify-center relative order-1 lg:order-2 w-full max-w-[560px] aspect-square">
          <div
            ref={ringContainerRef}
            onPointerDown={e => {
              sound.unlock();
              if (!ringContainerRef.current) return;
              const btn = getButtonFromCoords(e.clientX, e.clientY, ringContainerRef.current);
              if (btn) {
                pointersRef.current[e.pointerId] = btn;
                activeButtonsRef.current[btn] = true;
                setActiveButtons(prev => ({ ...prev, [btn]: true }));
                handleHit(btn);

                // Mouse tap ripple animation
                const rect = ringContainerRef.current.getBoundingClientRect();
                const rippleX = e.clientX - rect.left;
                const rippleY = e.clientY - rect.top;
                const ripId = Date.now() + Math.random();
                setRipples(prev => [...prev.slice(-8), { id: ripId, x: rippleX, y: rippleY, color: '#38bdf8' }]);
                setTimeout(() => {
                  setRipples(prev => prev.filter(r => r.id !== ripId));
                }, 450);
              }
            }}
            onPointerMove={e => {
              if (e.buttons === 0) return;
              if (!ringContainerRef.current) return;
              const btn = getButtonFromCoords(e.clientX, e.clientY, ringContainerRef.current);
              const lastBtn = pointersRef.current[e.pointerId];
              
              if (btn && btn !== lastBtn) {
                if (lastBtn) {
                  activeButtonsRef.current[lastBtn] = false;
                  setActiveButtons(prev => ({ ...prev, [lastBtn]: false }));
                }
                pointersRef.current[e.pointerId] = btn;
                activeButtonsRef.current[btn] = true;
                setActiveButtons(prev => ({ ...prev, [btn]: true }));
                handleHit(btn);
              } else if (!btn && lastBtn) {
                activeButtonsRef.current[lastBtn] = false;
                setActiveButtons(prev => ({ ...prev, [lastBtn]: false }));
                delete pointersRef.current[e.pointerId];
              }
            }}
            onPointerUp={e => {
              const lastBtn = pointersRef.current[e.pointerId];
              if (lastBtn) {
                activeButtonsRef.current[lastBtn] = false;
                setActiveButtons(prev => ({ ...prev, [lastBtn]: false }));
                delete pointersRef.current[e.pointerId];
              }
            }}
            onPointerLeave={e => {
              const lastBtn = pointersRef.current[e.pointerId];
              if (lastBtn) {
                activeButtonsRef.current[lastBtn] = false;
                setActiveButtons(prev => ({ ...prev, [lastBtn]: false }));
                delete pointersRef.current[e.pointerId];
              }
            }}
            className="relative w-full h-full flex items-center justify-center cursor-crosshair select-none touch-none"

          >
            {/* Visual Mouse Tap Ripples */}
            {ripples.map(r => (
              <span
                key={r.id}
                style={{
                  left: r.x,
                  top: r.y,
                  transform: 'translate(-50%, -50%)'
                }}
                className="absolute z-20 w-12 h-12 rounded-full border-2 border-cyan-400 bg-cyan-400/25 pointer-events-none animate-ping"
              />
            ))}

            {/* Screen Edge Flash Overlay on BREAK, Milestones, or MISS */}
            {screenFlash && (
              <div
                key={screenFlash.id}
                style={{ backgroundColor: screenFlash.color }}
                className="absolute inset-0 rounded-full pointer-events-none z-20 animate-screen-flash"
              />
            )}

            {/* Arcade Hit Visual Effects (Shrinking Ring, Burst, Particles, Floating Judgement Label) */}
            {hitVisuals.map(hit => {
              const isBreak = hit.isBreak;
              const ringColor = isBreak
                ? '#f59e0b'
                : hit.judge === 'CRITICAL'
                ? '#fde047'
                : hit.judge === 'PERFECT'
                ? '#fb923c'
                : hit.judge === 'GREAT'
                ? '#34d399'
                : '#38bdf8';

              return (
                <div
                  key={hit.id}
                  style={{
                    left: `${hit.xPercent}%`,
                    top: `${hit.yPercent}%`,
                  }}
                  className="absolute pointer-events-none z-30 transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
                >
                  {/* 1. Shrinking Target Ring (contracts onto sensor) */}
                  <div
                    style={{
                      borderColor: ringColor,
                      color: ringColor,
                    }}
                    className="absolute w-20 h-20 rounded-full border-2 animate-hit-shrink pointer-events-none"
                  />

                  {/* 2. Expanding Shockwave Burst Ring (explodes outwards) */}
                  <div
                    style={{
                      borderColor: isBreak ? '#fef08a' : ringColor,
                      boxShadow: `0 0 16px ${ringColor}`,
                      color: ringColor,
                    }}
                    className="absolute w-14 h-14 rounded-full border-2 animate-hit-burst pointer-events-none"
                  />

                  {/* 3. Inner Radiant Core Flash */}
                  <div
                    style={{
                      backgroundColor: isBreak ? '#fbbf24' : ringColor,
                      boxShadow: `0 0 20px ${ringColor}`,
                    }}
                    className="absolute w-10 h-10 rounded-full animate-hit-glow pointer-events-none"
                  />

                  {/* 4. Radial Particle Sparks */}
                  {hit.particles.map(p => (
                    <span
                      key={p.id}
                      style={{
                        ['--dx' as string]: p.dx,
                        ['--dy' as string]: p.dy,
                        width: `${p.size}px`,
                        height: `${p.size}px`,
                        backgroundColor: p.color,
                        boxShadow: `0 0 8px ${p.color}`,
                      } as React.CSSProperties}
                      className="absolute rounded-full animate-particle-fly pointer-events-none"
                    />
                  ))}

                  {/* 5. Floating Hit Judgement mini-label at sensor */}
                  <div
                    style={{
                      color: ringColor,
                      textShadow: `0 0 10px ${ringColor}`,
                    }}
                    className="absolute font-arcade text-[10px] font-extrabold whitespace-nowrap animate-hit-label tracking-wider pointer-events-none"
                  >
                    {isBreak ? '★ BREAK!' : hit.judge}
                  </div>
                </div>
              );
            })}

            <canvas
              ref={canvasRef}
              width={540}
              height={540}
              className="w-full h-full max-w-[540px] max-h-[540px] rounded-full shadow-2xl border-4 border-slate-900 bg-black z-10 pointer-events-none"
            />

            {/* Center Video Playback (BGA) inside ring */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-full overflow-hidden relative border border-cyan-500/40 shadow-inner flex items-center justify-center bg-[#0a0d1e]">
                {currentTrack.videoUrl && (
                  <video
                    ref={videoRef}
                    src={currentTrack.videoUrl}
                    playsInline
                    muted
                    loop
                    style={{ opacity: isPlaying ? bgaBrightness : 0.35 }}
                    className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
                  />
                )}

                {/* Center HUD Overlay */}
                <div className="relative z-20 w-full h-full flex flex-col items-center justify-center p-2 text-center bg-black/40 backdrop-blur-[2px]">
                  {isPlaying ? (
                    <>
                      <div className="text-[9px] font-cyber text-slate-300 tracking-wider font-semibold">
                        ĐỘ CHÍNH XÁC
                      </div>
                      <div className="text-xl sm:text-2xl font-arcade text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-pink-400 font-bold">
                        {scorePercentage.toFixed(2)}%
                      </div>
                      <div className="text-xs font-cyber text-amber-400 font-bold mt-0.5">
                        RANK {getRank(scorePercentage)}
                      </div>
                      
                      {/* Bouncing Arcade Combo Counter with Tiered Glows */}
                      <div className="mt-1 flex flex-col items-center">
                        <div
                          key={combo}
                          className={`font-arcade font-black leading-none transition-all ${
                            combo === 0
                              ? 'text-base text-slate-500'
                              : combo >= 300
                              ? 'text-2xl sm:text-3xl text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-pink-400 to-cyan-300 drop-shadow-[0_0_16px_rgba(244,63,94,0.9)] animate-combo-pop'
                              : combo >= 100
                              ? 'text-2xl sm:text-3xl text-pink-400 drop-shadow-[0_0_14px_rgba(236,72,153,0.85)] animate-combo-pop'
                              : combo >= 50
                              ? 'text-xl sm:text-2xl text-amber-300 drop-shadow-[0_0_10px_rgba(245,158,11,0.8)] animate-combo-pop'
                              : 'text-lg sm:text-xl text-slate-100 drop-shadow-[0_0_8px_rgba(56,189,248,0.6)] animate-combo-pop'
                          }`}
                        >
                          {combo}
                        </div>
                        <div className="text-[9px] font-cyber text-pink-400 font-bold uppercase tracking-wider flex items-center gap-1 mt-0.5">
                          {combo >= 100 && <Sparkles className="w-2.5 h-2.5 text-amber-300 animate-spin" />}
                          <span>COMBO</span>
                          {combo >= 100 && <Sparkles className="w-2.5 h-2.5 text-amber-300 animate-spin" />}
                        </div>
                      </div>

                      {/* Arcade Judgement Slam */}
                      {recentJudgement && (
                        <div
                          key={recentJudgement.id}
                          className={`text-xs sm:text-sm font-arcade font-extrabold tracking-wider mt-1 animate-judge-slam ${
                            recentJudgement.text === 'CRITICAL'
                              ? 'text-amber-300 drop-shadow-[0_0_12px_#f59e0b]'
                              : recentJudgement.text === 'PERFECT'
                              ? 'text-orange-400 drop-shadow-[0_0_10px_#fb923c]'
                              : recentJudgement.text === 'GREAT'
                              ? 'text-emerald-400 drop-shadow-[0_0_8px_#34d399]'
                              : recentJudgement.text === 'GOOD'
                              ? 'text-cyan-400 drop-shadow-[0_0_6px_#38bdf8]'
                              : 'text-rose-500 drop-shadow-[0_0_8px_#f43f5e]'
                          }`}
                        >
                          {recentJudgement.text}
                        </div>
                      )}

                      {/* Combo Milestone Celebratory Badge */}
                      {comboMilestone && (
                        <div
                          key={comboMilestone.id}
                          className="absolute inset-x-1 bottom-2 z-30 pointer-events-none flex flex-col items-center justify-center animate-milestone"
                        >
                          <div className="px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500 via-pink-500 to-cyan-500 border border-white text-black font-arcade text-[9px] font-black shadow-xl flex items-center gap-1 whitespace-nowrap">
                            <Flame className="w-3 h-3 text-yellow-200 fill-yellow-200 animate-bounce shrink-0" />
                            <span>{comboMilestone.text}</span>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center">
                      <Music className="w-7 h-7 text-cyan-400 animate-pulse mb-1" />
                      <div className="font-arcade text-xs text-cyan-300">MAJMAJ DX</div>
                      <div className="text-[10px] font-cyber text-slate-300 mt-1 font-semibold">
                        {currentTrack.hasVideo ? '✓ BGA Video sẵn sàng' : 'Bấm BẮT ĐẦU'}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Clickable / Touch Overlay for 8 Outer Buttons with arcade lighting */}
            {BUTTON_CONFIG.map(btn => {
              const rad = (btn.angle * Math.PI) / 180;
              const xPercent = 50 + Math.cos(rad) * 42;
              const yPercent = 50 + Math.sin(rad) * 42;
              const isPressed = activeButtons[btn.id];
              const theme = buttonJudgeTheme[btn.id];

              let pressedClass = 'bg-pink-500 border-white text-white scale-110 shadow-pink-500/50 shadow-2xl';
              if (theme) {
                if (theme.isBreak) {
                  pressedClass = 'bg-gradient-to-br from-amber-500 to-rose-500 border-yellow-200 text-white scale-110 shadow-amber-400/80 shadow-2xl';
                } else if (theme.judge === 'CRITICAL') {
                  pressedClass = 'bg-amber-400/40 border-amber-300 text-amber-200 scale-110 shadow-amber-400/60 shadow-2xl';
                } else if (theme.judge === 'PERFECT') {
                  pressedClass = 'bg-orange-500/40 border-orange-400 text-orange-200 scale-110 shadow-orange-500/60 shadow-xl';
                } else if (theme.judge === 'GREAT') {
                  pressedClass = 'bg-emerald-500/40 border-emerald-400 text-emerald-200 scale-110 shadow-emerald-500/60 shadow-xl';
                }
              }

              return (
                <button
                  key={btn.id}
                  onPointerDown={e => {
                    e.preventDefault();
                    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
                    pointersRef.current[e.pointerId] = btn.id;
                    activeButtonsRef.current[btn.id] = true;
                    setActiveButtons(prev => ({ ...prev, [btn.id]: true }));
                    handleHit(btn.id);
                  }}
                  onPointerEnter={e => {
                    if (e.buttons > 0) {
                      const lastBtn = pointersRef.current[e.pointerId];
                      if (lastBtn !== btn.id) {
                        pointersRef.current[e.pointerId] = btn.id;
                        activeButtonsRef.current[btn.id] = true;
                        setActiveButtons(prev => ({ ...prev, [btn.id]: true }));
                        handleHit(btn.id);
                      }
                    }
                  }}
                  style={{
                    left: `${xPercent}%`,
                    top: `${yPercent}%`,
                    transform: 'translate(-50%, -50%)'
                  }}
                  className={`absolute z-30 w-12 h-12 sm:w-14 sm:h-14 rounded-full flex flex-col items-center justify-center transition-all duration-75 active:scale-90 shadow-xl border-2 touch-none select-none ${
                    isPressed
                      ? pressedClass
                      : 'bg-slate-900/85 hover:bg-slate-800 border-cyan-400/80 text-cyan-300'
                  }`}
                >
                  <span className="font-arcade text-xs font-bold">{btn.label}</span>
                  <span className="text-[9px] font-cyber opacity-75 font-semibold">[{btn.key}]</span>
                </button>
              );
            })}
          </div>

          {/* Controls Below Ring */}
          <div className="mt-4 flex items-center gap-3">
            {!isPlaying ? (
              <button
                onClick={startGame}
                className="px-6 py-2.5 rounded-full font-arcade text-xs bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-400 hover:to-pink-400 text-black font-bold shadow-lg shadow-cyan-500/30 transition-all active:scale-95 flex items-center gap-2"
              >
                <Play className="w-4 h-4 fill-black" />
                BẮT ĐẦU CHƠI
              </button>
            ) : (
              <button
                onClick={() => setIsPaused(p => !p)}
                className="px-5 py-2 rounded-full font-cyber text-xs bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/40 transition-all"
              >
                {isPaused ? 'Tiếp tục' : 'Tạm dừng (Space)'}
              </button>
            )}

            {isPlaying && (
              <button
                onClick={() => {
                  setIsPlaying(false);
                  setIsGameOver(false);
                  if (audioRef.current) audioRef.current.pause();
                  if (videoRef.current) videoRef.current.pause();
                }}
                className="px-4 py-2 rounded-full font-cyber text-xs bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-500/30"
              >
                Hủy ván
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Game Over / Results Modal */}
      {isGameOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#0f1326] border-2 border-cyan-400 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
            <div className="text-center">
              <span className="text-xs font-cyber tracking-widest text-cyan-400 uppercase font-bold">
                KẾT QUẢ VÁN ĐẤU MAJMAJ
              </span>
              <h2 className="text-xl font-bold font-cyber text-white truncate mt-1">
                {currentTrack.title}
              </h2>
              <p className="text-xs text-slate-400 font-cyber">{currentTrack.difficulty} {currentTrack.level}</p>

              {/* Big Rank Display */}
              <div className="my-4">
                <div className="text-5xl font-arcade font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-pink-400 to-cyan-300">
                  {getRank(scorePercentage)}
                </div>
                <div className="text-2xl font-arcade text-white font-bold mt-1">
                  {scorePercentage.toFixed(4)}%
                </div>
                <div className="text-xs font-cyber text-slate-400 mt-1">
                  Max Combo: <span className="text-cyan-300 font-bold">{maxCombo}</span> / {currentTrack.notes.length}
                </div>
              </div>

              {/* Judgement Breakdown Grid */}
              <div className="grid grid-cols-5 gap-1.5 bg-slate-900/80 p-3 rounded-xl border border-slate-800 text-center font-cyber text-xs">
                <div>
                  <div className="text-amber-400 font-bold text-[10px]">CRITICAL</div>
                  <div className="text-sm font-bold text-slate-100">{stats.critical}</div>
                </div>
                <div>
                  <div className="text-orange-400 font-bold text-[10px]">PERFECT</div>
                  <div className="text-sm font-bold text-slate-100">{stats.perfect}</div>
                </div>
                <div>
                  <div className="text-emerald-400 font-bold text-[10px]">GREAT</div>
                  <div className="text-sm font-bold text-slate-100">{stats.great}</div>
                </div>
                <div>
                  <div className="text-cyan-400 font-bold text-[10px]">GOOD</div>
                  <div className="text-sm font-bold text-slate-100">{stats.good}</div>
                </div>
                <div>
                  <div className="text-rose-400 font-bold text-[10px]">MISS</div>
                  <div className="text-sm font-bold text-slate-100">{stats.miss}</div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={startGame}
                  className="flex-1 py-2.5 rounded-xl font-arcade text-xs bg-cyan-400 hover:bg-cyan-300 text-black font-bold transition-all shadow-lg shadow-cyan-400/20 flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  CHƠI LẠI
                </button>
                <button
                  onClick={() => setIsGameOver(false)}
                  className="px-5 py-2.5 rounded-xl font-cyber text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Folder / Files Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-2xl bg-[#0f1326] border border-cyan-500/50 rounded-2xl p-6 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FolderUp className="w-5 h-5 text-cyan-400" />
                <h3 className="font-cyber font-bold text-base text-slate-100">
                  Nạp Thư Mục Bài Hát Majmaj (maidata.txt + mp3 + videoplayback)
                </h3>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold px-2"
              >
                ✕
              </button>
            </div>

            {/* Google Drive Link Box */}
            <div className="bg-gradient-to-r from-cyan-950/60 to-purple-950/60 border border-cyan-500/40 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <span className="text-[10px] font-cyber uppercase tracking-wider text-amber-300 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  Nguồn Tham Khảo Chart
                </span>
                <p className="text-xs font-cyber text-slate-200">
                  Tải chart từ Drive này về máy tính, sau đó giải nén và nạp thư mục hoặc file ZIP vào hệ thống:
                </p>
                <div className="text-[11px] font-mono text-cyan-300 truncate max-w-md">
                  https://drive.google.com/drive/folders/1NiZ9rL19qKLqt0uNcP5tIqc0fUrksAPs
                </div>
              </div>

              <a
                href="https://drive.google.com/drive/folders/1NiZ9rL19qKLqt0uNcP5tIqc0fUrksAPs?usp=drive_link"
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded-xl text-xs font-cyber font-bold bg-cyan-500 hover:bg-cyan-400 text-black flex items-center gap-1.5 shrink-0 transition-all shadow-md shadow-cyan-500/20"
              >
                <span>Mở Google Drive</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Mode selection tabs */}
            <div className="flex border-b border-slate-800 gap-1 pb-2 text-xs font-cyber">
              <button
                type="button"
                onClick={() => setImportTab('zip')}
                className={`px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  importTab === 'zip'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <FileArchive className="w-3.5 h-3.5 text-cyan-400" />
                <span>Gói AstroDX (.zip/.adx)</span>
              </button>

              <button
                type="button"
                onClick={() => setImportTab('files')}
                className={`px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  importTab === 'files'
                    ? 'bg-pink-500/20 text-pink-300 border border-pink-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <FolderUp className="w-3.5 h-3.5 text-pink-400" />
                <span>Thư mục / Tập tin lẻ</span>
              </button>

              <button
                type="button"
                onClick={() => setImportTab('paste')}
                className={`px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  importTab === 'paste'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Code className="w-3.5 h-3.5 text-amber-400" />
                <span>Dán mã Simai</span>
              </button>
            </div>

            {/* TAB 1: AstroDX ZIP/ADX Package */}
            {importTab === 'zip' && (
              <div className="bg-slate-900/80 p-4 rounded-xl border border-cyan-500/30 space-y-3">
                <h4 className="text-xs font-cyber font-bold text-cyan-300 flex items-center gap-2">
                  <FileArchive className="w-4 h-4 text-cyan-400" />
                  Gói nén AstroDX Chuẩn (.zip / .adx)
                </h4>
                <p className="text-[11px] font-cyber text-slate-400">
                  Tải trực tiếp file <code>.zip</code> hoặc <code>.adx</code> định dạng AstroDX. Hệ thống sẽ tự động giải nén và quét <code>maidata.txt</code>, audio (<code>.mp3/.ogg/.wav</code>) và video BGA (<code>.mp4/.webm</code>) ngay trong trình duyệt.
                </p>

                <input
                  ref={zipInputRef}
                  type="file"
                  accept=".zip,.adx"
                  onChange={e => e.target.files && processSelectedFiles(e.target.files)}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => zipInputRef.current?.click()}
                  className="w-full py-4 rounded-xl border-2 border-dashed border-cyan-400/60 bg-cyan-950/40 hover:bg-cyan-900/50 text-cyan-300 font-cyber text-xs font-bold flex flex-col items-center justify-center gap-2 transition-all cursor-pointer group"
                >
                  <FileArchive className="w-7 h-7 text-cyan-400 group-hover:scale-110 transition-transform" />
                  <span>BẤM ĐỂ CHỌN FILE .ZIP / .ADX TỪ THIẾT BỊ</span>
                  <span className="text-[10px] text-slate-400 font-normal">Hỗ trợ đầy đủ tất cả chart AstroDX, SimaiSharp và maimai FiNALE / DX</span>
                </button>
              </div>
            )}

            {/* TAB 2: Folder & Multiple Files */}
            {importTab === 'files' && (
              <div className="space-y-3">
                <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 space-y-3">
                  <h4 className="text-xs font-cyber font-bold text-slate-200 flex items-center gap-2">
                    <FolderUp className="w-4 h-4 text-pink-400" />
                    Chọn Cả Thư Mục (maidata.txt + track.mp3)
                  </h4>
                  <p className="text-[11px] font-cyber text-slate-400">
                    Chọn thư mục đã giải nén trên máy tính của bạn:
                  </p>

                  <input
                    ref={folderInputRef}
                    type="file"
                    {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
                    multiple
                    onChange={e => e.target.files && processSelectedFiles(e.target.files)}
                    className="hidden"
                  />

                  <button
                    type="button"
                    onClick={() => folderInputRef.current?.click()}
                    className="w-full py-3 rounded-xl border border-dashed border-pink-500/60 bg-pink-950/30 hover:bg-pink-900/40 text-pink-300 font-cyber text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <FolderUp className="w-4 h-4 text-pink-400" />
                    <span>CHỌN THƯ MỤC BÀI HÁT TỪ MÁY</span>
                  </button>
                </div>

                <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 space-y-2">
                  <h4 className="text-xs font-cyber font-bold text-slate-300 flex items-center gap-2">
                    <Sliders className="w-3.5 h-3.5 text-amber-400" />
                    Hoặc chọn nhiều file cùng lúc:
                  </h4>
                  <input
                    ref={filesInputRef}
                    type="file"
                    multiple
                    accept=".txt,audio/*,video/*"
                    onChange={e => e.target.files && processSelectedFiles(e.target.files)}
                    className="w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-cyber file:bg-cyan-500/20 file:text-cyan-300 hover:file:bg-cyan-500/30 cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* TAB 3: Direct Simai Code Paste */}
            {importTab === 'paste' && (
              <div className="bg-slate-900/80 p-4 rounded-xl border border-amber-500/30 space-y-3">
                <h4 className="text-xs font-cyber font-bold text-amber-300 flex items-center gap-2">
                  <Code className="w-4 h-4 text-amber-400" />
                  Dán Mã Simai / maidata.txt Trực Tiếp
                </h4>
                <p className="text-[11px] font-cyber text-slate-400">
                  Dán nội dung tệp <code>maidata.txt</code> hoặc đoạn mã Simai (ví dụ <code>&title=Song&bpm=150&inote_5=(150){4} 1,2,3,4,</code>) để kiểm tra và nạp ngay:
                </p>

                <textarea
                  value={pastedSimaiCode}
                  onChange={e => setPastedSimaiCode(e.target.value)}
                  placeholder={`&title=Sample Track\n&artist=Composer\n&bpm=150\n&inote_5=(150){4} 1,2,3,4,1b,2b,3b,4b,1-5[4:1],5-1[4:1],E`}
                  rows={6}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-400 rounded-xl p-3 text-xs font-mono text-cyan-200 placeholder-slate-600 focus:outline-none"
                />

                <button
                  type="button"
                  onClick={handleParsePastedCode}
                  className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-cyber text-xs font-bold transition-all shadow-md shadow-amber-500/20 cursor-pointer"
                >
                  PHÂN TÍCH MÃ SIMAI NGAY
                </button>
              </div>
            )}

            {/* Status & Files Found Breakdown */}
            {(folderFilesFound.chartName || folderFilesFound.audioName || folderFilesFound.videoName) && (
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs font-cyber space-y-1.5">
                <span className="font-bold text-slate-300 block mb-1">Các file nhận diện được:</span>
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="text-cyan-400 font-semibold">1. Chart (.txt):</span>
                  <span>{folderFilesFound.chartName || <span className="text-rose-400">Chưa có</span>}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="text-pink-400 font-semibold">2. Audio (.mp3):</span>
                  <span>{folderFilesFound.audioName || <span className="text-amber-400">Không có (sẽ dùng beat synth)</span>}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="text-purple-400 font-semibold">3. Video BGA (.mp4):</span>
                  <span>{folderFilesFound.videoName || <span className="text-slate-500">Không có</span>}</span>
                </div>
              </div>
            )}

            {/* Difficulty Selection if chart parsed */}
            {parsedChartData && parsedChartData.charts.length > 0 && (
              <div className="bg-slate-900/90 p-3.5 rounded-xl border border-cyan-500/40 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-cyber font-bold text-cyan-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                    Chọn độ khó để lưu ({parsedChartData.charts.length} độ khó):
                  </span>
                  <span className="text-[11px] font-cyber text-slate-400">
                    BPM: <strong className="text-cyan-400">{parsedChartData.bpm}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {parsedChartData.charts.map((c, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedDifficultyIdx(idx)}
                      className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer ${
                        selectedDifficultyIdx === idx
                          ? 'bg-gradient-to-r from-cyan-950 to-pink-950/90 border-cyan-400 text-white shadow-lg shadow-cyan-500/20 ring-1 ring-cyan-400'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-arcade text-xs font-bold text-pink-400">{c.difficulty}</span>
                        <span className="text-xs font-bold font-cyber px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300">
                          Lv {c.level}
                        </span>
                      </div>
                      <div className="text-[10px] font-cyber text-slate-400 mt-1 flex items-center gap-1">
                        <Music className="w-3 h-3 text-cyan-400 shrink-0" />
                        <span>{c.noteCount} nốt</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {importStatus && (
              <p className={`text-xs font-cyber ${importStatus.includes('Lỗi') || importStatus.includes('Không') ? 'text-rose-400' : 'text-emerald-400'}`}>
                {importStatus}
              </p>
            )}

            {/* Modal Actions */}
            <div className="flex justify-end gap-3 pt-2 border-t border-slate-800">
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setParsedChartData(null);
                  setFolderFilesFound({});
                  setImportStatus('');
                }}
                className="px-4 py-2 rounded-xl text-xs font-cyber text-slate-400 hover:text-white"
              >
                Hủy
              </button>

              <button
                onClick={handleConfirmSaveTrack}
                disabled={!parsedChartData}
                className="px-5 py-2.5 rounded-xl font-arcade text-xs bg-gradient-to-r from-cyan-400 to-pink-500 text-black font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md shadow-cyan-500/20"
              >
                LƯU VĨNH VIỄN VÀO KHO BÀI HÁT
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Play History & Results Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-2xl bg-[#0f1326] border border-cyan-500/50 rounded-2xl p-6 shadow-2xl flex flex-col gap-4 max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-amber-400" />
                <h3 className="font-cyber font-bold text-base text-slate-100">
                  Lịch Sử Kết Quả Đã Lưu ({historyList.length} ván)
                </h3>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold px-2"
              >
                ✕
              </button>
            </div>

            {/* Table of History */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {historyList.length === 0 ? (
                <div className="text-center py-10 text-slate-500 font-cyber text-xs">
                  Chưa có lịch sử ván chơi nào. Hãy hoàn thành một bài hát để xem kết quả tại đây!
                </div>
              ) : (
                historyList.map(item => (
                  <div
                    key={item.id}
                    className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3 text-xs font-cyber hover:border-cyan-500/40 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm truncate">{item.trackTitle}</span>
                        <span className="px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-300 font-bold text-[10px]">
                          {item.difficulty} {item.level}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {new Date(item.playedAt).toLocaleString('vi-VN')} • Max Combo: {item.maxCombo}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-2">
                        <span className="text-amber-400">CP: {item.critical}</span>
                        <span className="text-orange-400">P: {item.perfect}</span>
                        <span className="text-emerald-400">Gr: {item.great}</span>
                        <span className="text-cyan-400">Gd: {item.good}</span>
                        <span className="text-rose-400">Ms: {item.miss}</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-arcade text-lg text-amber-300 font-bold">
                        {item.rank}
                      </div>
                      <div className="font-arcade text-xs text-cyan-300 font-semibold">
                        {item.accuracy.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowHistoryModal(false)}
                className="px-5 py-2 rounded-xl text-xs font-cyber bg-slate-800 hover:bg-slate-700 text-slate-200"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
