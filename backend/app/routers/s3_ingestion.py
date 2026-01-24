"""
API Router for S3 Work Item Ingestion
Provides endpoints to trigger and monitor S3 data ingestion
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from pydantic import BaseModel
import logging

from app.services.s3_ingestion_service import get_s3_ingestion_service

router = APIRouter(prefix="/s3", tags=["s3-ingestion"])
logger = logging.getLogger(__name__)


class IngestionResponse(BaseModel):
    """Response model for ingestion status"""
    status: str
    files_processed: int
    work_items_ingested: int
    duration_seconds: Optional[float] = None
    errors: Optional[list] = None


class FolderListResponse(BaseModel):
    """Response model for folder listing"""
    folders: list[str]
    count: int


@router.post("/ingest", response_model=IngestionResponse)
async def trigger_s3_ingestion(
    folder: Optional[str] = Query(
        None,
        description="Specific folder (ingestion date) to ingest. If not provided, ingests all folders."
    )
):
    """
    Trigger S3 work item ingestion
    
    Args:
        folder: Optional specific folder to ingest (e.g., "2025-01-15")
    
    Returns:
        Ingestion statistics including files processed, work items ingested, and any errors
    
    Example:
        POST /api/s3/ingest
        POST /api/s3/ingest?folder=2025-01-15
    """
    try:
        logger.info(f"Triggering S3 ingestion for folder: {folder if folder else 'ALL'}")
        
        service = get_s3_ingestion_service()
        result = service.ingest_from_s3(specific_folder=folder)
        
        return IngestionResponse(**result)
    
    except Exception as e:
        logger.error(f"Error during S3 ingestion: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error retrieving S3 ingestion: {str(e)}"
        )


@router.get("/folders", response_model=FolderListResponse)
async def list_s3_folders():
    """
    List all available S3 folders (ingestion dates)
    
    Returns:
        List of folder names and count
    
    Example:
        GET /api/s3/folders
    """
    try:
        logger.info("Listing S3 folders")
        
        service = get_s3_ingestion_service()
        folders = service.list_s3_folders()
        
        return FolderListResponse(
            folders=folders,
            count=len(folders)
        )
    
    except Exception as e:
        logger.error(f"Error listing S3 folders: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error listing S3 folders: {str(e)}"
        )


@router.get("/folders/{folder}/files")
async def list_folder_files(folder: str):
    """
    List all JSON files in a specific S3 folder
    
    Args:
        folder: Folder name (ingestion date)
    
    Returns:
        List of JSON file paths with metadata
    
    Example:
        GET /api/s3/folders/2025-01-15/files
    """
    try:
        logger.info(f"Listing files in folder: {folder}")
        
        service = get_s3_ingestion_service()
        files_info = service.list_json_files_in_folder(folder)
        
        # Convert to JSON-serializable format
        files_list = [
            {
                'key': info['key'],
                'last_modified': info['last_modified'].isoformat() if info['last_modified'] else None
            }
            for info in files_info
        ]
        
        return {
            'folder': folder,
            'files': files_list,
            'count': len(files_list)
        }
    
    except Exception as e:
        logger.error(f"Error listing files in folder {folder}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error listing files: {str(e)}"
        )

