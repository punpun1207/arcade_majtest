import React from 'react';
import { GameId, GameMetadata, ArcadeScores } from '../types';
import { Disc3, Zap, Layers, Send, Grid3X3, Trophy, Volume2, VolumeX, Monitor, Sparkles } from 'lucide-react';
import { sound } from '../utils/audio';

interface Props {
  onSelectGame: (gameId: GameId) => void;
  scores: ArcadeScores;
  isMuted: boolean;
  onToggleMute: () => void;
  crtFilter: boolean;
  onToggleCrt: () => void;
}

const GAMES_LIST: GameMetadata[] = [
  {
    id: 'maimai',
    title: 'MAJMAJ DX',
    subtitle: 'Arcade Rhythm Simulator',
    category: 'Âm Nhạc / Arcade',
    badge: 'HOT / MAIDATA & VIDEO',
    accentColor: 'cyan',
    iconName: 'Disc3',
    description: 'Trải nghiệm Majmaj thùng chuẩn 8 cảm ứng tròn! Hỗ trợ nạp cả thư mục (maidata.txt, file nhạc mp3 & videoplayback), lưu trữ vĩnh viễn trong máy.'
  },
  {
    id: 'snake',
    title: 'CYBER SNAKE 2.0',
    subtitle: 'Rắn Săn Mồi Neon',
    category: 'Hành Động Cổ Điển',
    badge: 'NEON TRAIL',
    accentColor: 'emerald',
    iconName: 'Zap',
    description: 'Rắn săn mồi phong cách Cyberpunk với hiệu ứng vệt sáng, các lõi năng lượng Hyper Crystal và tốc độ warp cao.'
  },
  {
    id: '2048',
    title: '2048 CYBER FUSION',
    subtitle: 'Xếp Gạch Hạt Lượng Tử',
    category: 'Giải Đố Trí Tuệ',
    badge: 'POWER-UPS',
    accentColor: 'amber',
    iconName: 'Layers',
    description: 'Hợp nhất các lõi lượng tử lên đến 2048/4096. Trang bị thêm công cụ búa phá hủy ô gạch kẹt và tính năng quay lại nước đi.'
  },
  {
    id: 'flappy',
    title: 'CYBER FLAP',
    subtitle: 'Phi Thuyền Drone Vượt Cổng',
    category: 'Kỹ Năng / Phản Xạ',
    badge: 'REFLEX',
    accentColor: 'pink',
    iconName: 'Send',
    description: 'Điều khiển drone phản lực vượt qua hàng rào laser neon trong thành phố tương lai. Nhấp chuột hoặc bấm Space để cất cánh.'
  },
  {
    id: 'caro',
    title: 'CỜ CARO NEON AI',
    subtitle: 'Đấu Trí Gomoku 15x15',
    category: 'Đối Kháng Chiến Thuật',
    badge: 'AI MATRIX',
    accentColor: 'purple',
    iconName: 'Grid3X3',
    description: 'Bàn cờ caro 15x15 phong cách laser. Đối đầu với trí tuệ nhân tạo từ cấp độ Tập Sự, Cao Thủ đến Ma Trận AI bất bại.'
  }
];

export const ArcadeCabinet: React.FC<Props> = ({
  onSelectGame,
  scores,
  isMuted,
  onToggleMute,
  crtFilter,
  onToggleCrt
}) => {
  return (
    <div className="flex flex-col min-h-screen bg-[#080812] text-white">
      {/* Top Navigation Bar */}
      <header className="border-b border-cyan-900/40 bg-[#0d0f1e]/90 backdrop-blur-md px-4 sm:px-8 py-3.5 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-pink-500 flex items-center justify-center shadow-[0_0_15px_#06b6d4]">
            <Disc3 className="w-5 h-5 text-black animate-spin" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-arcade text-xs sm:text-sm text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-pink-400 to-amber-300">
                NEON ARCADE HUB
              </h1>
              <span className="text-[10px] font-cyber px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                RETRO 2099
              </span>
            </div>
            <p className="text-[11px] font-cyber text-slate-400">Trung Tâm Game Thùng Cổ Điển & Maimai DX</p>
          </div>
        </div>

        {/* Global Settings (Sound & CRT) */}
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleCrt}
            className={`px-3 py-1.5 rounded-lg text-xs font-cyber border transition-all flex items-center gap-1.5 ${
              crtFilter
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500 shadow-sm'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Hiệu ứng CRT</span>
          </button>

          <button
            onClick={onToggleMute}
            className={`p-2 rounded-lg border transition-all ${
              !isMuted
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                : 'bg-slate-900 text-slate-500 border-slate-800'
            }`}
            title={isMuted ? 'Bật âm thanh' : 'Tắt âm thanh'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 flex flex-col gap-6">
        {/* Banner Maimai Highlight */}
        <div className="relative rounded-2xl border border-cyan-500/40 bg-gradient-to-r from-[#0d1527] via-[#16132d] to-[#1a0f25] p-5 sm:p-6 overflow-hidden shadow-2xl">
          <div className="absolute right-0 top-0 w-80 h-80 bg-gradient-to-bl from-pink-500/20 via-cyan-500/10 to-transparent blur-3xl rounded-full pointer-events-none"></div>

          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1.5 max-w-2xl">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-cyber font-bold bg-pink-500/20 text-pink-400 border border-pink-500/40 uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-pink-400" />
                  ĐẶC BIỆT DÀNH CHO BẠN
                </span>
                <span className="text-[10px] font-cyber text-amber-300">★ Hỗ trợ Folder maidata.txt + MP3 + Video</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold font-cyber text-white">
                Majmaj DX Web Arcade Simulator
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 font-cyber leading-relaxed">
                Máy chơi game âm nhạc vòng tròn 8 sensor theo phong cách Majmaj chuẩn arcade. Bạn có thể nạp trực tiếp trọn bộ thư mục (<code className="text-cyan-300">maidata.txt</code>, <code className="text-pink-300">.mp3</code>, và <code className="text-purple-300">videoplayback</code>), tự động lưu trữ vĩnh viễn và lưu lịch sử kết quả!
              </p>
            </div>

            <button
              onClick={() => onSelectGame('maimai')}
              className="px-6 py-3 rounded-xl font-arcade text-xs bg-gradient-to-r from-cyan-400 via-pink-500 to-amber-300 hover:opacity-95 text-black font-extrabold shadow-lg shadow-cyan-500/30 transition-all active:scale-95 flex items-center gap-2 shrink-0"
            >
              <Disc3 className="w-4 h-4 text-black animate-spin" />
              CHƠI MAJMAJ NGAY
            </button>
          </div>
        </div>

        {/* Game Cabinet Cards Grid */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-arcade text-cyan-400 tracking-wider flex items-center gap-2">
              <span>DANH SÁCH MÁY GAME</span>
              <span className="text-slate-500 font-cyber text-xs">({GAMES_LIST.length} trò chơi)</span>
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {GAMES_LIST.map(game => {
              // Get current highscore for this game
              let recordText = 'Chưa có';
              if (game.id === 'maimai') {
                const maimaiScores = Object.values(scores.maimai || {}) as number[];
                const best = Math.max(0, ...maimaiScores);
                recordText = best > 0 ? `${best.toFixed(2)}%` : 'Chưa có';
              } else if (game.id === 'snake') {
                recordText = scores.snake > 0 ? `${scores.snake} pts` : 'Chưa có';
              } else if (game.id === '2048') {
                recordText = scores['2048'] > 0 ? `${scores['2048']} pts` : 'Chưa có';
              } else if (game.id === 'flappy') {
                recordText = scores.flappy > 0 ? `${scores.flappy} gates` : 'Chưa có';
              } else if (game.id === 'caro') {
                recordText = `${scores.caro.wins} Thắng / ${scores.caro.losses} Thua`;
              }

              return (
                <div
                  key={game.id}
                  onClick={() => onSelectGame(game.id)}
                  className="group relative bg-[#0e1224] hover:bg-[#131830] border border-slate-800 hover:border-cyan-500/60 rounded-2xl p-5 cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-cyan-500/10 flex flex-col justify-between"
                >
                  <div>
                    {/* Top Row: Category & Badge */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] font-cyber text-slate-400 uppercase tracking-wider font-semibold">
                        {game.category}
                      </span>
                      <span className="text-[10px] font-cyber px-2 py-0.5 rounded font-bold bg-slate-900 border border-slate-700 text-cyan-300 group-hover:border-cyan-400 transition-colors">
                        {game.badge}
                      </span>
                    </div>

                    {/* Title & Subtitle */}
                    <h4 className="text-lg font-bold font-cyber text-white group-hover:text-cyan-300 transition-colors">
                      {game.title}
                    </h4>
                    <p className="text-xs text-pink-400 font-cyber font-medium mb-2.5">
                      {game.subtitle}
                    </p>

                    {/* Description */}
                    <p className="text-xs text-slate-400 font-cyber leading-relaxed line-clamp-3">
                      {game.description}
                    </p>
                  </div>

                  {/* Bottom Stats & Launch CTA */}
                  <div className="mt-4 pt-3.5 border-t border-slate-800/80 flex items-center justify-between text-xs font-cyber">
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Trophy className="w-3.5 h-3.5 text-amber-400" />
                      <span>Kỷ lục:</span>
                      <span className="text-slate-200 font-bold">{recordText}</span>
                    </div>

                    <span className="px-3 py-1 rounded-lg text-xs font-bold font-arcade bg-slate-900 group-hover:bg-cyan-500 text-slate-300 group-hover:text-black transition-all">
                      VÀO CHƠI →
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-4 px-6 text-center text-xs font-cyber text-slate-500">
        Neon Arcade Hub 2099 • Chơi game thư giãn mượt mà không quảng cáo • Đầy đủ Web Audio & Simai Parser
      </footer>
    </div>
  );
};
