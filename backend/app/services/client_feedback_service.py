"""
Service to handle client feedback CSV/Excel uploads
Updates work_item table with client status (verdict)
"""
import pandas as pd
import logging
from typing import Dict, Any, List
from io import BytesIO
from app.services.db_service import get_db_service
from app.models.db_models import WorkItem

logger = logging.getLogger(__name__)


class ClientFeedbackService:
    """Service to process client feedback uploads"""
    
    def __init__(self):
        self.db_service = get_db_service()
    
    def process_upload(self, file_content: bytes, filename: str) -> Dict[str, Any]:
        """
        Process uploaded CSV/Excel file and update work_item table
        
        Required columns:
        - Work Item Id (required) - Used for matching
        - Verdict (required) - Updates client_status
        
        Optional columns (ignored):
        - Task Id
        - taxonomy_label
        - Labelled Timestamp
        - isAuditDiscarded
        - prompt
        - Input_1
        - Pass_1
        - ManualAssessmentData
        - Task Level Feedback
        - Error Categories
        
        Matching: Uses ONLY work_item_id (not task_id)
        
        Args:
            file_content: Raw file bytes
            filename: Original filename
            
        Returns:
            Dict with processing results
        """
        try:
            # Read file based on extension
            if filename.endswith('.csv'):
                df = pd.read_csv(BytesIO(file_content))
            elif filename.endswith(('.xlsx', '.xls')):
                df = pd.read_excel(BytesIO(file_content))
            else:
                raise ValueError(f"Unsupported file format: {filename}. Please upload CSV or Excel file.")
            
            logger.info(f"Processing file: {filename} with {len(df)} rows")
            logger.info(f"Original columns: {df.columns.tolist()}")
            
            # Normalize column names: strip, lowercase, remove non-alphanumeric
            def normalize_column_name(col):
                import re
                # Convert to lowercase, strip whitespace
                normalized = str(col).strip().lower()
                # Remove non-alphanumeric characters (keep only letters and numbers)
                normalized = re.sub(r'[^a-z0-9]', '', normalized)
                return normalized
            
            # Create mapping of normalized names to original names
            original_columns = df.columns.tolist()
            normalized_mapping = {normalize_column_name(col): col for col in original_columns}
            
            logger.info(f"Column mapping: {normalized_mapping}")
            
            # Find required columns by normalized names
            required_normalized = {
                'workitemid': 'work_item_id',
                'verdict': 'verdict'
            }
            
            # Optional columns
            optional_normalized = {
                'tasklevelfeedback': 'task_level_feedback',
                'errorcategories': 'error_categories'
            }
            
            # Map Excel columns to database columns (required)
            column_map = {}
            for norm_name, db_name in required_normalized.items():
                if norm_name in normalized_mapping:
                    column_map[db_name] = normalized_mapping[norm_name]
                else:
                    raise ValueError(f"Required column not found: {db_name} (looking for normalized: {norm_name})")
            
            # Map optional columns
            for norm_name, db_name in optional_normalized.items():
                if norm_name in normalized_mapping:
                    column_map[db_name] = normalized_mapping[norm_name]
            
            logger.info(f"Column map: {column_map}")
            
            # Create a new dataframe with standardized column names
            df_clean = pd.DataFrame()
            df_clean['work_item_id'] = df[column_map['work_item_id']].astype(str).str.strip()
            df_clean['verdict'] = df[column_map['verdict']].astype(str).str.strip()
            
            # Add optional columns if present
            if 'task_level_feedback' in column_map:
                df_clean['task_level_feedback'] = df[column_map['task_level_feedback']].astype(str).str.strip()
            else:
                df_clean['task_level_feedback'] = None
                
            if 'error_categories' in column_map:
                df_clean['error_categories'] = df[column_map['error_categories']].astype(str).str.strip()
            else:
                df_clean['error_categories'] = None
            
            # Remove rows with null/empty values in key columns
            df_clean = df_clean.dropna(subset=['work_item_id', 'verdict'])
            df_clean = df_clean[df_clean['verdict'] != '']
            
            df = df_clean
            
            logger.info(f"Valid rows after cleaning: {len(df)}")
            
            # Update work_item table
            results = self._update_work_items(df)
            
            return {
                'success': True,
                'total_rows': len(df),
                'updated_count': results['updated'],
                'not_found_count': results['not_found'],
                'error_count': results['errors'],
                'message': f"Successfully processed {results['updated']} work items"
            }
            
        except Exception as e:
            logger.error(f"Error processing upload: {e}")
            return {
                'success': False,
                'error': str(e),
                'message': f"Failed to process file: {str(e)}"
            }
    
    def _update_work_items(self, df: pd.DataFrame) -> Dict[str, int]:
        """
        Update work_item table with client_status from Verdict column
        
        Args:
            df: DataFrame with Work Item Id, Task Id, and Verdict columns
            
        Returns:
            Dict with counts of updated, not_found, and errors
        """
        updated = 0
        not_found = 0
        errors = 0
        
        try:
            with self.db_service.get_session() as session:
                for _, row in df.iterrows():
                    try:
                        work_item_id = str(row['work_item_id']).strip()
                        verdict = str(row['verdict']).strip()
                        task_level_feedback = str(row['task_level_feedback']) if pd.notna(row['task_level_feedback']) else None
                        error_categories = str(row['error_categories']) if pd.notna(row['error_categories']) else None
                        
                        # Find work_item by work_item_id only
                        work_item = session.query(WorkItem).filter(
                            WorkItem.work_item_id == work_item_id
                        ).first()
                        
                        if work_item:
                            # Update client_status with verdict value
                            work_item.client_status = verdict
                            
                            # Update feedback fields if provided
                            if task_level_feedback and task_level_feedback != 'None':
                                work_item.task_level_feedback = task_level_feedback
                            if error_categories and error_categories != 'None':
                                work_item.error_categories = error_categories
                            
                            # Update turing_status based on verdict
                            verdict_upper = verdict.upper()
                            if verdict_upper == 'REJECTED':
                                work_item.turing_status = 'Rework'
                                logger.info(f"Work item {work_item_id}: client_status=REJECTED, turing_status set to Rework")
                            elif verdict_upper in ['APPROVED', 'APPROVE']:
                                work_item.turing_status = 'Delivered'
                                logger.info(f"Work item {work_item_id}: client_status={verdict_upper}, turing_status set to Delivered")
                            
                            updated += 1
                            
                            if updated % 100 == 0:
                                logger.info(f"Updated {updated} work items...")
                        else:
                            logger.warning(f"Work item not found: work_item_id={work_item_id}")
                            not_found += 1
                            
                    except Exception as e:
                        logger.error(f"Error updating work item {work_item_id}: {e}")
                        errors += 1
                        continue
                
                # Commit all updates
                session.commit()
                logger.info(f"✅ Update complete: {updated} updated, {not_found} not found, {errors} errors")
                
        except Exception as e:
            logger.error(f"Database error during update: {e}")
            raise
        
        return {
            'updated': updated,
            'not_found': not_found,
            'errors': errors
        }


# Global service instance
_client_feedback_service = None


def get_client_feedback_service() -> ClientFeedbackService:
    """Get or create the global client feedback service instance"""
    global _client_feedback_service
    if _client_feedback_service is None:
        _client_feedback_service = ClientFeedbackService()
    return _client_feedback_service

