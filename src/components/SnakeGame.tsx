import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, RotateCcw, Zap, Shield, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';
import { sound } from '../utils/audio';

interface Props {
  onBack: () => void;
  onUpdateHighScore: (score: number) => void;
  highScore: number;
}

type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
interface Point {
  x: number;
  y: number;
}

interface FoodItem {
  x: number;
  y: number;
  type: 'CORE' | 'CRYSTAL' | 'WARP';
  expiresAt?: number;
}

const GRID_SIZE = 22; // 22x22 cells

export const SnakeGame: React.FC<Props> = ({ onBack, onUpdateHighScore, highScore }) => {
  const [snake, setSnake] = useState<Point[]>([
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 }
  ]);
  const [dir, setDir] = useState<Direction>('RIGHT');
  const [food, setFood] = useState<FoodItem>({ x: 16, y: 10, type: 'CORE' });
  const [score, setScore] = useState<number>(0);
  const [combo, setCombo] = useState<number>(0);
  const [multiplier, setMultiplier] = useState<number>(1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isGameOver, setIsGameOver] = useState<boolean>(false);
  const [speed, setSpeed] = useState<number>(95); // ms per tick

  const nextDirRef = useRef<Direction>('RIGHT');
  const loopRef = useRef<number | null>(null);

  // Generate food not colliding with snake
  const spawnFood = useCallback((currentSnake: Point[]): FoodItem => {
    let x = 0;
    let y = 0;
    let collision = true;
    while (collision) {
      x = Math.floor(Math.random() * GRID_SIZE);
      y = Math.floor(Math.random() * GRID_SIZE);
      // eslint-disable-next-line @typescript-eslint/no-loop-func
      collision = currentSnake.some(p => p.x === x && p.y === y);
    }

    const rand = Math.random();
    let type: FoodItem['type'] = 'CORE';
    if (rand < 0.2) type = 'CRYSTAL'; // 20% bonus crystal
    else if (rand < 0.3) type = 'WARP'; // 10% warp speed

    return { x, y, type };
  }, []);

  const resetGame = () => {
    const initialSnake: Point[] = [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 }
    ];
    setSnake(initialSnake);
    setDir('RIGHT');
    nextDirRef.current = 'RIGHT';
    setFood(spawnFood(initialSnake));
    setScore(0);
    setCombo(0);
    setMultiplier(1);
    setIsGameOver(false);
    setIsPlaying(true);
    setSpeed(95);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const current = nextDirRef.current;
      if ((e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') && current !== 'DOWN') {
        nextDirRef.current = 'UP';
      } else if ((e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') && current !== 'UP') {
        nextDirRef.current = 'DOWN';
      } else if ((e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') && current !== 'RIGHT') {
        nextDirRef.current = 'LEFT';
      } else if ((e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') && current !== 'LEFT') {
        nextDirRef.current = 'RIGHT';
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Main game tick
  useEffect(() => {
    if (!isPlaying || isGameOver) return;

    const interval = setInterval(() => {
      setSnake(prevSnake => {
        const head = prevSnake[0];
        const currentDir = nextDirRef.current;
        setDir(currentDir);

        let newX = head.x;
        let newY = head.y;

        if (currentDir === 'UP') newY -= 1;
        if (currentDir === 'DOWN') newY += 1;
        if (currentDir === 'LEFT') newX -= 1;
        if (currentDir === 'RIGHT') newX += 1;

        // Wall collision (wrap-around or game over: let's do wrap-around with penalty or border game over)
        // Authentic arcade challenge: hitting wall = GAME OVER
        if (newX < 0 || newX >= GRID_SIZE || newY < 0 || newY >= GRID_SIZE) {
          setIsGameOver(true);
          setIsPlaying(false);
          sound.playExplode();
          return prevSnake;
        }

        // Self collision check
        if (prevSnake.some(p => p.x === newX && p.y === newY)) {
          setIsGameOver(true);
          setIsPlaying(false);
          sound.playExplode();
          return prevSnake;
        }

        const newHead = { x: newX, y: newY };
        const newSnake = [newHead, ...prevSnake];

        // Check food eaten
        if (newX === food.x && newY === food.y) {
          const isSpecial = food.type !== 'CORE';
          sound.playSnakeEat(isSpecial);

          let pts = 10;
          if (food.type === 'CRYSTAL') pts = 50;
          if (food.type === 'WARP') pts = 30;

          setCombo(c => c + 1);
          setMultiplier(m => Math.min(4, 1 + Math.floor(combo / 5) * 0.5));

          const addedScore = pts * multiplier;
          setScore(prevScore => {
            const finalScore = prevScore + addedScore;
            if (finalScore > highScore) {
              onUpdateHighScore(finalScore);
            }
            return finalScore;
          });

          // Increase speed slightly
          setSpeed(s => Math.max(50, s - 1));
          setFood(spawnFood(newSnake));
        } else {
          newSnake.pop(); // Remove tail
        }

        return newSnake;
      });
    }, speed);

    return () => clearInterval(interval);
  }, [isPlaying, isGameOver, food, speed, multiplier, combo, highScore, onUpdateHighScore, spawnFood]);

  const changeDir = (d: Direction) => {
    const current = nextDirRef.current;
    if (d === 'UP' && current !== 'DOWN') nextDirRef.current = 'UP';
    if (d === 'DOWN' && current !== 'UP') nextDirRef.current = 'DOWN';
    if (d === 'LEFT' && current !== 'RIGHT') nextDirRef.current = 'LEFT';
    if (d === 'RIGHT' && current !== 'LEFT') nextDirRef.current = 'RIGHT';
  };

  return (
    <div className="flex flex-col h-full bg-[#080811] text-white select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-cyan-900/40 bg-[#0d0f1d]/80">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="px-3 py-1.5 text-xs font-cyber tracking-wider uppercase bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded border border-cyan-500/30 transition-all"
          >
            ← Arcade Hub
          </button>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <h1 className="font-arcade text-sm text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
              CYBER SNAKE 2.0
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-cyber">
          <div className="bg-slate-900 px-3 py-1 rounded-lg border border-slate-800">
            <span className="text-slate-400 mr-1.5">KỶ LỤC:</span>
            <span className="font-arcade text-amber-400">{highScore}</span>
          </div>
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex-1 flex flex-col md:flex-row items-center justify-center p-3 gap-6 overflow-hidden">
        {/* Left Side: Stats & Info */}
        <div className="w-full md:w-64 flex flex-col gap-3 order-2 md:order-1">
          <div className="bg-[#101326] border border-emerald-500/30 rounded-xl p-4 shadow-lg">
            <span className="text-[10px] font-cyber text-emerald-400 uppercase tracking-widest font-bold">
              BẢNG ĐIỂM
            </span>
            <div className="text-3xl font-arcade text-emerald-300 font-bold mt-1">
              {score}
            </div>

            <div className="flex items-center justify-between text-xs font-cyber mt-4 pt-3 border-t border-slate-800">
              <span className="text-slate-400">Combo:</span>
              <span className="font-arcade text-cyan-300">{combo}x</span>
            </div>
            <div className="flex items-center justify-between text-xs font-cyber mt-1">
              <span className="text-slate-400">Hệ số nhân:</span>
              <span className="font-bold text-amber-400">{multiplier}x</span>
            </div>
            <div className="flex items-center justify-between text-xs font-cyber mt-1">
              <span className="text-slate-400">Độ dài rắn:</span>
              <span className="text-slate-200">{snake.length} block</span>
            </div>
          </div>

          {/* Items Guide */}
          <div className="bg-[#101326] border border-slate-800 rounded-xl p-3 text-xs font-cyber space-y-2">
            <span className="font-bold text-slate-300">Vật phẩm năng lượng:</span>
            <div className="flex items-center gap-2 text-[11px] text-slate-300">
              <span className="w-3.5 h-3.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee] inline-block"></span>
              <span>Energy Core: +10 điểm</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-300">
              <span className="w-3.5 h-3.5 rounded-full bg-pink-500 shadow-[0_0_8px_#ec4899] inline-block"></span>
              <span>Hyper Crystal: +50 điểm</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-300">
              <span className="w-3.5 h-3.5 rounded-full bg-amber-400 shadow-[0_0_8px_#fbbf24] inline-block"></span>
              <span>Warp Reactor: +30 điểm</span>
            </div>
          </div>
        </div>

        {/* Center: Snake Grid */}
        <div className="flex flex-col items-center justify-center order-1 md:order-2">
          <div
            onPointerDown={e => {
              if (!isPlaying || isGameOver || snake.length === 0) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              const clickY = e.clientY - rect.top;
              const cellW = rect.width / GRID_SIZE;
              const cellH = rect.height / GRID_SIZE;
              const targetX = Math.floor(clickX / cellW);
              const targetY = Math.floor(clickY / cellH);

              const head = snake[0];
              const dx = targetX - head.x;
              const dy = targetY - head.y;
              const current = nextDirRef.current;

              if (Math.abs(dx) >= Math.abs(dy)) {
                if (dx > 0 && current !== 'LEFT') nextDirRef.current = 'RIGHT';
                else if (dx < 0 && current !== 'RIGHT') nextDirRef.current = 'LEFT';
              } else {
                if (dy > 0 && current !== 'UP') nextDirRef.current = 'DOWN';
                else if (dy < 0 && current !== 'DOWN') nextDirRef.current = 'UP';
              }
            }}
            className="relative bg-[#070913] rounded-2xl border-4 border-emerald-500/40 shadow-2xl p-1 shadow-emerald-500/20 cursor-crosshair select-none"
            style={{
              width: 'min(78vw, 420px)',
              height: 'min(78vw, 420px)'
            }}
          >
            {/* Grid display */}
            <div
              className="w-full h-full grid relative"
              style={{
                gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${GRID_SIZE}, minmax(0, 1fr))`
              }}
            >
              {/* Snake Cells */}
              {snake.map((segment, index) => {
                const isHead = index === 0;
                return (
                  <div
                    key={`${segment.x}-${segment.y}-${index}`}
                    style={{
                      gridColumnStart: segment.x + 1,
                      gridRowStart: segment.y + 1
                    }}
                    className={`rounded-sm transition-all duration-75 ${
                      isHead
                        ? 'bg-emerald-300 shadow-[0_0_12px_#34d399] z-10 scale-105'
                        : 'bg-emerald-500/80 shadow-[0_0_6px_#10b981]'
                    }`}
                  />
                );
              })}

              {/* Food Item */}
              <div
                style={{
                  gridColumnStart: food.x + 1,
                  gridRowStart: food.y + 1
                }}
                className={`rounded-full animate-ping-slow scale-110 ${
                  food.type === 'CRYSTAL'
                    ? 'bg-pink-400 shadow-[0_0_16px_#f472b6]'
                    : food.type === 'WARP'
                    ? 'bg-amber-400 shadow-[0_0_14px_#fbbf24]'
                    : 'bg-cyan-400 shadow-[0_0_12px_#38bdf8]'
                }`}
              />
            </div>

            {/* Game Over Overlay */}
            {isGameOver && (
              <div className="absolute inset-0 bg-black/85 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center p-4">
                <span className="font-arcade text-rose-500 text-lg sm:text-xl font-bold mb-2">
                  GAME OVER
                </span>
                <p className="text-xs font-cyber text-slate-300 mb-4">
                  Điểm của bạn: <span className="text-emerald-400 font-bold">{score}</span>
                </p>
                <button
                  onClick={resetGame}
                  className="px-5 py-2.5 rounded-xl font-arcade text-xs bg-emerald-400 hover:bg-emerald-300 text-black font-bold flex items-center gap-2 shadow-lg shadow-emerald-400/30 active:scale-95"
                >
                  <RotateCcw className="w-4 h-4" />
                  CHƠI LẠI
                </button>
              </div>
            )}

            {/* Ready overlay */}
            {!isPlaying && !isGameOver && (
              <div className="absolute inset-0 bg-black/75 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center p-4">
                <Sparkles className="w-8 h-8 text-emerald-400 mb-2 animate-bounce" />
                <button
                  onClick={resetGame}
                  className="px-6 py-3 rounded-xl font-arcade text-xs bg-gradient-to-r from-emerald-400 to-cyan-400 text-black font-bold flex items-center gap-2 shadow-lg shadow-emerald-400/30 active:scale-95"
                >
                  <Play className="w-4 h-4 fill-black" />
                  BẮT ĐẦU
                </button>
                <span className="text-[11px] font-cyber text-slate-400 mt-2">
                  Dùng phím W, A, S, D hoặc Mũi tên
                </span>
              </div>
            )}
          </div>

          {/* Touch / Virtual D-pad for mobile */}
          <div className="flex flex-col items-center gap-1 mt-4 md:hidden">
            <button
              onPointerDown={() => changeDir('UP')}
              className="w-12 h-12 bg-slate-800 active:bg-emerald-500 rounded-xl flex items-center justify-center text-slate-200 active:text-black border border-slate-700"
            >
              <ArrowUp className="w-5 h-5" />
            </button>
            <div className="flex gap-4">
              <button
                onPointerDown={() => changeDir('LEFT')}
                className="w-12 h-12 bg-slate-800 active:bg-emerald-500 rounded-xl flex items-center justify-center text-slate-200 active:text-black border border-slate-700"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <button
                onPointerDown={() => changeDir('DOWN')}
                className="w-12 h-12 bg-slate-800 active:bg-emerald-500 rounded-xl flex items-center justify-center text-slate-200 active:text-black border border-slate-700"
              >
                <ArrowDown className="w-5 h-5" />
              </button>
              <button
                onPointerDown={() => changeDir('RIGHT')}
                className="w-12 h-12 bg-slate-800 active:bg-emerald-500 rounded-xl flex items-center justify-center text-slate-200 active:text-black border border-slate-700"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
