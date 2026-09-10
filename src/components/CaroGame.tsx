import React, { useState, useCallback, useEffect } from 'react';
import { RotateCcw, Bot, User, Trophy, Cpu, Undo2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import { sound } from '../utils/audio';

interface Props {
  onBack: () => void;
  onUpdateStats: (result: 'win' | 'loss' | 'draw') => void;
  stats: { wins: number; losses: number; draws: number };
}

type Cell = 'X' | 'O' | null;
type Board = Cell[][];
type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

const BOARD_SIZE = 15;

export const CaroGame: React.FC<Props> = ({ onBack, onUpdateStats, stats }) => {
  const [board, setBoard] = useState<Board>(() =>
    Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null))
  );
  const [isPlayerTurn, setIsPlayerTurn] = useState<boolean>(true);
  const [difficulty, setDifficulty] = useState<Difficulty>('MEDIUM');
  const [winner, setWinner] = useState<'X' | 'O' | 'DRAW' | null>(null);
  const [winningLine, setWinningLine] = useState<{ r: number; c: number }[] | null>(null);
  const [history, setHistory] = useState<Board[]>([]);
  const [isAiThinking, setIsAiThinking] = useState<boolean>(false);

  // Check 5 in a row
  const checkWin = useCallback((b: Board, lastR: number, lastC: number, player: 'X' | 'O') => {
    const directions = [
      [0, 1],  // Horizontal
      [1, 0],  // Vertical
      [1, 1],  // Diagonal \
      [1, -1]  // Diagonal /
    ];

    for (const [dr, dc] of directions) {
      const line: { r: number; c: number }[] = [{ r: lastR, c: lastC }];

      // Look forward
      for (let i = 1; i < 5; i++) {
        const nr = lastR + dr * i;
        const nc = lastC + dc * i;
        if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && b[nr][nc] === player) {
          line.push({ r: nr, c: nc });
        } else break;
      }

      // Look backward
      for (let i = 1; i < 5; i++) {
        const nr = lastR - dr * i;
        const nc = lastC - dc * i;
        if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && b[nr][nc] === player) {
          line.push({ r: nr, c: nc });
        } else break;
      }

      if (line.length >= 5) {
        return line;
      }
    }
    return null;
  }, []);

  // Smart AI Move Evaluator
  const getAiMove = useCallback((currentBoard: Board, diff: Difficulty): { r: number; c: number } => {
    // Collect candidate empty spots near existing pieces
    const candidates: { r: number; c: number; score: number }[] = [];

    const hasAnyPiece = currentBoard.some(row => row.some(cell => cell !== null));
    if (!hasAnyPiece) {
      return { r: 7, c: 7 }; // Center move
    }

    // Pattern evaluation weights
    const evaluatePoint = (r: number, c: number, target: 'X' | 'O'): number => {
      let total = 0;
      const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];

      for (const [dr, dc] of dirs) {
        let count = 1;
        let openEnds = 0;

        // Forward
        let fr = r + dr;
        let fc = c + dc;
        while (fr >= 0 && fr < BOARD_SIZE && fc >= 0 && fc < BOARD_SIZE && currentBoard[fr][fc] === target) {
          count++;
          fr += dr;
          fc += dc;
        }
        if (fr >= 0 && fr < BOARD_SIZE && fc >= 0 && fc < BOARD_SIZE && currentBoard[fr][fc] === null) {
          openEnds++;
        }

        // Backward
        let br = r - dr;
        let bc = c - dc;
        while (br >= 0 && br < BOARD_SIZE && bc >= 0 && bc < BOARD_SIZE && currentBoard[br][bc] === target) {
          count++;
          br -= dr;
          bc -= dc;
        }
        if (br >= 0 && br < BOARD_SIZE && bc >= 0 && bc < BOARD_SIZE && currentBoard[br][bc] === null) {
          openEnds++;
        }

        // Score based on count and open ends
        if (count >= 5) total += 100000;
        else if (count === 4) {
          total += openEnds === 2 ? 12000 : openEnds === 1 ? 2500 : 0;
        } else if (count === 3) {
          total += openEnds === 2 ? 3000 : openEnds === 1 ? 500 : 0;
        } else if (count === 2) {
          total += openEnds === 2 ? 200 : openEnds === 1 ? 50 : 0;
        }
      }

      return total;
    };

    // Evaluate each empty neighbor
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (currentBoard[r][c] !== null) continue;

        // Check if has neighbor within 2 radius
        let hasNeighbor = false;
        for (let dr = -2; dr <= 2 && !hasNeighbor; dr++) {
          for (let dc = -2; dc <= 2 && !hasNeighbor; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && currentBoard[nr][nc] !== null) {
              hasNeighbor = true;
            }
          }
        }

        if (hasNeighbor) {
          // Offense score (AI is 'O')
          const attackScore = evaluatePoint(r, c, 'O');
          // Defense score (Block Player 'X')
          const defenseScore = evaluatePoint(r, c, 'X');

          let score = 0;
          if (diff === 'EASY') {
            score = attackScore * 0.8 + defenseScore * 0.6 + Math.random() * 50;
          } else if (diff === 'MEDIUM') {
            score = attackScore * 1.1 + defenseScore * 1.0;
          } else {
            // HARD / CYBER MATRIX
            score = attackScore * 1.25 + defenseScore * 1.15;
            if (attackScore >= 100000) score += 500000; // Immediate win
            if (defenseScore >= 12000) score += 200000; // Must block open 4
          }

          candidates.push({ r, c, score });
        }
      }
    }

    if (candidates.length === 0) return { r: 7, c: 7 };

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0];
  }, []);

  // Handle Player Move
  const handleCellClick = useCallback((r: number, c: number) => {
    if (!isPlayerTurn || winner || board[r][c] !== null || isAiThinking) return;

    sound.playCaroPlace(true);

    const newBoard = board.map(row => [...row]);
    newBoard[r][c] = 'X';
    setHistory(prev => [...prev, board]);
    setBoard(newBoard);

    const winLine = checkWin(newBoard, r, c, 'X');
    if (winLine) {
      setWinner('X');
      setWinningLine(winLine);
      sound.playFanfare();
      confetti({ particleCount: 120, spread: 70 });
      onUpdateStats('win');
      return;
    }

    // Check board full
    if (newBoard.every(row => row.every(cell => cell !== null))) {
      setWinner('DRAW');
      onUpdateStats('draw');
      return;
    }

    // AI Turn
    setIsPlayerTurn(false);
    setIsAiThinking(true);

    setTimeout(() => {
      const aiMove = getAiMove(newBoard, difficulty);
      const afterAiBoard = newBoard.map(row => [...row]);
      afterAiBoard[aiMove.r][aiMove.c] = 'O';
      sound.playCaroPlace(false);
      setBoard(afterAiBoard);

      const aiWinLine = checkWin(afterAiBoard, aiMove.r, aiMove.c, 'O');
      if (aiWinLine) {
        setWinner('O');
        setWinningLine(aiWinLine);
        sound.playMiss();
        onUpdateStats('loss');
      } else if (afterAiBoard.every(row => row.every(cell => cell !== null))) {
        setWinner('DRAW');
        onUpdateStats('draw');
      } else {
        setIsPlayerTurn(true);
      }
      setIsAiThinking(false);
    }, 380);
  }, [board, isPlayerTurn, winner, isAiThinking, checkWin, getAiMove, difficulty, onUpdateStats]);

  const resetGame = () => {
    setBoard(Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null)));
    setIsPlayerTurn(true);
    setWinner(null);
    setWinningLine(null);
    setHistory([]);
    setIsAiThinking(false);
  };

  const undoMove = () => {
    if (history.length === 0 || winner || isAiThinking) return;
    const previous = history[history.length - 1];
    setBoard(previous);
    setHistory(history.slice(0, -1));
    setIsPlayerTurn(true);
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
            <h1 className="font-arcade text-sm text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-500">
              CỜ CARO NEON VS AI
            </h1>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 text-xs font-cyber">
          <div className="bg-slate-900 px-3 py-1 rounded-lg border border-slate-800 flex items-center gap-3 text-[11px]">
            <span className="text-cyan-400 font-bold">Thắng: {stats.wins}</span>
            <span className="text-slate-500">|</span>
            <span className="text-pink-400 font-bold">Thua: {stats.losses}</span>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 flex flex-col md:flex-row items-center justify-center p-3 gap-6 overflow-hidden">
        {/* Left Side: Controls */}
        <div className="w-full md:w-64 flex flex-col gap-3 order-2 md:order-1">
          {/* Turn Indicator */}
          <div className="bg-[#101326] border border-cyan-500/30 rounded-xl p-4 shadow-lg">
            <span className="text-[10px] font-cyber text-slate-400 uppercase tracking-widest font-bold block mb-1">
              TRẠNG THÁI TRẬN ĐẤU
            </span>
            <div className="flex items-center gap-2 mt-1">
              {winner ? (
                <div className="font-arcade text-sm">
                  {winner === 'X' && <span className="text-cyan-400 font-bold">BẠN CHIẾN THẮNG!</span>}
                  {winner === 'O' && <span className="text-pink-500 font-bold">AI CHIẾN THẮNG!</span>}
                  {winner === 'DRAW' && <span className="text-amber-400 font-bold">HÒA NHAU!</span>}
                </div>
              ) : isPlayerTurn ? (
                <div className="flex items-center gap-2 text-cyan-300 font-cyber font-bold text-sm">
                  <User className="w-4 h-4 text-cyan-400" />
                  <span>Lượt của bạn (X)</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-pink-400 font-cyber font-bold text-sm animate-pulse">
                  <Cpu className="w-4 h-4 text-pink-400" />
                  <span>AI đang tính toán...</span>
                </div>
              )}
            </div>
          </div>

          {/* Difficulty Selector */}
          <div className="bg-[#101326] border border-slate-800 rounded-xl p-3 text-xs font-cyber space-y-2">
            <span className="font-bold text-slate-300">Cấp Độ AI:</span>
            <div className="grid grid-cols-3 gap-1.5">
              {(['EASY', 'MEDIUM', 'HARD'] as Difficulty[]).map(d => (
                <button
                  key={d}
                  onClick={() => {
                    setDifficulty(d);
                    resetGame();
                  }}
                  className={`py-1.5 px-2 rounded-lg font-cyber text-[11px] font-semibold transition-all border ${
                    difficulty === d
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400 shadow-sm'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  {d === 'EASY' ? 'Tập sự' : d === 'MEDIUM' ? 'Cao thủ' : 'Ma trận AI'}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={undoMove}
              disabled={history.length === 0 || !!winner || isAiThinking}
              className="flex-1 py-2.5 rounded-xl font-cyber text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center justify-center gap-1.5 disabled:opacity-40 transition-all"
            >
              <Undo2 className="w-4 h-4 text-cyan-400" />
              Đi lại
            </button>
            <button
              onClick={resetGame}
              className="flex-1 py-2.5 rounded-xl font-cyber text-xs bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 flex items-center justify-center gap-1.5 transition-all"
            >
              <RotateCcw className="w-4 h-4" />
              Ván Mới
            </button>
          </div>
        </div>

        {/* Center: Caro 15x15 Grid */}
        <div
          className="relative bg-[#070914] p-2.5 rounded-2xl border-4 border-cyan-500/40 shadow-2xl shadow-cyan-500/20 order-1 md:order-2"
          style={{
            width: 'min(92vw, 480px)',
            height: 'min(92vw, 480px)'
          }}
        >
          <div
            className="w-full h-full grid"
            style={{
              gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`
            }}
          >
            {board.map((row, r) =>
              row.map((cell, c) => {
                const isWinningCell = winningLine?.some(p => p.r === r && p.c === c);
                return (
                  <button
                    key={`${r}-${c}`}
                    onClick={() => handleCellClick(r, c)}
                    className={`border border-slate-800/80 flex items-center justify-center relative hover:bg-slate-800/40 transition-colors ${
                      isWinningCell ? 'bg-cyan-500/30 shadow-[0_0_12px_#06b6d4]' : ''
                    }`}
                  >
                    {cell === 'X' && (
                      <span className="font-arcade text-cyan-400 font-bold text-xs sm:text-sm drop-shadow-[0_0_6px_#06b6d4]">
                        ✕
                      </span>
                    )}
                    {cell === 'O' && (
                      <span className="font-arcade text-pink-500 font-bold text-xs sm:text-sm drop-shadow-[0_0_6px_#ec4899]">
                        ◯
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
