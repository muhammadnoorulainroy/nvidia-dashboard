"""
In-memory caching for query results.

This cache is **event-driven**, not time-driven:
- Cache is invalidated ONLY when data sync completes
- No automatic TTL expiration (data doesn't change between syncs)
- Optional safety TTL as a fallback (default: 24 hours)

This ensures we don't re-query unchanged data between sync intervals.
"""
import logging
import time
import hashlib
import json
from datetime import datetime, timedelta
from threading import Lock
from typing import Optional, Any, Dict, Callable, TypeVar
from functools import wraps

logger = logging.getLogger(__name__)

T = TypeVar('T')

# Very long TTL as safety net (24 hours) - cache is primarily invalidated by sync events
DEFAULT_SAFETY_TTL = 86400  # 24 hours


class CacheEntry:
    """A single cache entry with optional TTL."""
    
    def __init__(self, value: Any, ttl_seconds: Optional[int] = None):
        self.value = value
        self.created_at = time.time()
        self.ttl_seconds = ttl_seconds or DEFAULT_SAFETY_TTL
        self.hits = 0
    
    @property
    def is_expired(self) -> bool:
        """Check if entry has exceeded safety TTL."""
        return time.time() - self.created_at > self.ttl_seconds
    
    @property
    def age_seconds(self) -> float:
        return time.time() - self.created_at


class QueryCache:
    """
    Thread-safe in-memory cache for query results.
    
    This cache is designed for data that only changes on sync:
    - Entries persist until explicitly invalidated (on sync) or max size reached
    - Safety TTL (24h) prevents stale data if sync fails repeatedly
    - LRU eviction when max size reached
    - Statistics tracking
    - Thread-safe operations
    """
    
    def __init__(self, default_ttl: int = DEFAULT_SAFETY_TTL, max_size: int = 1000):
        """
        Initialize cache.
        
        Args:
            default_ttl: Safety TTL in seconds (24 hours default - cache is invalidated by sync events)
            max_size: Maximum number of entries
        """
        self.default_ttl = default_ttl
        self.max_size = max_size
        self._cache: Dict[str, CacheEntry] = {}
        self._lock = Lock()
        self._last_invalidation: Optional[float] = None
        
        # Statistics
        self._hits = 0
        self._misses = 0
        self._evictions = 0
        self._invalidations = 0
    
    def _make_key(self, prefix: str, *args, **kwargs) -> str:
        """Generate a cache key from function arguments."""
        key_parts = [prefix]
        
        # Add positional args
        for arg in args:
            key_parts.append(str(arg))
        
        # Add keyword args (sorted for consistency)
        for k, v in sorted(kwargs.items()):
            if v is not None:
                key_parts.append(f"{k}={v}")
        
        key_str = ":".join(key_parts)
        
        # Hash long keys
        if len(key_str) > 200:
            key_str = prefix + ":" + hashlib.md5(key_str.encode()).hexdigest()
        
        return key_str
    
    def get(self, key: str) -> Optional[Any]:
        """Get a value from cache."""
        with self._lock:
            entry = self._cache.get(key)
            
            if entry is None:
                self._misses += 1
                return None
            
            if entry.is_expired:
                del self._cache[key]
                self._misses += 1
                return None
            
            entry.hits += 1
            self._hits += 1
            return entry.value
    
    def set(self, key: str, value: Any, ttl: Optional[int] = None):
        """Set a value in cache."""
        ttl = ttl or self.default_ttl
        
        with self._lock:
            # Evict if at capacity
            if len(self._cache) >= self.max_size:
                self._evict_oldest()
            
            self._cache[key] = CacheEntry(value, ttl)
    
    def delete(self, key: str):
        """Delete a specific key."""
        with self._lock:
            self._cache.pop(key, None)
    
    def clear(self):
        """Clear all cache entries (typically called after sync)."""
        with self._lock:
            count = len(self._cache)
            self._cache.clear()
            self._invalidations += 1
            self._last_invalidation = time.time()
            logger.info(f"Cache cleared: {count} entries invalidated")
    
    def clear_prefix(self, prefix: str):
        """Clear all entries with a given prefix."""
        with self._lock:
            keys_to_delete = [k for k in self._cache.keys() if k.startswith(prefix)]
            for key in keys_to_delete:
                del self._cache[key]
            if keys_to_delete:
                self._invalidations += 1
                self._last_invalidation = time.time()
            logger.info(f"Cleared {len(keys_to_delete)} entries with prefix '{prefix}'")
    
    def _evict_oldest(self):
        """Evict the oldest entry (LRU)."""
        if not self._cache:
            return
        
        # Find oldest entry
        oldest_key = min(self._cache.keys(), key=lambda k: self._cache[k].created_at)
        del self._cache[oldest_key]
        self._evictions += 1
    
    def cleanup_expired(self):
        """Remove all expired entries."""
        with self._lock:
            expired_keys = [k for k, v in self._cache.items() if v.is_expired]
            for key in expired_keys:
                del self._cache[key]
            
            if expired_keys:
                logger.debug(f"Cleaned up {len(expired_keys)} expired cache entries")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        with self._lock:
            total_requests = self._hits + self._misses
            hit_rate = (self._hits / total_requests * 100) if total_requests > 0 else 0
            
            # Calculate time since last invalidation
            last_invalidation_ago = None
            if self._last_invalidation:
                last_invalidation_ago = round(time.time() - self._last_invalidation, 1)
            
            return {
                "size": len(self._cache),
                "max_size": self.max_size,
                "hits": self._hits,
                "misses": self._misses,
                "hit_rate_percent": round(hit_rate, 2),
                "evictions": self._evictions,
                "invalidations": self._invalidations,
                "last_invalidation_seconds_ago": last_invalidation_ago,
                "safety_ttl_seconds": self.default_ttl,
                "strategy": "event-driven (invalidated on sync)",
            }


# Global cache instance
_query_cache: Optional[QueryCache] = None


def get_query_cache() -> QueryCache:
    """Get or create the global query cache."""
    global _query_cache
    if _query_cache is None:
        # Cache is event-driven (invalidated on sync), safety TTL is 24 hours
        _query_cache = QueryCache(default_ttl=DEFAULT_SAFETY_TTL, max_size=1000)
    return _query_cache


def cached(
    prefix: Optional[str] = None,
    key_builder: Optional[Callable] = None,
):
    """
    Decorator to cache function results.
    
    Cache is event-driven - entries persist until invalidated by sync.
    No TTL needed since data only changes when sync completes.
    
    Args:
        prefix: Cache key prefix (uses function name if not specified)
        key_builder: Custom function to build cache key
        
    Example:
        @cached(prefix="domain_stats")
        def get_domain_aggregation(filters):
            ...
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        cache_prefix = prefix or func.__name__
        
        @wraps(func)
        def wrapper(*args, **kwargs):
            cache = get_query_cache()
            
            # Build cache key
            if key_builder:
                cache_key = key_builder(*args, **kwargs)
            else:
                cache_key = cache._make_key(cache_prefix, *args, **kwargs)
            
            # Try to get from cache
            cached_value = cache.get(cache_key)
            if cached_value is not None:
                logger.debug(f"Cache hit for {cache_prefix}")
                return cached_value
            
            # Execute function and cache result (no TTL - invalidated on sync)
            result = func(*args, **kwargs)
            cache.set(cache_key, result)
            logger.debug(f"Cache miss for {cache_prefix}, cached result")
            
            return result
        
        # Add cache control methods to the wrapped function
        wrapper.cache_clear = lambda: get_query_cache().clear_prefix(cache_prefix)
        wrapper.cache_key_prefix = cache_prefix
        
        return wrapper
    return decorator


def invalidate_stats_cache():
    """Invalidate all statistics-related cache entries."""
    cache = get_query_cache()
    cache.clear_prefix("domain")
    cache.clear_prefix("reviewer")
    cache.clear_prefix("trainer")
    cache.clear_prefix("overall")
    cache.clear_prefix("pod_lead")
    logger.info("Statistics cache invalidated")
