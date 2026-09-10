/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { GameId, ArcadeScores } from './types';
import { ArcadeCabinet } from './components/ArcadeCabinet';
import { MaimaiGame } from './components/MaimaiGame';
import { SnakeGame } from './components/SnakeGame';
import { Game2048 } from './components/Game2048';
import { FlappyGame } from './components/FlappyGame';
import { CaroGame } from './components/CaroGame';
import { sound } from './utils/audio';

const STORAGE_KEY = 'NEON_ARCADE_SCORES_V1';

const DEFAULT_SCORES: ArcadeScores = {
  maimai: {},
  snake: 0,
  '2048': 0,
  flappy: 0,
  caro: { wins: 0, losses: 0, draws: 0 }
};

export default function App() {
  const [activeGame, setActiveGame] = useState<GameId | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [crtFilter, setCrtFilter] = useState<boolean>(false);

  // Load scores from localStorage
  const [scores, setScores] = useState<ArcadeScores>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return DEFAULT_SCORES;
  });

  // Save scores to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
    } catch {
      // ignore
    }
  }, [scores]);

  const handleToggleMute = () => {
    setIsMuted(prev => {
      const next = !prev;
      sound.setMute(next);
      return next;
    });
  };

  const handleUpdateMaimaiScore = (trackId: string, score: number) => {
    setScores(prev => ({
      ...prev,
      maimai: {
        ...prev.maimai,
        [trackId]: Math.max(prev.maimai?.[trackId] || 0, score)
      }
    }));
  };

  const handleUpdateSnakeScore = (score: number) => {
    setScores(prev => ({
      ...prev,
      snake: Math.max(prev.snake, score)
    }));
  };

  const handleUpdate2048Score = (score: number) => {
    setScores(prev => ({
      ...prev,
      '2048': Math.max(prev['2048'], score)
    }));
  };

  const handleUpdateFlappyScore = (score: number) => {
    setScores(prev => ({
      ...prev,
      flappy: Math.max(prev.flappy, score)
    }));
  };

  const handleUpdateCaroStats = (result: 'win' | 'loss' | 'draw') => {
    setScores(prev => {
      const current = prev.caro || { wins: 0, losses: 0, draws: 0 };
      return {
        ...prev,
        caro: {
          wins: result === 'win' ? current.wins + 1 : current.wins,
          losses: result === 'loss' ? current.losses + 1 : current.losses,
          draws: result === 'draw' ? current.draws + 1 : current.draws
        }
      };
    });
  };

  return (
    <div className="relative min-h-screen bg-[#080812] text-slate-100 font-sans selection:bg-cyan-500 selection:text-black">
      {/* CRT Scanline Filter Overlay */}
      {crtFilter && <div className="fixed inset-0 crt-overlay z-40 pointer-events-none" />}

      {/* Main View Router */}
      {activeGame === null && (
        <ArcadeCabinet
          onSelectGame={gameId => {
            sound.unlock();
            setActiveGame(gameId);
          }}
          scores={scores}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          crtFilter={crtFilter}
          onToggleCrt={() => setCrtFilter(c => !c)}
        />
      )}

      {activeGame === 'maimai' && (
        <div className="h-screen flex flex-col">
          <MaimaiGame
            onBack={() => setActiveGame(null)}
            onUpdateHighScore={handleUpdateMaimaiScore}
            highScore={Math.max(0, ...(Object.values(scores.maimai || {}) as number[]))}
          />
        </div>
      )}

      {activeGame === 'snake' && (
        <div className="h-screen flex flex-col">
          <SnakeGame
            onBack={() => setActiveGame(null)}
            onUpdateHighScore={handleUpdateSnakeScore}
            highScore={scores.snake}
          />
        </div>
      )}

      {activeGame === '2048' && (
        <div className="h-screen flex flex-col">
          <Game2048
            onBack={() => setActiveGame(null)}
            onUpdateHighScore={handleUpdate2048Score}
            highScore={scores['2048']}
          />
        </div>
      )}

      {activeGame === 'flappy' && (
        <div className="h-screen flex flex-col">
          <FlappyGame
            onBack={() => setActiveGame(null)}
            onUpdateHighScore={handleUpdateFlappyScore}
            highScore={scores.flappy}
          />
        </div>
      )}

      {activeGame === 'caro' && (
        <div className="h-screen flex flex-col">
          <CaroGame
            onBack={() => setActiveGame(null)}
            onUpdateStats={handleUpdateCaroStats}
            stats={scores.caro}
          />
        </div>
      )}
    </div>
  );
}

