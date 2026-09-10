import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, RotateCcw, Zap, Sparkles } from 'lucide-react';
import { sound } from '../utils/audio';

interface Props {
  onBack: () => void;
  onUpdateHighScore: (score: number) => void;
  highScore: number;
}

interface Pipe {
  x: number;
  topHeight: number;
  bottomHeight: number;
  passed: boolean;
}

export const FlappyGame: React.FC<Props> = ({ onBack, onUpdateHighScore, highScore }) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isGameOver, setIsGameOver] = useState<boolean>(false);
  const [score, setScore] = useState<number>(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const droneYRef = useRef<number>(200);
  const droneVelocityRef = useRef<number>(0);
  const pipesRef = useRef<Pipe[]>([]);
  const frameCountRef = useRef<number>(0);
  const animIdRef = useRef<number>(0);

  const resetGame = () => {
    droneYRef.current = 200;
    droneVelocityRef.current = 0;
    pipesRef.current = [];
    frameCountRef.current = 0;
    setScore(0);
    setIsGameOver(false);
    setIsPlaying(true);
  };

  const jump = useCallback(() => {
    if (!isPlaying) {
      resetGame();
      return;
    }
    if (isGameOver) return;
    droneVelocityRef.current = -7.5;
    sound.playFlap();
  }, [isPlaying, isGameOver]);

  // Handle Space & Click inputs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        jump();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [jump]);

  // Main Canvas Animation Loop
  useEffect(() => {
    if (!isPlaying || isGameOver) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const GRAVITY = 0.38;
    const PIPE_SPEED = 2.4;
    const PIPE_GAP = 125;
    const DRONE_X = 75;
    const DRONE_RADIUS = 14;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      frameCountRef.current++;

      // 1. Update Physics
      droneVelocityRef.current += GRAVITY;
      droneYRef.current += droneVelocityRef.current;

      // Spawn pipes every 100 frames
      if (frameCountRef.current % 100 === 0) {
        const minTop = 60;
        const maxTop = height - PIPE_GAP - 60;
        const topHeight = Math.floor(Math.random() * (maxTop - minTop) + minTop);
        const bottomHeight = height - topHeight - PIPE_GAP;
        pipesRef.current.push({
          x: width,
          topHeight,
          bottomHeight,
          passed: false
        });
      }

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Draw Cyberpunk Skyline Background Grid
      ctx.save();
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.08)';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 30) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.restore();

      // 2. Draw & Update Pipes
      for (let i = pipesRef.current.length - 1; i >= 0; i--) {
        const pipe = pipesRef.current[i];
        pipe.x -= PIPE_SPEED;

        // Top Laser Pillar
        ctx.save();
        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = '#ec4899';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#ec4899';
        ctx.shadowBlur = 12;
        ctx.fillRect(pipe.x, 0, 48, pipe.topHeight);
        ctx.strokeRect(pipe.x, 0, 48, pipe.topHeight);

        // Bottom Laser Pillar
        const bottomY = height - pipe.bottomHeight;
        ctx.fillRect(pipe.x, bottomY, 48, pipe.bottomHeight);
        ctx.strokeRect(pipe.x, bottomY, 48, pipe.bottomHeight);

        // Glowing Laser Emitter
        ctx.beginPath();
        ctx.arc(pipe.x + 24, pipe.topHeight, 5, 0, Math.PI * 2);
        ctx.arc(pipe.x + 24, bottomY, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#f43f5e';
        ctx.fill();
        ctx.restore();

        // Scoring check
        if (!pipe.passed && pipe.x + 48 < DRONE_X) {
          pipe.passed = true;
          setScore(s => {
            const next = s + 1;
            if (next > highScore) onUpdateHighScore(next);
            return next;
          });
          sound.playSnakeEat(true);
        }

        // Collision Check
        const inPipeX = DRONE_X + DRONE_RADIUS > pipe.x && DRONE_X - DRONE_RADIUS < pipe.x + 48;
        const hitTop = droneYRef.current - DRONE_RADIUS < pipe.topHeight;
        const hitBottom = droneYRef.current + DRONE_RADIUS > bottomY;

        if (inPipeX && (hitTop || hitBottom)) {
          setIsGameOver(true);
          sound.playExplode();
          return;
        }

        // Remove offscreen
        if (pipe.x < -60) {
          pipesRef.current.splice(i, 1);
        }
      }

      // 3. Ground / Ceiling collision
      if (droneYRef.current + DRONE_RADIUS >= height || droneYRef.current - DRONE_RADIUS <= 0) {
        setIsGameOver(true);
        sound.playExplode();
        return;
      }

      // 4. Draw Drone
      ctx.save();
      const droneY = droneYRef.current;

      // Thruster Flame
      ctx.beginPath();
      ctx.moveTo(DRONE_X - 16, droneY);
      ctx.lineTo(DRONE_X - 26, droneY + (Math.random() * 6 - 3));
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 15;
      ctx.stroke();

      // Drone Core Body
      ctx.beginPath();
      ctx.arc(DRONE_X, droneY, DRONE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = '#06b6d4';
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 18;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#cffafe';
      ctx.stroke();

      // Drone Visor / Eye
      ctx.beginPath();
      ctx.arc(DRONE_X + 5, droneY, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      ctx.restore();

      animIdRef.current = requestAnimationFrame(render);
    };

    animIdRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animIdRef.current);
  }, [isPlaying, isGameOver, highScore, onUpdateHighScore]);

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
            <span className="w-2.5 h-2.5 rounded-full bg-pink-500 animate-pulse"></span>
            <h1 className="font-arcade text-sm text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-amber-300">
              CYBER FLAP
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

      {/* Game Stage */}
      <div className="flex-1 flex flex-col items-center justify-center p-3">
        <div
          onPointerDown={jump}
          className="relative bg-[#060814] rounded-2xl border-4 border-pink-500/40 shadow-2xl shadow-pink-500/20 cursor-pointer select-none overflow-hidden"
          style={{
            width: 'min(90vw, 420px)',
            height: 'min(75vh, 520px)'
          }}
        >
          <canvas
            ref={canvasRef}
            width={400}
            height={500}
            className="w-full h-full block"
          />

          {/* Live Score Overlay */}
          {isPlaying && !isGameOver && (
            <div className="absolute top-4 left-0 right-0 flex justify-center pointer-events-none">
              <span className="font-arcade text-3xl text-cyan-300 drop-shadow-[0_0_12px_#06b6d4]">
                {score}
              </span>
            </div>
          )}

          {/* Game Over Screen */}
          {isGameOver && (
            <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-4">
              <span className="font-arcade text-rose-500 text-lg font-bold mb-2">
                CRASH DETECTED
              </span>
              <p className="text-xs font-cyber text-slate-300 mb-4">
                Điểm vượt cổng: <span className="text-pink-400 font-bold">{score}</span>
              </p>
              <button
                onClick={e => {
                  e.stopPropagation();
                  resetGame();
                }}
                className="px-5 py-2.5 rounded-xl font-arcade text-xs bg-pink-500 hover:bg-pink-400 text-white font-bold flex items-center gap-2 shadow-lg shadow-pink-500/30"
              >
                <RotateCcw className="w-4 h-4" />
                BAY LẠI
              </button>
            </div>
          )}

          {/* Start Screen */}
          {!isPlaying && !isGameOver && (
            <div className="absolute inset-0 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center p-4">
              <Zap className="w-10 h-10 text-pink-400 mb-2 animate-bounce" />
              <button
                onClick={e => {
                  e.stopPropagation();
                  resetGame();
                }}
                className="px-6 py-3 rounded-xl font-arcade text-xs bg-gradient-to-r from-pink-500 to-amber-400 text-black font-bold flex items-center gap-2 shadow-lg shadow-pink-500/30"
              >
                <Play className="w-4 h-4 fill-black" />
                BẮT ĐẦU BAY
              </button>
              <span className="text-[11px] font-cyber text-slate-400 mt-2">
                Nhấp chuột hoặc nhấn Phím Cách (Space) để bay
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
