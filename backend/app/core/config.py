"""
Re-export configuration from app.config for backward compatibility.

This allows imports from both:
- from app.config import get_settings
- from app.core.config import get_settings
"""
from app.config import Settings, get_settings

__all__ = ["Settings", "get_settings"]
