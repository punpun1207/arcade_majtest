import { MaimaiTrack, MajmajHistoryItem } from '../types';

const DB_NAME = 'MAJMAJ_DATABASE';
const DB_VERSION = 1;
const STORE_TRACKS = 'custom_tracks';
const STORE_HISTORY = 'play_history';

export interface StoredTrackRecord {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  difficulty: MaimaiTrack['difficulty'];
  level: string;
  jacketColor: string;
  notes: MaimaiTrack['notes'];
  totalNotes: number;
  audioBlob?: Blob;
  videoBlob?: Blob;
  createdAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_TRACKS)) {
        db.createObjectStore(STORE_TRACKS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_HISTORY)) {
        db.createObjectStore(STORE_HISTORY, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Save custom track with audio and video blobs
export async function saveCustomTrack(
  track: Omit<StoredTrackRecord, 'createdAt'>,
  audioBlob?: Blob,
  videoBlob?: Blob
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TRACKS, 'readwrite');
    const store = tx.objectStore(STORE_TRACKS);
    const record: StoredTrackRecord = {
      ...track,
      audioBlob,
      videoBlob,
      createdAt: Date.now()
    };
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Load all custom tracks and turn blobs into object URLs
export async function loadCustomTracks(): Promise<MaimaiTrack[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_TRACKS, 'readonly');
      const store = tx.objectStore(STORE_TRACKS);
      const req = store.getAll();

      req.onsuccess = () => {
        const records: StoredTrackRecord[] = req.result || [];
        const tracks: MaimaiTrack[] = records.map(r => {
          let audioUrl: string | undefined;
          let videoUrl: string | undefined;
          if (r.audioBlob) {
            audioUrl = URL.createObjectURL(r.audioBlob);
          }
          if (r.videoBlob) {
            videoUrl = URL.createObjectURL(r.videoBlob);
          }
          return {
            id: r.id,
            title: r.title,
            artist: r.artist,
            bpm: r.bpm,
            difficulty: r.difficulty,
            level: r.level,
            jacketColor: r.jacketColor,
            notes: r.notes,
            totalNotes: r.totalNotes,
            audioUrl,
            videoUrl,
            hasVideo: !!videoUrl,
            isCustom: true,
            createdAt: r.createdAt
          };
        });
        
        // Ensure newest tracks are loaded first so that setSelectedTrackIndex(0) selects the newly imported track
        tracks.reverse();
        resolve(tracks);
      };

      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('Failed to load custom tracks from IndexedDB:', err);
    return [];
  }
}

// Delete custom track
export async function deleteCustomTrack(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TRACKS, 'readwrite');
    const store = tx.objectStore(STORE_TRACKS);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Save Play History Item
export async function savePlayHistory(item: MajmajHistoryItem): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_HISTORY, 'readwrite');
      const store = tx.objectStore(STORE_HISTORY);
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('Failed to save history:', err);
  }
}

// Load Play History Items (sorted newest first)
export async function loadPlayHistory(): Promise<MajmajHistoryItem[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_HISTORY, 'readonly');
      const store = tx.objectStore(STORE_HISTORY);
      const req = store.getAll();
      req.onsuccess = () => {
        const items: MajmajHistoryItem[] = req.result || [];
        items.sort((a, b) => b.playedAt - a.playedAt);
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('Failed to load history:', err);
    return [];
  }
}
