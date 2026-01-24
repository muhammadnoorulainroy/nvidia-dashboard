"""
S3 Ingestion Service for Work Items
Reads JSON files from S3 and ingests work items into PostgreSQL
"""
import json
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
import boto3
from botocore.exceptions import ClientError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.dialects.postgresql import insert

from app.config import get_settings
from app.models.db_models import WorkItem, DataSyncLog

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class S3IngestionService:
    """Service to ingest work items from S3 JSON files"""
    
    def __init__(self):
        self.settings = get_settings()
        
        # Store credentials info but don't create S3 client yet (to avoid expired tokens)
        self.s3_client = None
        
        # Get S3 bucket and prefix from settings
        self.s3_bucket = self.settings.s3_bucket
        self.s3_prefix = self.settings.s3_prefix
        
        logger.info(f"S3 Configuration: s3://{self.s3_bucket}/{self.s3_prefix}")
        
        # Initialize database connection
        db_url = (
            f"postgresql://{self.settings.postgres_user}:{self.settings.postgres_password}@"
            f"{self.settings.postgres_host}:{self.settings.postgres_port}/{self.settings.postgres_db}"
        )
        self.engine = create_engine(db_url, pool_pre_ping=True)
        self.SessionLocal = sessionmaker(bind=self.engine)
    
    def _get_s3_client(self):
        """
        Get a fresh S3 client with current credentials (refreshes expired tokens)
        """
        # Use credentials from settings if available, otherwise use profile
        if self.settings.aws_access_key_id and self.settings.aws_secret_access_key:
            # Use credentials from settings (.env file)
            session = boto3.Session(
                aws_access_key_id=self.settings.aws_access_key_id,
                aws_secret_access_key=self.settings.aws_secret_access_key,
                region_name=self.settings.aws_region or 'us-east-1'
            )
            
            # If role ARN is provided, assume the role for S3 access
            if self.settings.aws_role_arn:
                sts_client = session.client('sts')
                assumed_role = sts_client.assume_role(
                    RoleArn=self.settings.aws_role_arn,
                    RoleSessionName='rubric-dashboard-s3-session',
                    DurationSeconds=3600  # 1 hour
                )
                credentials = assumed_role['Credentials']
                return boto3.client(
                    's3',
                    aws_access_key_id=credentials['AccessKeyId'],
                    aws_secret_access_key=credentials['SecretAccessKey'],
                    aws_session_token=credentials['SessionToken'],
                    region_name=self.settings.aws_region or 'us-east-1'
                )
            else:
                return session.client('s3')
        else:
            # Fall back to AWS profile
            session = boto3.Session(profile_name=self.settings.s3_aws_profile)
            return session.client('s3')
    
    def list_s3_folders(self) -> List[str]:
        """
        List all folders (ingestion dates) under the S3 prefix
        Returns list of folder names (dates)
        """
        try:
            logger.info(f"Listing folders in s3://{self.s3_bucket}/{self.s3_prefix}")
            
            s3_client = self._get_s3_client()
            paginator = s3_client.get_paginator('list_objects_v2')
            folders = set()
            
            for page in paginator.paginate(Bucket=self.s3_bucket, Prefix=self.s3_prefix, Delimiter='/'):
                if 'CommonPrefixes' in page:
                    for prefix in page['CommonPrefixes']:
                        folder_path = prefix['Prefix']
                        # Extract folder name (date) from path
                        folder_name = folder_path.replace(self.s3_prefix, '').strip('/')
                        if folder_name:
                            folders.add(folder_name)
            
            logger.info(f"Found {len(folders)} folders: {sorted(folders)}")
            return sorted(list(folders))
        
        except ClientError as e:
            logger.error(f"Error listing S3 folders: {e}")
            return []
    
    def list_json_files_in_folder(self, folder_name: str) -> List[Dict[str, Any]]:
        """
        List all JSON files in a specific folder with their metadata
        Args:
            folder_name: The folder name (ingestion date)
        Returns:
            List of dictionaries with 'key' and 'last_modified' for each JSON file
        """
        try:
            folder_prefix = f"{self.s3_prefix}{folder_name}/"
            logger.info(f"Listing JSON files in s3://{self.s3_bucket}/{folder_prefix}")
            
            s3_client = self._get_s3_client()
            paginator = s3_client.get_paginator('list_objects_v2')
            json_files = []
            
            for page in paginator.paginate(Bucket=self.s3_bucket, Prefix=folder_prefix):
                if 'Contents' in page:
                    for obj in page['Contents']:
                        key = obj['Key']
                        if key.endswith('.json'):
                            json_files.append({
                                'key': key,
                                'last_modified': obj['LastModified']  # This is the upload date
                            })
            
            logger.info(f"Found {len(json_files)} JSON files in folder {folder_name}")
            return json_files
        
        except ClientError as e:
            logger.error(f"Error listing JSON files in folder {folder_name}: {e}")
            return []
    
    def read_json_from_s3(self, s3_key: str) -> Optional[Dict[str, Any]]:
        """
        Read and parse a JSON file from S3
        Args:
            s3_key: Full S3 key path to the JSON file
        Returns:
            Parsed JSON content as dictionary
        """
        try:
            logger.info(f"Reading s3://{self.s3_bucket}/{s3_key}")
            
            s3_client = self._get_s3_client()
            response = s3_client.get_object(Bucket=self.s3_bucket, Key=s3_key)
            content = response['Body'].read().decode('utf-8')
            return json.loads(content)
        
        except ClientError as e:
            logger.error(f"Error reading S3 file {s3_key}: {e}")
            return None
        except json.JSONDecodeError as e:
            logger.error(f"Error parsing JSON from {s3_key}: {e}")
            return None
    
    def extract_work_items_from_json(
        self, 
        json_data: Dict[str, Any], 
        ingestion_date: str,
        json_filename: str,
        delivery_date: datetime
    ) -> List[Dict[str, Any]]:
        """
        Extract work items from parsed JSON data
        Args:
            json_data: Parsed JSON content
            ingestion_date: Folder name (date)
            json_filename: Name of the JSON file
            delivery_date: File upload date from S3
        Returns:
            List of work item dictionaries ready for database insertion
        """
        work_items = []
        
        # Check if 'workitems' key exists
        if 'workitems' not in json_data:
            logger.warning(f"No 'workitems' key found in {json_filename}")
            return work_items
        
        workitems_list = json_data['workitems']
        if not isinstance(workitems_list, list):
            logger.warning(f"'workitems' is not a list in {json_filename}")
            return work_items
        
        for workitem in workitems_list:
            try:
                work_item_id = workitem.get('workItemId')
                if not work_item_id:
                    logger.warning(f"Missing workItemId in {json_filename}")
                    continue
                
                # Extract annotatorId from metadata
                annotator_id = None
                if 'metadata' in workitem and isinstance(workitem['metadata'], dict):
                    annotator_id = workitem['metadata'].get('annotatorId')
                
                # Extract taskId from the UUID key (e.g., "2d777b79-8c8d-4ddd-9603-d5050a8b5a4c")
                # Find the first key that looks like a UUID and contains task data
                task_id = None
                for key, value in workitem.items():
                    if isinstance(value, list) and len(value) > 0:
                        # Check if this list contains task metadata
                        if isinstance(value[0], dict) and 'metadata' in value[0]:
                            task_metadata = value[0]['metadata']
                            if isinstance(task_metadata, dict) and 'taskId' in task_metadata:
                                task_id = task_metadata['taskId']
                                break
                
                if not task_id:
                    logger.warning(f"Could not extract taskId for workItemId {work_item_id} in {json_filename}")
                    continue
                
                # Generate colab_link
                colab_link = f"https://rlhf-v3.turing.com/prompt/{task_id}"
                
                work_item_data = {
                    'work_item_id': work_item_id,
                    'task_id': task_id,
                    'annotator_id': annotator_id,
                    'colab_link': colab_link,
                    'ingestion_date': ingestion_date,
                    'delivery_date': delivery_date,
                    'json_filename': json_filename,
                }
                
                work_items.append(work_item_data)
                
            except Exception as e:
                logger.error(f"Error processing work item in {json_filename}: {e}")
                continue
        
        logger.info(f"Extracted {len(work_items)} work items from {json_filename}")
        return work_items
    
    def insert_work_items(self, work_items: List[Dict[str, Any]]) -> int:
        """
        Insert work items into PostgreSQL database using upsert
        Args:
            work_items: List of work item dictionaries
        Returns:
            Number of records inserted/updated
        """
        if not work_items:
            return 0
        
        session = self.SessionLocal()
        try:
            # Use PostgreSQL's INSERT ... ON CONFLICT for upsert
            stmt = insert(WorkItem).values(work_items)
            stmt = stmt.on_conflict_do_update(
                index_elements=['work_item_id'],
                set_={
                    'task_id': stmt.excluded.task_id,
                    'annotator_id': stmt.excluded.annotator_id,
                    'colab_link': stmt.excluded.colab_link,
                    'ingestion_date': stmt.excluded.ingestion_date,
                    'delivery_date': stmt.excluded.delivery_date,
                    'json_filename': stmt.excluded.json_filename,
                }
            )
            
            session.execute(stmt)
            session.commit()
            
            logger.info(f"Successfully upserted {len(work_items)} work items")
            return len(work_items)
        
        except Exception as e:
            session.rollback()
            logger.error(f"Error inserting work items: {e}")
            raise
        finally:
            session.close()
    
    def ingest_from_s3(self, specific_folder: Optional[str] = None) -> Dict[str, Any]:
        """
        Main ingestion function - reads all JSON files from S3 and ingests work items
        Args:
            specific_folder: Optional specific folder to ingest (ingestion date)
        Returns:
            Dictionary with ingestion statistics
        """
        start_time = datetime.now()
        total_files_processed = 0
        total_work_items = 0
        errors = []
        
        session = self.SessionLocal()
        
        try:
            # Log sync start
            sync_log = DataSyncLog(
                table_name='work_item',
                sync_started_at=start_time,
                sync_status='started',
                sync_type='manual' if specific_folder else 'scheduled'
            )
            session.add(sync_log)
            session.commit()
            sync_log_id = sync_log.id
            
            # Get folders to process
            if specific_folder:
                folders = [specific_folder]
            else:
                folders = self.list_s3_folders()
            
            if not folders:
                logger.warning("No folders found to process")
                return {
                    'status': 'completed',
                    'files_processed': 0,
                    'work_items_ingested': 0,
                    'errors': ['No folders found']
                }
            
            # Process each folder
            for folder in folders:
                logger.info(f"Processing folder: {folder}")
                
                # Get all JSON files in the folder with metadata
                json_files_info = self.list_json_files_in_folder(folder)
                
                for json_file_info in json_files_info:
                    try:
                        # Extract key and last_modified date
                        json_key = json_file_info['key']
                        delivery_date = json_file_info['last_modified']
                        
                        # Extract filename
                        filename = json_key.split('/')[-1]
                        
                        # Read JSON from S3
                        json_data = self.read_json_from_s3(json_key)
                        if not json_data:
                            errors.append(f"Could not read {json_key}")
                            continue
                        
                        # Extract work items with delivery_date
                        work_items = self.extract_work_items_from_json(json_data, folder, filename, delivery_date)
                        
                        # Insert into database
                        if work_items:
                            inserted_count = self.insert_work_items(work_items)
                            total_work_items += inserted_count
                        
                        total_files_processed += 1
                        
                    except Exception as e:
                        error_msg = f"Error processing {json_key}: {str(e)}"
                        logger.error(error_msg)
                        errors.append(error_msg)
            
            # Update is_delivered status in Task table based on newly synced work_items
            try:
                from app.services.data_sync_service import get_data_sync_service
                data_sync_service = get_data_sync_service()
                data_sync_service._update_is_delivered_status()
            except Exception as e:
                logger.error(f"Error updating is_delivered status: {e}")
                errors.append(f"Failed to update is_delivered status: {str(e)}")
            
            # Update sync log
            end_time = datetime.now()
            sync_log = session.query(DataSyncLog).filter_by(id=sync_log_id).first()
            sync_log.sync_completed_at = end_time
            sync_log.records_synced = total_work_items
            sync_log.sync_status = 'completed' if not errors else 'completed_with_errors'
            if errors:
                sync_log.error_message = '; '.join(errors[:10])  # Store first 10 errors
            session.commit()
            
            result = {
                'status': 'completed' if not errors else 'completed_with_errors',
                'files_processed': total_files_processed,
                'work_items_ingested': total_work_items,
                'duration_seconds': (end_time - start_time).total_seconds(),
                'errors': errors if errors else None
            }
            
            logger.info(f"Ingestion completed: {result}")
            return result
        
        except Exception as e:
            # Log failure
            sync_log = session.query(DataSyncLog).filter_by(id=sync_log_id).first()
            if sync_log:
                sync_log.sync_status = 'failed'
                sync_log.error_message = str(e)
                sync_log.sync_completed_at = datetime.now()
                session.commit()
            
            logger.error(f"Fatal error during ingestion: {e}")
            raise
        finally:
            session.close()


# Singleton instance
_s3_ingestion_service = None

def get_s3_ingestion_service() -> S3IngestionService:
    """Get or create S3 ingestion service instance"""
    global _s3_ingestion_service
    if _s3_ingestion_service is None:
        _s3_ingestion_service = S3IngestionService()
    return _s3_ingestion_service

