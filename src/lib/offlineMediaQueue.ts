import AsyncStorage from '@react-native-async-storage/async-storage';
import { getInfoAsync } from 'expo-file-system/legacy';
import { uploadToCloudinary } from './cloudinary';
import { supabase } from './supabase';
import { isOnline } from './emergencySms';

export const OFFLINE_MEDIA_STORAGE_KEY = '@safen_offline_media_queue';

export interface OfflineMediaItem {
  id: string;
  uri: string;
  type: 'snapshot' | 'video' | 'audio';
  alertId: string;
  queuedAt: number;
  attempts: number;
}

const MAX_QUEUE_ATTEMPTS = 5;
let isFlushingQueue = false;

/**
 * Enqueue a media item that failed to upload due to network disruption.
 */
export async function enqueuePendingUpload(
  item: Omit<OfflineMediaItem, 'id' | 'queuedAt' | 'attempts'>
): Promise<void> {
  if (!item.uri || !item.alertId) return;

  try {
    const raw = await AsyncStorage.getItem(OFFLINE_MEDIA_STORAGE_KEY);
    const queue: OfflineMediaItem[] = raw ? JSON.parse(raw) : [];

    // Avoid duplicate queueing of the exact same local file URI
    const exists = queue.some((q) => q.uri === item.uri);
    if (exists) return;

    const newItem: OfflineMediaItem = {
      ...item,
      id: `${item.type}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      queuedAt: Date.now(),
      attempts: 0,
    };

    queue.push(newItem);
    await AsyncStorage.setItem(OFFLINE_MEDIA_STORAGE_KEY, JSON.stringify(queue));
    if (__DEV__) console.log(`[OfflineMediaQueue] Queued ${item.type} for retry:`, item.uri);
  } catch (err) {
    console.warn('[OfflineMediaQueue] Failed to enqueue pending upload:', err);
  }
}

/**
 * Retrieves all items currently waiting in the offline upload queue.
 */
export async function getPendingUploads(): Promise<OfflineMediaItem[]> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_MEDIA_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Syncs a newly uploaded media URL into the alert's media_paths in Supabase.
 */
async function syncUrlToAlert(alertId: string, url: string): Promise<boolean> {
  try {
    const { data: alertRow } = await supabase
      .from('alerts')
      .select('media_paths')
      .eq('id', alertId)
      .maybeSingle();

    const existingPaths: string[] = Array.isArray(alertRow?.media_paths) ? alertRow.media_paths : [];
    if (existingPaths.includes(url)) return true;

    const updatedPaths = [...existingPaths, url];
    const { error } = await supabase
      .from('alerts')
      .update({ media_paths: updatedPaths })
      .eq('id', alertId);

    if (error) {
      console.warn('[OfflineMediaQueue] DB sync error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[OfflineMediaQueue] DB sync exception:', err);
    return false;
  }
}

/**
 * Flushes all pending media items in the offline queue when online.
 * Safe to invoke repeatedly — concurrency guard prevents parallel runs.
 * Returns the count of successfully flushed items.
 */
export async function flushOfflineMediaQueue(): Promise<number> {
  if (isFlushingQueue) return 0;

  const online = await isOnline().catch(() => true);
  if (!online) return 0;

  isFlushingQueue = true;
  let successCount = 0;

  try {
    const raw = await AsyncStorage.getItem(OFFLINE_MEDIA_STORAGE_KEY);
    if (!raw) {
      isFlushingQueue = false;
      return 0;
    }

    const queue: OfflineMediaItem[] = JSON.parse(raw);
    if (!Array.isArray(queue) || queue.length === 0) {
      isFlushingQueue = false;
      return 0;
    }

    if (__DEV__) console.log(`[OfflineMediaQueue] Flushing ${queue.length} pending items…`);

    const remainingQueue: OfflineMediaItem[] = [];

    for (const item of queue) {
      // 1. Verify file still exists on disk
      try {
        const info = await getInfoAsync(item.uri);
        if (!info.exists) {
          if (__DEV__) console.log('[OfflineMediaQueue] Local file missing, dropping:', item.uri);
          continue; // Drop dead file
        }
      } catch {
        // Proceed with upload attempt
      }

      // 2. Attempt upload to Cloudinary
      try {
        const explicitPublicId = `${item.type}_${item.queuedAt}`;
        const uploadedUrl = await uploadToCloudinary(item.uri, {
          folder: `safen/emergency_${item.alertId}`,
          public_id: explicitPublicId,
          resourceType: item.type === 'video' ? 'video' : item.type === 'audio' ? 'audio' : 'image',
        });

        if (uploadedUrl) {
          await syncUrlToAlert(item.alertId, uploadedUrl);
          successCount++;
          if (__DEV__) console.log(`[OfflineMediaQueue] Flushed ${item.type} SUCCESS:`, uploadedUrl);
          continue; // Successfully uploaded and synced, do not keep in remainingQueue
        }
      } catch (uploadErr) {
        console.warn(`[OfflineMediaQueue] Retry upload failed for ${item.id}:`, uploadErr);
      }

      // 3. Handle failure / retry tracking
      item.attempts += 1;
      if (item.attempts < MAX_QUEUE_ATTEMPTS) {
        remainingQueue.push(item);
      } else {
        console.warn(`[OfflineMediaQueue] Max attempts reached for ${item.id}. Dropping.`);
      }
    }

    await AsyncStorage.setItem(OFFLINE_MEDIA_STORAGE_KEY, JSON.stringify(remainingQueue));
  } catch (err) {
    console.warn('[OfflineMediaQueue] Error flushing offline queue:', err);
  } finally {
    isFlushingQueue = false;
  }

  return successCount;
}

