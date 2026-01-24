"""
Structured logging configuration for the Nvidia Dashboard.

Provides JSON-formatted logs for production and human-readable logs for development.
Includes request correlation IDs for tracing.
"""
import logging
import sys
import uuid
from contextvars import ContextVar
from datetime import datetime
from typing import Optional

from pythonjsonlogger import jsonlogger

# Context variable for request correlation ID
request_id_var: ContextVar[Optional[str]] = ContextVar('request_id', default=None)


def get_request_id() -> Optional[str]:
    """Get the current request ID from context."""
    return request_id_var.get()


def set_request_id(request_id: Optional[str] = None) -> str:
    """Set a request ID in context. Generates one if not provided."""
    if request_id is None:
        request_id = str(uuid.uuid4())[:8]
    request_id_var.set(request_id)
    return request_id


class StructuredLogFormatter(jsonlogger.JsonFormatter):
    """
    Custom JSON formatter that includes additional context fields.
    """
    
    def add_fields(self, log_record, record, message_dict):
        super().add_fields(log_record, record, message_dict)
        
        # Add timestamp in ISO format
        log_record['timestamp'] = datetime.utcnow().isoformat() + 'Z'
        
        # Add log level
        log_record['level'] = record.levelname
        
        # Add logger name
        log_record['logger'] = record.name
        
        # Add request ID if available
        request_id = get_request_id()
        if request_id:
            log_record['request_id'] = request_id
        
        # Add source location
        log_record['source'] = {
            'file': record.filename,
            'line': record.lineno,
            'function': record.funcName,
        }
        
        # Remove default fields we're replacing
        for field in ['asctime', 'created', 'filename', 'funcName', 
                      'levelname', 'levelno', 'lineno', 'module',
                      'msecs', 'name', 'pathname', 'process', 
                      'processName', 'relativeCreated', 'thread', 
                      'threadName']:
            log_record.pop(field, None)


class DevelopmentFormatter(logging.Formatter):
    """
    Human-readable formatter for development with colors.
    """
    
    COLORS = {
        'DEBUG': '\033[36m',     # Cyan
        'INFO': '\033[32m',      # Green
        'WARNING': '\033[33m',   # Yellow
        'ERROR': '\033[31m',     # Red
        'CRITICAL': '\033[35m',  # Magenta
    }
    RESET = '\033[0m'
    
    def format(self, record):
        # Add request ID if available
        request_id = get_request_id()
        request_id_str = f"[{request_id}] " if request_id else ""
        
        # Get color for log level
        color = self.COLORS.get(record.levelname, '')
        reset = self.RESET if color else ''
        
        # Format the message
        formatted = (
            f"{color}{record.levelname:8}{reset} "
            f"{request_id_str}"
            f"{record.name} - {record.getMessage()}"
        )
        
        # Add exception info if present
        if record.exc_info:
            formatted += '\n' + self.formatException(record.exc_info)
        
        return formatted


def setup_logging(debug: bool = False, log_level: str = "INFO") -> None:
    """
    Configure logging for the application.
    
    Args:
        debug: If True, use human-readable format. If False, use JSON format.
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
    """
    # Get the root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))
    
    # Remove existing handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)
    
    # Create handler for stdout
    handler = logging.StreamHandler(sys.stdout)
    
    if debug:
        # Use human-readable format for development
        formatter = DevelopmentFormatter()
    else:
        # Use JSON format for production
        formatter = StructuredLogFormatter(
            '%(timestamp)s %(level)s %(name)s %(message)s'
        )
    
    handler.setFormatter(formatter)
    root_logger.addHandler(handler)
    
    # Set levels for noisy loggers
    logging.getLogger('urllib3').setLevel(logging.WARNING)
    logging.getLogger('asyncio').setLevel(logging.WARNING)
    logging.getLogger('sqlalchemy.engine').setLevel(logging.WARNING)
    logging.getLogger('google').setLevel(logging.WARNING)
    logging.getLogger('apscheduler').setLevel(logging.WARNING)


class LoggingMiddleware:
    """
    ASGI middleware that adds request correlation IDs and logs requests.
    """
    
    def __init__(self, app):
        self.app = app
        self.logger = logging.getLogger("app.requests")
    
    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        
        # Generate or extract request ID
        request_id = None
        for header_name, header_value in scope.get("headers", []):
            if header_name.lower() == b"x-request-id":
                request_id = header_value.decode()
                break
        
        request_id = set_request_id(request_id)
        
        # Extract request info
        method = scope.get("method", "UNKNOWN")
        path = scope.get("path", "/")
        client = scope.get("client", ("unknown", 0))
        client_ip = client[0] if client else "unknown"
        
        # Log request start
        start_time = datetime.utcnow()
        self.logger.info(
            f"Request started: {method} {path}",
            extra={
                "event": "request_start",
                "method": method,
                "path": path,
                "client_ip": client_ip,
            }
        )
        
        # Track response status
        status_code = 500
        
        async def send_wrapper(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message.get("status", 500)
                # Add request ID to response headers
                headers = list(message.get("headers", []))
                headers.append((b"x-request-id", request_id.encode()))
                message["headers"] = headers
            await send(message)
        
        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            # Log request completion
            duration_ms = (datetime.utcnow() - start_time).total_seconds() * 1000
            log_method = self.logger.info if status_code < 400 else self.logger.warning
            log_method(
                f"Request completed: {method} {path} -> {status_code} ({duration_ms:.1f}ms)",
                extra={
                    "event": "request_complete",
                    "method": method,
                    "path": path,
                    "status_code": status_code,
                    "duration_ms": round(duration_ms, 2),
                    "client_ip": client_ip,
                }
            )
