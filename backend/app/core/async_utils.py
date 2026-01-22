"""
Async utilities for running blocking operations in thread pools.

This module provides utilities to safely run synchronous (blocking) operations
from async contexts without blocking the event loop.
"""
import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from functools import wraps, partial
from typing import Callable, TypeVar, Any, Optional

logger = logging.getLogger(__name__)

# Global thread pool for CPU-bound or blocking I/O operations
_thread_pool: Optional[ThreadPoolExecutor] = None
_MAX_WORKERS = 4  # Limit concurrent blocking operations


def get_thread_pool() -> ThreadPoolExecutor:
    """Get or create the global thread pool."""
    global _thread_pool
    if _thread_pool is None:
        _thread_pool = ThreadPoolExecutor(
            max_workers=_MAX_WORKERS,
            thread_name_prefix="sync_worker_"
        )
    return _thread_pool


def shutdown_thread_pool():
    """Shutdown the global thread pool gracefully."""
    global _thread_pool
    if _thread_pool is not None:
        _thread_pool.shutdown(wait=True)
        _thread_pool = None
        logger.info("Thread pool shut down")


T = TypeVar('T')


async def run_in_thread(func: Callable[..., T], *args, **kwargs) -> T:
    """
    Run a synchronous function in a thread pool.
    
    This prevents blocking the asyncio event loop when calling
    synchronous code (like database operations or HTTP requests).
    
    Args:
        func: The synchronous function to run
        *args, **kwargs: Arguments to pass to the function
        
    Returns:
        The result of the function
        
    Example:
        result = await run_in_thread(sync_database_query, param1, param2)
    """
    loop = asyncio.get_event_loop()
    executor = get_thread_pool()
    
    # Use partial to bind arguments
    if kwargs:
        func_with_args = partial(func, *args, **kwargs)
    elif args:
        func_with_args = partial(func, *args)
    else:
        func_with_args = func
    
    return await loop.run_in_executor(executor, func_with_args)


def async_wrap(func: Callable[..., T]) -> Callable[..., T]:
    """
    Decorator to wrap a synchronous function for async execution.
    
    The wrapped function will run in a thread pool when called.
    
    Example:
        @async_wrap
        def slow_blocking_operation():
            time.sleep(5)
            return "done"
        
        # Now can be called from async context
        result = await slow_blocking_operation()
    """
    @wraps(func)
    async def wrapper(*args, **kwargs):
        return await run_in_thread(func, *args, **kwargs)
    return wrapper


class AsyncBlockingTask:
    """
    Context manager for running blocking tasks with proper cleanup.
    
    Example:
        async with AsyncBlockingTask() as task:
            result = await task.run(blocking_function, arg1, arg2)
    """
    
    def __init__(self):
        self._executor = None
    
    async def __aenter__(self):
        self._executor = get_thread_pool()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        # Don't shutdown shared pool
        pass
    
    async def run(self, func: Callable[..., T], *args, **kwargs) -> T:
        """Run a blocking function."""
        return await run_in_thread(func, *args, **kwargs)


# =============================================================================
# Async-safe versions of common operations
# =============================================================================

async def async_sleep(seconds: float):
    """Async-safe sleep that doesn't block the event loop."""
    await asyncio.sleep(seconds)


async def gather_with_concurrency(n: int, *tasks):
    """
    Run async tasks with a concurrency limit.
    
    Args:
        n: Maximum number of concurrent tasks
        *tasks: The coroutines to run
        
    Returns:
        List of results in the same order as input tasks
    """
    semaphore = asyncio.Semaphore(n)
    
    async def sem_task(task):
        async with semaphore:
            return await task
    
    return await asyncio.gather(*(sem_task(task) for task in tasks))
