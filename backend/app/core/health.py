"""
Health check endpoints with dependency verification.

Provides comprehensive health checks for:
- Application status (liveness)
- Dependency status (readiness)
- Individual component health
- Cache statistics
- Connection pool monitoring
"""
import logging
from datetime import datetime
from typing import Dict, Any, Optional
from enum import Enum
from pydantic import BaseModel
from sqlalchemy import text

from app.core.config import get_settings
from app.services.db_service import get_db_service
from app.core.cache import get_query_cache

logger = logging.getLogger(__name__)


class HealthStatus(str, Enum):
    """Health status values."""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"


class ComponentHealth(BaseModel):
    """Health status of a single component."""
    name: str
    status: HealthStatus
    latency_ms: Optional[float] = None
    message: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


class HealthCheckResponse(BaseModel):
    """Complete health check response."""
    status: HealthStatus
    version: str
    timestamp: str
    uptime_seconds: Optional[float] = None
    components: Dict[str, ComponentHealth]


class HealthChecker:
    """
    Service for checking health of application components.
    """
    
    def __init__(self):
        self.settings = get_settings()
        self._start_time = datetime.utcnow()
    
    def get_uptime_seconds(self) -> float:
        """Get application uptime in seconds."""
        return (datetime.utcnow() - self._start_time).total_seconds()
    
    async def check_postgres(self) -> ComponentHealth:
        """
        Check PostgreSQL database connectivity and health.
        """
        start = datetime.utcnow()
        try:
            db_service = get_db_service()
            
            if not db_service._initialized:
                return ComponentHealth(
                    name="postgresql",
                    status=HealthStatus.UNHEALTHY,
                    message="Database not initialized"
                )
            
            # Execute a simple query to verify connectivity
            with db_service.get_session() as session:
                result = session.execute(text("SELECT 1"))
                result.fetchone()
            
            latency = (datetime.utcnow() - start).total_seconds() * 1000
            
            # Get some stats
            task_count = db_service.get_table_row_count('task')
            
            return ComponentHealth(
                name="postgresql",
                status=HealthStatus.HEALTHY,
                latency_ms=round(latency, 2),
                message="Connected",
                details={
                    "host": self.settings.postgres_host,
                    "database": self.settings.postgres_db,
                    "task_count": task_count,
                }
            )
        except Exception as e:
            latency = (datetime.utcnow() - start).total_seconds() * 1000
            logger.error(f"PostgreSQL health check failed: {e}")
            return ComponentHealth(
                name="postgresql",
                status=HealthStatus.UNHEALTHY,
                latency_ms=round(latency, 2),
                message=f"Connection failed: {str(e)}"
            )
    
    async def check_bigquery(self) -> ComponentHealth:
        """
        Check BigQuery connectivity (lightweight check).
        
        Note: Full connectivity check requires GCP credentials.
        This only verifies the client can be initialized.
        """
        start = datetime.utcnow()
        try:
            from app.services.data_sync_service import get_data_sync_service
            
            sync_service = get_data_sync_service()
            
            # Check if BigQuery client is initialized
            if sync_service.bq_client is not None:
                latency = (datetime.utcnow() - start).total_seconds() * 1000
                return ComponentHealth(
                    name="bigquery",
                    status=HealthStatus.HEALTHY,
                    latency_ms=round(latency, 2),
                    message="Client initialized",
                    details={
                        "project": self.settings.gcp_project_id,
                        "dataset": self.settings.bigquery_dataset,
                    }
                )
            else:
                latency = (datetime.utcnow() - start).total_seconds() * 1000
                return ComponentHealth(
                    name="bigquery",
                    status=HealthStatus.DEGRADED,
                    latency_ms=round(latency, 2),
                    message="Client not initialized (will initialize on first sync)"
                )
        except Exception as e:
            latency = (datetime.utcnow() - start).total_seconds() * 1000
            logger.error(f"BigQuery health check failed: {e}")
            return ComponentHealth(
                name="bigquery",
                status=HealthStatus.UNHEALTHY,
                latency_ms=round(latency, 2),
                message=f"Error: {str(e)}"
            )
    
    async def check_scheduler(self) -> ComponentHealth:
        """
        Check if the APScheduler is running.
        """
        try:
            from app.main import scheduler
            
            if scheduler.running:
                jobs = scheduler.get_jobs()
                return ComponentHealth(
                    name="scheduler",
                    status=HealthStatus.HEALTHY,
                    message="Running",
                    details={
                        "jobs_count": len(jobs),
                        "jobs": [
                            {
                                "id": job.id,
                                "name": job.name,
                                "next_run": job.next_run_time.isoformat() if job.next_run_time else None
                            }
                            for job in jobs
                        ]
                    }
                )
            else:
                return ComponentHealth(
                    name="scheduler",
                    status=HealthStatus.DEGRADED,
                    message="Scheduler not running"
                )
        except Exception as e:
            logger.error(f"Scheduler health check failed: {e}")
            return ComponentHealth(
                name="scheduler",
                status=HealthStatus.UNHEALTHY,
                message=f"Error: {str(e)}"
            )
    
    async def check_cache(self) -> ComponentHealth:
        """Check query cache status."""
        try:
            cache = get_query_cache()
            stats = cache.get_stats()
            
            return ComponentHealth(
                name="cache",
                status=HealthStatus.HEALTHY,
                message=f"Hit rate: {stats['hit_rate_percent']}%",
                details=stats
            )
        except Exception as e:
            return ComponentHealth(
                name="cache",
                status=HealthStatus.DEGRADED,
                message=f"Error: {str(e)}"
            )
    
    async def check_connection_pool(self) -> ComponentHealth:
        """Check database connection pool status."""
        try:
            db_service = get_db_service()
            pool_status = db_service.get_pool_status()
            
            if pool_status.get("status") == "error":
                return ComponentHealth(
                    name="connection_pool",
                    status=HealthStatus.DEGRADED,
                    message=pool_status.get("error", "Unknown error")
                )
            
            # Check if pool is healthy
            checked_out = pool_status.get("checked_out", 0)
            pool_size = pool_status.get("pool_size", 10)
            utilization = (checked_out / pool_size * 100) if pool_size > 0 else 0
            
            if utilization > 90:
                status = HealthStatus.DEGRADED
                message = f"High utilization: {utilization:.0f}%"
            else:
                status = HealthStatus.HEALTHY
                message = f"Utilization: {utilization:.0f}%"
            
            return ComponentHealth(
                name="connection_pool",
                status=status,
                message=message,
                details=pool_status
            )
        except Exception as e:
            return ComponentHealth(
                name="connection_pool",
                status=HealthStatus.DEGRADED,
                message=f"Error: {str(e)}"
            )
    
    async def check_all(self) -> HealthCheckResponse:
        """
        Perform comprehensive health check of all components.
        """
        components = {}
        
        # Check each component
        components["postgresql"] = await self.check_postgres()
        components["bigquery"] = await self.check_bigquery()
        components["scheduler"] = await self.check_scheduler()
        components["cache"] = await self.check_cache()
        components["connection_pool"] = await self.check_connection_pool()
        
        # Determine overall status (only consider critical components)
        critical_components = ["postgresql"]
        non_critical = ["cache", "connection_pool", "scheduler", "bigquery"]
        
        critical_statuses = [components[c].status for c in critical_components if c in components]
        non_critical_statuses = [components[c].status for c in non_critical if c in components]
        
        if any(s == HealthStatus.UNHEALTHY for s in critical_statuses):
            overall_status = HealthStatus.UNHEALTHY
        elif any(s == HealthStatus.UNHEALTHY for s in non_critical_statuses):
            overall_status = HealthStatus.DEGRADED
        elif any(s == HealthStatus.DEGRADED for s in critical_statuses + non_critical_statuses):
            overall_status = HealthStatus.DEGRADED
        else:
            overall_status = HealthStatus.HEALTHY
        
        return HealthCheckResponse(
            status=overall_status,
            version=self.settings.app_version,
            timestamp=datetime.utcnow().isoformat() + "Z",
            uptime_seconds=round(self.get_uptime_seconds(), 2),
            components=components
        )
    
    async def liveness_check(self) -> Dict[str, Any]:
        """
        Simple liveness check - is the application running?
        Used by Kubernetes liveness probes.
        """
        return {
            "status": "alive",
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
    
    async def readiness_check(self) -> Dict[str, Any]:
        """
        Readiness check - is the application ready to serve requests?
        Used by Kubernetes readiness probes.
        """
        # Check critical dependencies
        postgres_health = await self.check_postgres()
        
        is_ready = postgres_health.status != HealthStatus.UNHEALTHY
        
        return {
            "status": "ready" if is_ready else "not_ready",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "checks": {
                "postgresql": postgres_health.status.value
            }
        }


# Global health checker instance
_health_checker: Optional[HealthChecker] = None


def get_health_checker() -> HealthChecker:
    """Get or create the health checker instance."""
    global _health_checker
    if _health_checker is None:
        _health_checker = HealthChecker()
    return _health_checker
