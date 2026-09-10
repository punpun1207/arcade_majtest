import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RotateCcw, Hammer, Shuffle, Undo2, Trophy, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';
import { sound } from '../utils/audio';

interface Props {
  onBack: () => void;
  onUpdateHighScore: (score: number) => void;
  highScore: number;
}

type Board = number[][];

const TILE_COLORS: Record<number, string> = {
  2: 'bg-slate-900 border-cyan-500/40 text-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.2)]',
  4: 'bg-cyan-950/70 border-cyan-400 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.3)]',
  8: 'bg-blue-950/70 border-blue-400 text-blue-200 shadow-[0_0_12px_rgba(59,130,246,0.3)]',
  16: 'bg-indigo-950/70 border-indigo-400 text-indigo-200 shadow-[0_0_14px_rgba(99,102,241,0.4)]',
  32: 'bg-purple-950/70 border-purple-400 text-purple-200 shadow-[0_0_14px_rgba(168,85,247,0.4)]',
  64: 'bg-fuchsia-950/70 border-fuchsia-400 text-fuchsia-200 shadow-[0_0_16px_rgba(217,70,239,0.5)]',
  128: 'bg-pink-950/70 border-pink-400 text-pink-100 shadow-[0_0_18px_rgba(236,72,153,0.5)]',
  256: 'bg-rose-950/70 border-rose-400 text-rose-100 shadow-[0_0_20px_rgba(244,63,94,0.6)]',
  512: 'bg-amber-950/70 border-amber-400 text-amber-100 shadow-[0_0_22px_rgba(245,158,11,0.6)]',
  1024: 'bg-emerald-950/70 border-emerald-400 text-emerald-100 shadow-[0_0_24px_rgba(16,185,129,0.7)]',
  2048: 'bg-gradient-to-br from-amber-500 to-pink-600 border-white text-white shadow-[0_0_30px_rgba(251,191,36,0.9)] animate-pulse'
};

export const Game2048: React.FC<Props> = ({ onBack, onUpdateHighScore, highScore }) => {
  const [board, setBoard] = useState<Board>([
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ]);
  const [prevBoard, setPrevBoard] = useState<Board | null>(null);
  const [score, setScore] = useState<number>(0);
  const [prevScore, setPrevScore] = useState<number>(0);
  const [isGameOver, setIsGameOver] = useState<boolean>(false);
  const [hammerActive, setHammerActive] = useState<boolean>(false);
  const [hammersLeft, setHammersLeft] = useState<number>(2);
  const [hasWon, setHasWon] = useState<boolean>(false);

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

  // Add random tile (2 or 4) to empty spot
  const spawnTile = useCallback((grid: Board): Board => {
    const emptyCells: { r: number; c: number }[] = [];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (grid[r][c] === 0) emptyCells.push({ r, c });
      }
    }
    if (emptyCells.length === 0) return grid;

    const randomCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
    const newGrid = grid.map(row => [...row]);
    newGrid[randomCell.r][randomCell.c] = Math.random() < 0.9 ? 2 : 4;
    return newGrid;
  }, []);

  // Initialize
  const initGame = useCallback(() => {
    let b: Board = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ];
    b = spawnTile(b);
    b = spawnTile(b);
    setBoard(b);
    setPrevBoard(null);
    setScore(0);
    setIsGameOver(false);
    setHasWon(false);
    setHammersLeft(2);
    setHammerActive(false);
  }, [spawnTile]);

  useEffect(() => {
    initGame();
  }, [initGame]);

  // Check Game Over
  const checkGameOver = (grid: Board): boolean => {
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (grid[r][c] === 0) return false;
        if (r < 3 && grid[r][c] === grid[r + 1][c]) return false;
        if (c < 3 && grid[r][c] === grid[r][c + 1]) return false;
      }
    }
    return true;
  };

  // Slide and Merge logic
  const slideRow = (row: number[]): { newRow: number[]; gainedScore: number; maxMerge: number } => {
    const filtered = row.filter(val => val !== 0);
    const newRow: number[] = [];
    let gainedScore = 0;
    let maxMerge = 0;

    for (let i = 0; i < filtered.length; i++) {
      if (i < filtered.length - 1 && filtered[i] === filtered[i + 1]) {
        const mergedVal = filtered[i] * 2;
        newRow.push(mergedVal);
        gainedScore += mergedVal;
        maxMerge = Math.max(maxMerge, mergedVal);
        i++; // skip next tile
      } else {
        newRow.push(filtered[i]);
      }
    }

    while (newRow.length < 4) {
      newRow.push(0);
    }

    return { newRow, gainedScore, maxMerge };
  };

  const move = useCallback((direction: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') => {
    if (isGameOver || hammerActive) return;

    setPrevBoard(board.map(r => [...r]));
    setPrevScore(score);

    let moved = false;
    let totalGained = 0;
    let highestMerge = 0;
    const nextBoard: Board = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ];

    if (direction === 'LEFT') {
      for (let r = 0; r < 4; r++) {
        const { newRow, gainedScore, maxMerge } = slideRow(board[r]);
        nextBoard[r] = newRow;
        totalGained += gainedScore;
        highestMerge = Math.max(highestMerge, maxMerge);
        if (newRow.some((val, idx) => val !== board[r][idx])) moved = true;
      }
    } else if (direction === 'RIGHT') {
      for (let r = 0; r < 4; r++) {
        const reversed = [...board[r]].reverse();
        const { newRow, gainedScore, maxMerge } = slideRow(reversed);
        nextBoard[r] = newRow.reverse();
        totalGained += gainedScore;
        highestMerge = Math.max(highestMerge, maxMerge);
        if (nextBoard[r].some((val, idx) => val !== board[r][idx])) moved = true;
      }
    } else if (direction === 'UP') {
      for (let c = 0; c < 4; c++) {
        const col = [board[0][c], board[1][c], board[2][c], board[3][c]];
        const { newRow, gainedScore, maxMerge } = slideRow(col);
        totalGained += gainedScore;
        highestMerge = Math.max(highestMerge, maxMerge);
        for (let r = 0; r < 4; r++) {
          nextBoard[r][c] = newRow[r];
          if (newRow[r] !== board[r][c]) moved = true;
        }
      }
    } else if (direction === 'DOWN') {
      for (let c = 0; c < 4; c++) {
        const col = [board[3][c], board[2][c], board[1][c], board[0][c]];
        const { newRow, gainedScore, maxMerge } = slideRow(col);
        totalGained += gainedScore;
        highestMerge = Math.max(highestMerge, maxMerge);
        for (let r = 0; r < 4; r++) {
          nextBoard[3 - r][c] = newRow[r];
          if (newRow[r] !== board[3 - r][c]) moved = true;
        }
      }
    }

    if (moved) {
      const mergedPower = Math.log2(highestMerge || 2);
      sound.play2048Merge(mergedPower);

      if (highestMerge >= 2048 && !hasWon) {
        setHasWon(true);
        sound.playFanfare();
        confetti({ particleCount: 100, spread: 70 });
      }

      const boardWithNewTile = spawnTile(nextBoard);
      setBoard(boardWithNewTile);

      const nextScore = score + totalGained;
      setScore(nextScore);
      if (nextScore > highScore) {
        onUpdateHighScore(nextScore);
      }

      if (checkGameOver(boardWithNewTile)) {
        setIsGameOver(true);
        sound.playExplode();
      }
    }
  }, [board, isGameOver, hammerActive, score, highScore, onUpdateHighScore, spawnTile, hasWon]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        move('UP');
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        move('DOWN');
      } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        move('LEFT');
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        move('RIGHT');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [move]);

  // Touch gestures for swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY
    };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (Math.max(absX, absY) > 30) {
      if (absX > absY) {
        move(dx > 0 ? 'RIGHT' : 'LEFT');
      } else {
        move(dy > 0 ? 'DOWN' : 'UP');
      }
    }
    touchStartRef.current = null;
  };

  // Mouse drag gestures for swipe
  const handlePointerDown = (e: React.PointerEvent) => {
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!pointerStartRef.current) return;
    const dx = e.clientX - pointerStartRef.current.x;
    const dy = e.clientY - pointerStartRef.current.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (Math.max(absX, absY) > 25) {
      if (absX > absY) {
        move(dx > 0 ? 'RIGHT' : 'LEFT');
      } else {
        move(dy > 0 ? 'DOWN' : 'UP');
      }
    }
    pointerStartRef.current = null;
  };

  // Hammer power-up: smash a tile
  const handleTileClick = (r: number, c: number) => {
    if (!hammerActive || board[r][c] === 0) return;
    sound.playExplode();
    const newBoard = board.map(row => [...row]);
    newBoard[r][c] = 0;
    setBoard(newBoard);
    setHammersLeft(prev => prev - 1);
    setHammerActive(false);
  };

  // Undo move
  const handleUndo = () => {
    if (!prevBoard) return;
    setBoard(prevBoard);
    setScore(prevScore);
    setPrevBoard(null);
    setIsGameOver(false);
  };

  return (
    <div className="flex flex-col h-full bg-[#080811] text-white select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-cyan-900/40 bg-[#0d0f1d]/80">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="px-3 py-1.5 text-xs font-cyber tracking-wider uppercase bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded border border-cyan-500/30 transition-all"
          >
            ← Arcade Hub
          </button>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
            <h1 className="font-arcade text-sm text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-pink-400 to-amber-300">
              2048 CYBER FUSION
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-cyber">
          <div className="bg-slate-900 px-3 py-1 rounded-lg border border-slate-800">
            <span className="text-slate-400 mr-1.5">KỶ LỤC:</span>
            <span className="font-arcade text-amber-400">{highScore}</span>
          </div>
        </div>
      </div>

      {/* Main Board */}
      <div className="flex-1 flex flex-col md:flex-row items-center justify-center p-3 gap-6 overflow-hidden">
        {/* Left Side: Controls & Powerups */}
        <div className="w-full md:w-64 flex flex-col gap-3 order-2 md:order-1">
          <div className="bg-[#101326] border border-cyan-500/30 rounded-xl p-4 shadow-lg">
            <span className="text-[10px] font-cyber text-cyan-400 uppercase tracking-widest font-bold">
              ĐIỂM SỐ NĂNG LƯỢNG
            </span>
            <div className="text-3xl font-arcade text-cyan-300 font-bold mt-1">
              {score}
            </div>
          </div>

          {/* Arcade Power-ups */}
          <div className="bg-[#101326] border border-slate-800 rounded-xl p-3 text-xs font-cyber space-y-2">
            <span className="font-bold text-slate-300">Công Cụ Hỗ Trợ:</span>

            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={hammersLeft <= 0 || hammerActive}
                onClick={() => setHammerActive(true)}
                className={`p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
                  hammerActive
                    ? 'bg-rose-500/20 border-rose-500 text-rose-300 animate-pulse'
                    : 'bg-slate-900/80 hover:bg-slate-800 border-slate-700 text-slate-300'
                } disabled:opacity-40`}
              >
                <Hammer className="w-4 h-4 text-rose-400" />
                <span className="text-[10px]">Búa Phá ({hammersLeft})</span>
              </button>

              <button
                disabled={!prevBoard}
                onClick={handleUndo}
                className="p-2.5 rounded-xl border bg-slate-900/80 hover:bg-slate-800 border-slate-700 text-slate-300 flex flex-col items-center justify-center gap-1 transition-all disabled:opacity-40"
              >
                <Undo2 className="w-4 h-4 text-cyan-400" />
                <span className="text-[10px]">Quay lại</span>
              </button>
            </div>

            {hammerActive && (
              <p className="text-[10px] text-rose-400 animate-pulse text-center">
                *Chọn 1 ô gạch trên bàn để phá hủy!
              </p>
            )}
          </div>

          <button
            onClick={initGame}
            className="py-2.5 rounded-xl font-cyber text-xs bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 flex items-center justify-center gap-1.5 transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Ván Mới
          </button>
        </div>

        {/* Center: 2048 4x4 Grid */}
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          className="relative bg-[#070913] p-3 rounded-2xl border-4 border-cyan-500/40 shadow-2xl shadow-cyan-500/20 order-1 md:order-2 cursor-grab active:cursor-grabbing select-none"
          style={{
            width: 'min(82vw, 420px)',
            height: 'min(82vw, 420px)'
          }}
        >
          <div className="w-full h-full grid grid-cols-4 grid-rows-4 gap-2.5">
            {board.map((row, r) =>
              row.map((val, c) => (
                <div
                  key={`${r}-${c}`}
                  onClick={() => handleTileClick(r, c)}
                  className={`rounded-xl border flex items-center justify-center font-arcade font-bold text-sm sm:text-base transition-all duration-150 relative ${
                    val === 0
                      ? 'bg-slate-950/60 border-slate-900 text-transparent'
                      : TILE_COLORS[val] || 'bg-amber-600 border-amber-300 text-white shadow-xl'
                  } ${hammerActive && val !== 0 ? 'cursor-pointer hover:border-rose-500 hover:scale-105' : ''}`}
                >
                  {val !== 0 && (
                    <>
                      <span>{val}</span>
                      {val >= 1024 && (
                        <Sparkles className="w-3 h-3 text-amber-300 absolute top-1 right-1 animate-spin" />
                      )}
                    </>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Game Over Screen */}
          {isGameOver && (
            <div className="absolute inset-0 bg-black/85 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center p-4">
              <span className="font-arcade text-rose-500 text-lg font-bold mb-2">
                HẾT NƯỚC ĐI
              </span>
              <p className="text-xs font-cyber text-slate-300 mb-4">
                Điểm cuối: <span className="text-cyan-400 font-bold">{score}</span>
              </p>
              <button
                onClick={initGame}
                className="px-5 py-2.5 rounded-xl font-arcade text-xs bg-cyan-400 hover:bg-cyan-300 text-black font-bold flex items-center gap-2 shadow-lg shadow-cyan-400/30"
              >
                <RotateCcw className="w-4 h-4" />
                CHƠI LẠI
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
