/**
 * High-performance Cache Manager for SWU-IFSS Scalability
 * Supports in-memory, sessionStorage, and localStorage caching with TTL (Time-To-Live).
 */

class CacheManager {
  constructor() {
    this.memoryCache = new Map();
  }

  /**
   * Set cache item with optional TTL (in milliseconds, default 5 minutes)
   */
  set(key, value, ttlMs = 5 * 60 * 1000, storage = 'memory') {
    const item = {
      value,
      expiry: Date.now() + ttlMs,
    };

    if (storage === 'memory') {
      this.memoryCache.set(key, item);
    } else if (storage === 'session') {
      try {
        sessionStorage.setItem(key, JSON.stringify(item));
      } catch (e) {
        console.warn('sessionStorage set error:', e);
      }
    } else if (storage === 'local') {
      try {
        localStorage.setItem(key, JSON.stringify(item));
      } catch (e) {
        console.warn('localStorage set error:', e);
      }
    }
  }

  /**
   * Get cached item if valid and not expired
   */
  get(key, storage = 'memory') {
    let item = null;

    if (storage === 'memory') {
      item = this.memoryCache.get(key);
    } else if (storage === 'session') {
      try {
        const raw = sessionStorage.getItem(key);
        if (raw) item = JSON.parse(raw);
      } catch (e) {
        return null;
      }
    } else if (storage === 'local') {
      try {
        const raw = localStorage.getItem(key);
        if (raw) item = JSON.parse(raw);
      } catch (e) {
        return null;
      }
    }

    if (!item) return null;

    if (Date.now() > item.expiry) {
      this.delete(key, storage);
      return null;
    }

    return item.value;
  }

  /**
   * Delete cache item
   */
  delete(key, storage = 'memory') {
    if (storage === 'memory') {
      this.memoryCache.delete(key);
    } else if (storage === 'session') {
      try { sessionStorage.removeItem(key); } catch (e) {}
    } else if (storage === 'local') {
      try { localStorage.removeItem(key); } catch (e) {}
    }
  }

  /**
   * Clear all memory cache
   */
  clearMemory() {
    this.memoryCache.clear();
  }
}

export const cacheManager = new CacheManager();
export default cacheManager;
