# BigQuery Dataset Documentation

**Dataset**: `turing-gpt.prod_labeling_tool_n`  
**Generated**: 2026-01-28T09:23:19.828193  
**Total Tables**: 66

---

## Table of Contents

- [accent](#accent)
- [app_config](#app-config)
- [app_config_group](#app-config-group)
- [app_config_history](#app-config-history)
- [auto_prompt_improvement_trigger](#auto-prompt-improvement-trigger)
- [batch](#batch)
- [batch_auto_review](#batch-auto-review)
- [batch_import_attempt](#batch-import-attempt)
- [batch_statistics](#batch-statistics)
- [category](#category)
- [contributor](#contributor)
- [contributor_history](#contributor-history)
- [conversation](#conversation)
- [conversation_import_attempt](#conversation-import-attempt)
- [conversation_label](#conversation-label)
- [conversation_message](#conversation-message)
- [conversation_seed](#conversation-seed)
- [conversation_status_history](#conversation-status-history)
- [conversation_version](#conversation-version)
- [delivery_batch](#delivery-batch)
- [delivery_batch_auto_review_item](#delivery-batch-auto-review-item)
- [delivery_batch_auto_reviews](#delivery-batch-auto-reviews)
- [delivery_batch_status_history](#delivery-batch-status-history)
- [delivery_batch_task](#delivery-batch-task)
- [difficulty_level](#difficulty-level)
- [email_notification_log](#email-notification-log)
- [feedback_action_comment](#feedback-action-comment)
- [form_stages](#form-stages)
- [integration](#integration)
- [label](#label)
- [labeling_workflow](#labeling-workflow)
- [labeling_workflow_history](#labeling-workflow-history)
- [language](#language)
- [latest_review_qdv_index](#latest-review-qdv-index)
- [migrations](#migrations)
- [permission](#permission)
- [project](#project)
- [project_config](#project-config)
- [project_config_history](#project-config-history)
- [project_contributor](#project-contributor)
- [project_form_stages](#project-form-stages)
- [project_history](#project-history)
- [project_integration_configuration](#project-integration-configuration)
- [project_quality_dimension](#project-quality-dimension)
- [project_statistics](#project-statistics)
- [quality_dimension](#quality-dimension)
- [review](#review)
- [review_message_feedback](#review-message-feedback)
- [review_quality_dimension_value](#review-quality-dimension-value)
- [review_urgency](#review-urgency)
- [reviewer_ranking](#reviewer-ranking)
- [role](#role)
- [role_permissions](#role-permissions)
- [role_permissions_history](#role-permissions-history)
- [skill](#skill)
- [statistics_jobs](#statistics-jobs)
- [task_labeling_workflow](#task-labeling-workflow)
- [task_labeling_workflow_action_execution](#task-labeling-workflow-action-execution)
- [task_labeling_workflow_collaborator](#task-labeling-workflow-collaborator)
- [task_labeling_workflow_transition](#task-labeling-workflow-transition)
- [timer](#timer)
- [timer_session](#timer-session)
- [timer_state_history](#timer-state-history)
- [token](#token)
- [typeorm_metadata](#typeorm-metadata)
- [video_annotation_activity](#video-annotation-activity)

---

## accent

**Row Count**: 8 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `id` | INT64 | YES |
| `name` | STRING | YES |
| `description` | STRING | YES |
| `language_id` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Documentation: `accent`

## Table Description
The `accent` table stores information about different accents associated with specific languages used in a labeling or annotation tool. Each row represents a unique accent, providing details such as its name, description, and associated language. This table is likely used to categorize and manage audio or text data based on regional or dialectal variations in language.

## Column Descriptions
- **id (INT64, nullable=YES):** A unique identifier for each accent entry. This serves as the primary key for the table.
- **name (STRING, nullable=YES):** The name of the accent, which typically includes a regional or national identifier (e.g., "Welsh English").
- **description (STRING, nullable=YES):** A textual description of the accent, which is currently empty in the sample data but could be used to provide additional context or characteristics of the accent.
- **language_id (INT64, nullable=YES):** A foreign key that links to a `language` table, indicating the language to which the accent belongs. This allows for the organization of accents under broader language categories.
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** Metadata associated with the data stream, including a unique UUID for tracking and a timestamp indicating when the data was sourced. This is useful for data lineage and auditing purposes.

## Table Relationships
- **Language Table:** The `language_id` column suggests a relationship with a `language` table, where each language can have multiple associated accents. This is a common pattern where languages are categorized and managed separately from their dialects or accents.
- **Project/Batches/Conversations:** While not explicitly linked in the sample data, accents are often used in projects or batches for labeling tasks, especially in audio or text annotation. This table might relate to other tables managing projects or data batches that require accent-specific processing.
- **Contributor/Review:** Accents might be used to assign tasks to contributors with specific linguistic expertise or to ensure quality control during reviews.

## Key Insights
- The `accent` table is crucial for managing linguistic diversity within the annotation tool, allowing for precise categorization and processing of data based on regional language variations.
- The presence of `datastream_metadata` indicates a focus on data management and integrity, ensuring that each accent entry can be traced back to its source.
- The table supports scalability and adaptability, as new accents can be added easily to accommodate evolving project needs or the inclusion of new languages.
- The lack of descriptions in the sample data suggests potential areas for improvement in documentation or data enrichment to enhance the utility of the table for users.

This table is an essential component of a larger data ecosystem that supports complex linguistic annotation tasks, enabling more accurate and culturally aware data processing.

### Sample Data

See: [`accent_sample.json`](./accent_sample.json)

---

## app_config

**Row Count**: 129 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `name` | STRING | YES |
| `system_name` | STRING | YES |
| `description` | STRING | YES |
| `order` | INT64 | YES |
| `allow_unauthenticated_read` | INT64 | YES |
| `value` | JSON | YES |
| `default_value` | JSON | YES |
| `metadata` | JSON | YES |
| `group_id` | INT64 | YES |
| `scope` | STRING | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |
| `video_url` | STRING | YES |
| `instructions` | STRING | YES |

### AI Analysis

# Table Analysis: `app_config`

## Table Description
The `app_config` table stores configuration settings for an annotation tool application. Each row represents a specific configuration option that can be adjusted to modify the behavior of the application, such as enabling features or setting default values. This table is crucial for managing application settings at various levels, such as project-specific configurations or global settings.

## Column Descriptions
- **created_at (DATETIME, nullable=YES)**: The timestamp when the configuration entry was initially created. This helps track the creation date of each configuration setting.
- **updated_at (DATETIME, nullable=YES)**: The timestamp of the last update made to the configuration entry, useful for auditing changes over time.
- **id (INT64, nullable=YES)**: A unique identifier for each configuration entry, serving as the primary key for the table.
- **name (STRING, nullable=YES)**: A human-readable name for the configuration setting, providing a brief description of its purpose.
- **system_name (STRING, nullable=YES)**: A system-defined name used internally to reference the configuration setting programmatically.
- **description (STRING, nullable=YES)**: A detailed explanation of what the configuration setting does and its impact on the application.
- **order (INT64, nullable=YES)**: An integer that determines the display order of the configuration settings, potentially used for UI purposes.
- **allow_unauthenticated_read (INT64, nullable=YES)**: A flag indicating whether the configuration can be read without authentication, enhancing security by controlling access.
- **value (JSON, nullable=YES)**: The current value of the configuration setting, stored in JSON format to support complex data structures.
- **default_value (JSON, nullable=YES)**: The default value for the configuration setting, also stored in JSON format, providing a fallback option.
- **metadata (JSON, nullable=YES)**: Additional metadata about the configuration setting, often including UI components and properties for rendering.
- **group_id (INT64, nullable=YES)**: An identifier linking the configuration to a specific group, allowing for grouped settings management.
- **scope (STRING, nullable=YES)**: Defines the scope of the configuration, such as "project" or "global", indicating the level at which the setting applies.
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES)**: Contains metadata related to data streaming, including a unique identifier and a timestamp, useful for tracking data flow.
- **video_url (STRING, nullable=YES)**: A URL pointing to a video resource, potentially used for instructional or informational purposes.
- **instructions (STRING, nullable=YES)**: Textual instructions related to the configuration setting, aiding users in understanding how to use it.

## Table Relationships
The `app_config` table is likely related to other tables through common patterns such as project, batch, or contributor configurations. The `scope` column suggests that configurations can be applied at different levels, such as project-specific settings, which may link to a `project` table. The `group_id` could associate configurations with specific groups, potentially relating to a `group` or `batch` table.

## Key Insights
- The table supports a flexible configuration system with JSON-formatted values and metadata, allowing for complex and nested settings.
- The presence of `allow_unauthenticated_read` indicates a focus on security and access control, ensuring sensitive settings are protected.
- The `scope` column provides a mechanism to apply configurations at various levels, enhancing the tool's adaptability to different use cases.
- The `datastream_metadata` suggests integration with data streaming processes, indicating that some configurations may impact or be impacted by real-time data flows.

### Sample Data

See: [`app_config_sample.json`](./app_config_sample.json)

---

## app_config_group

**Row Count**: 7 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `name` | STRING | YES |
| `description` | STRING | YES |
| `order` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Analysis: `app_config_group`

## Table Description
The `app_config_group` table stores configuration groups related to different project options within a labeling or annotation tool. Each entry in the table represents a distinct configuration group, detailing its creation and update timestamps, unique identifiers, and metadata associated with data streams. This table is likely used to organize and manage different settings or options available for various projects within the application.

## Column Descriptions

- **created_at (DATETIME, nullable=YES):** The timestamp indicating when the configuration group was initially created. This helps track the age and versioning of configurations.
  
- **updated_at (DATETIME, nullable=YES):** The timestamp of the most recent update to the configuration group. This is crucial for auditing changes and maintaining up-to-date configurations.
  
- **id (INT64, nullable=YES):** A unique identifier for each configuration group. This serves as the primary key for the table, allowing for distinct identification and reference in other tables.
  
- **name (STRING, nullable=YES):** The name of the configuration group. This provides a human-readable label for the group, facilitating easier management and selection.
  
- **description (STRING, nullable=YES):** A brief description of the configuration group. This offers additional context about the purpose and contents of the group.
  
- **order (INT64, nullable=YES):** An integer indicating the display order or priority of the configuration group. This can be used to sort or prioritize groups in a user interface.
  
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** A structured field containing metadata about the data stream associated with the configuration group. It includes:
  - **uuid (STRING):** A unique identifier for the data stream, likely used for tracking and integration purposes.
  - **source_timestamp (INT64):** A timestamp from the data source, potentially used for synchronization or data lineage tracking.

## Table Relationships
The `app_config_group` table likely relates to other tables through its `id` column, which can be referenced by tables managing projects, batches, or specific configurations within the system. Common patterns include:

- **Project:** Configuration groups may be linked to specific projects, defining options or settings applicable to those projects.
- **Batch:** Groups could be associated with batches of data, indicating specific configurations for processing or annotation.
- **Contributor:** Although not directly related, contributors might use these configuration groups to understand the settings applied to their tasks.
- **Review:** Configuration groups might influence review processes by defining criteria or settings for quality checks.

## Key Insights

- The table contains a small number of rows (7), suggesting a limited set of configuration groups, possibly indicating a focused or specialized application.
- The presence of `datastream_metadata` implies integration with external data sources or systems, highlighting the importance of data lineage and synchronization.
- The `order` column suggests a prioritization or categorization mechanism, which could be useful for displaying configurations in a user-friendly manner.
- The use of both `created_at` and `updated_at` timestamps indicates a need for tracking changes over time, which is essential for maintaining configuration integrity and historical auditing.

### Sample Data

See: [`app_config_group_sample.json`](./app_config_group_sample.json)

---

## app_config_history

**Row Count**: 18 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `old_value` | JSON | YES |
| `new_value` | JSON | YES |
| `app_config_id` | INT64 | YES |
| `author_id` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Documentation: `app_config_history`

## Description
The `app_config_history` table is designed to store historical changes made to application configurations within a labeling/annotation tool. Each entry in the table represents a specific change event, capturing both the previous and updated configuration values, along with metadata about the change such as the author and timestamps.

## Column Descriptions

- **created_at (DATETIME, nullable=YES):** The timestamp indicating when the configuration change was initially recorded in the system.
- **updated_at (DATETIME, nullable=YES):** The timestamp indicating the last time this record was updated. Typically, this will be the same as `created_at` unless the record itself is modified after initial creation.
- **id (INT64, nullable=YES):** A unique identifier for each change record in the table.
- **old_value (JSON, nullable=YES):** A JSON object representing the configuration settings before the change was made. This can include various types of data, such as boolean flags, lists, or nested structures.
- **new_value (JSON, nullable=YES):** A JSON object representing the configuration settings after the change was made. This mirrors the structure of `old_value`.
- **app_config_id (INT64, nullable=YES):** A foreign key linking to the specific application configuration that was altered. This allows tracking of changes to particular configuration entities.
- **author_id (INT64, nullable=YES):** A foreign key referencing the user who made the change, indicating the author or contributor responsible for the update.
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** Metadata related to the data stream, including a unique identifier (`uuid`) for the change event and a `source_timestamp` indicating when the change was sourced or initiated.

## Relationships to Other Tables
- **Project:** The `app_config_id` may relate to a project-specific configuration, indicating that changes in this table could affect project settings.
- **Contributor:** The `author_id` links to a contributor or user table, identifying who made the configuration changes.
- **Batch/Conversation/Review:** While not directly linked, changes in configurations might influence how batches are processed or how conversations and reviews are conducted, depending on what the configuration settings control.

## Key Insights
- The table captures a detailed audit trail of configuration changes, which is crucial for understanding the evolution of application settings over time.
- The presence of JSON objects in `old_value` and `new_value` columns allows for flexible storage of diverse configuration data, accommodating complex settings structures.
- The `datastream_metadata` provides additional context for each change, which can be useful for debugging or tracing the origin of configuration updates.
- The table's relatively small row count (18 rows) suggests it is either newly implemented or used for a specific subset of configurations, possibly those that are critical or subject to frequent changes.

### Sample Data

See: [`app_config_history_sample.json`](./app_config_history_sample.json)

---

## auto_prompt_improvement_trigger

**Row Count**: 6 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `auto_prompt_evaluation_id` | INT64 | YES |
| `status` | STRING | YES |
| `error_message` | STRING | YES |
| `result_data` | JSON | YES |
| `poll_count` | INT64 | YES |
| `elapsed_ms` | INT64 | YES |
| `project_quality_dimension_id` | INT64 | YES |
| `ac_agent_version_id` | INT64 | YES |
| `triggered_by_user_id` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

### Table Description

The `auto_prompt_improvement_trigger` table stores records related to the automatic evaluation and improvement of prompts used in a labeling/annotation tool. Each row represents an instance where an evaluation was triggered, capturing details about the evaluation process, its results, and metadata related to the execution. This table is crucial for tracking the performance and effectiveness of prompt evaluations over time.

### Column Descriptions

1. **created_at (DATETIME, nullable=YES):** The timestamp indicating when the evaluation trigger was created. This helps in tracking the initiation time of each evaluation process.
   
2. **updated_at (DATETIME, nullable=YES):** The timestamp of the last update made to the evaluation trigger record. This is useful for auditing and understanding the lifecycle of the evaluation process.

3. **id (INT64, nullable=YES):** A unique identifier for each evaluation trigger record. It serves as the primary key for the table.

4. **auto_prompt_evaluation_id (INT64, nullable=YES):** References an evaluation process, linking this trigger to specific evaluation details stored in another table.

5. **status (STRING, nullable=YES):** Indicates the current status of the evaluation process (e.g., "SUCCESS", "FAILED"). This helps in monitoring the outcome of each evaluation.

6. **error_message (STRING, nullable=YES):** Contains any error messages generated if the evaluation process fails. This is essential for debugging and improving the evaluation process.

7. **result_data (JSON, nullable=YES):** Stores the results of the evaluation, including metrics such as precision, recall, and F1 score. This JSON field provides a detailed summary of the evaluation's effectiveness.

8. **poll_count (INT64, nullable=YES):** The number of times the system polled for the evaluation result. This can indicate how long the evaluation took to complete.

9. **elapsed_ms (INT64, nullable=YES):** The time taken for the evaluation process to complete, measured in milliseconds. This helps in performance analysis.

10. **project_quality_dimension_id (INT64, nullable=YES):** References a specific quality dimension within a project, linking the evaluation to broader project quality metrics.

11. **ac_agent_version_id (INT64, nullable=YES):** Identifies the version of the agent used during the evaluation, which is important for tracking changes and improvements in the evaluation process over time.

12. **triggered_by_user_id (INT64, nullable=YES):** Identifies the user who triggered the evaluation, providing accountability and traceability.

13. **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** Contains metadata about the data stream, including a unique identifier and the timestamp of the data source. This is useful for data lineage and tracking the origin of the data used in the evaluation.

### Table Relationships

- **Projects:** The `project_quality_dimension_id` likely links this table to a projects table, connecting evaluations to specific project quality metrics.
- **Evaluations:** The `auto_prompt_evaluation_id` connects to a table that stores detailed evaluation data, allowing for a comprehensive view of each evaluation's context and results.
- **Users:** The `triggered_by_user_id` associates this table with a users table, identifying who initiated the evaluation process.

### Key Insights

- The table provides a detailed record of prompt evaluations, including performance metrics and execution metadata, which is essential for improving prompt quality over time.
- The JSON field `result_data` offers rich insights into the evaluation metrics, enabling detailed analysis of prompt effectiveness.
- The table's structure supports tracking the evolution of prompt evaluations, including changes in agent versions and project quality dimensions, which can inform strategic improvements in the labeling/annotation tool.

### Sample Data

See: [`auto_prompt_improvement_trigger_sample.json`](./auto_prompt_improvement_trigger_sample.json)

---

## batch

**Row Count**: 258 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `name` | STRING | YES |
| `folder` | STRING | YES |
| `count_of_conversations` | INT64 | YES |
| `description` | STRING | YES |
| `project_id` | INT64 | YES |
| `author_id` | INT64 | YES |
| `status` | STRING | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |
| `external_url` | STRING | YES |
| `statistics` | JSON | YES |
| `jibble_activity` | STRING | YES |
| `is_claim_threshold_email_sent` | INT64 | YES |
| `time_control` | JSON | YES |
| `max_claim_golden_task_allowed` | INT64 | YES |
| `source_files` | JSON | YES |
| `average_handle_time_minutes` | INT64 | YES |
| `secondary_folder` | STRING | YES |
| `health` | STRING | YES |
| `created_from_completed_batch` | INT64 | YES |
| `conversation_selection_method` | STRING | YES |
| `last_synced_all_at` | DATETIME | YES |
| `last_synced_unclaimed_at` | DATETIME | YES |

### AI Analysis

# Batch Table Analysis

## Description
The `batch` table in this database stores metadata and configuration details for batches of conversations used in a labeling or annotation tool. Each batch represents a collection of conversations that are grouped for processing, annotation, or review within a specific project. The table tracks various attributes of these batches, such as creation and update timestamps, associated project and author, and operational settings.

## Column Purpose

- **created_at (DATETIME):** The timestamp indicating when the batch was initially created.
- **updated_at (DATETIME):** The timestamp of the most recent update to the batch record.
- **id (INT64):** A unique identifier for each batch.
- **name (STRING):** The name assigned to the batch, often used for identification and reference.
- **folder (STRING):** A reference to a storage location or directory where batch-related files or data are stored.
- **count_of_conversations (INT64):** The total number of conversations included in the batch.
- **description (STRING):** A textual description providing additional context or details about the batch.
- **project_id (INT64):** A foreign key linking the batch to a specific project, indicating the project context for the batch.
- **author_id (INT64):** A foreign key identifying the user or system that created the batch.
- **status (STRING):** The current operational status of the batch, such as "ongoing" or "completed."
- **datastream_metadata (STRUCT):** Contains metadata about the data stream, including a unique identifier (`uuid`) and a timestamp (`source_timestamp`) indicating when the data was sourced.
- **external_url (STRING):** A URL linking to external resources or references related to the batch.
- **statistics (JSON):** A JSON object storing statistical data or metrics related to the batch's processing or performance.
- **jibble_activity (STRING):** Information about activity related to the batch, possibly linked to a time-tracking or monitoring system.
- **is_claim_threshold_email_sent (INT64):** A flag indicating whether an email notification has been sent when a claim threshold is reached.
- **time_control (JSON):** JSON configuration for time management or scheduling settings for the batch.
- **max_claim_golden_task_allowed (INT64):** The maximum number of golden tasks that can be claimed within the batch.
- **source_files (JSON):** A JSON object listing source files associated with the batch.
- **average_handle_time_minutes (INT64):** The average time, in minutes, taken to handle tasks within the batch.
- **secondary_folder (STRING):** An additional storage location reference for batch-related data.
- **health (STRING):** A status indicator reflecting the health or integrity of the batch, such as "not-set."
- **created_from_completed_batch (INT64):** A flag indicating if the batch was created from a previously completed batch.
- **conversation_selection_method (STRING):** The method used to select conversations for inclusion in the batch, e.g., "random."
- **last_synced_all_at (DATETIME):** The timestamp of the last synchronization of all batch data.
- **last_synced_unclaimed_at (DATETIME):** The timestamp of the last synchronization of unclaimed batch data.

## Relationships to Other Tables

- **Project Table:** The `project_id` column links each batch to a specific project, indicating the batch's organizational context.
- **Contributor Table:** The `author_id` column associates the batch with a specific contributor or user who created it.
- **Conversation Table:** The `count_of_conversations` and `conversation_selection_method` suggest a relationship with a conversation table, where individual conversations are stored and managed.
- **Review Table:** The `status` and `statistics` columns may relate to review processes, indicating the batch's progress and performance metrics.

## Key Insights

- The table is designed to manage and track batches of conversations, crucial for organizing and processing large volumes of data in annotation projects.
- The presence of metadata fields like `datastream_metadata` and `statistics` indicates a focus on data integrity and performance monitoring.
- The use of JSON fields for `statistics`, `time_control`, and `source_files` suggests flexibility in storing complex, structured data.
- The `status` and `health` columns provide operational insights, helping to monitor and manage batch lifecycle and quality.
- The batch creation and update timestamps (`created_at`, `updated_at`) are critical for auditing and tracking changes over time.

### Sample Data

See: [`batch_sample.json`](./batch_sample.json)

---

## batch_auto_review

**Row Count**: 3 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `status` | STRING | YES |
| `started_at` | DATETIME | YES |
| `completed_at` | DATETIME | YES |
| `success_count` | INT64 | YES |
| `failure_count` | INT64 | YES |
| `batch_id` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Documentation: `batch_auto_review`

## Table Description
The `batch_auto_review` table stores records of automated review processes applied to batches within a labeling or annotation tool. Each row represents a distinct review session, capturing metadata about the execution, status, and outcomes of the review process. This table is crucial for tracking the performance and results of automated reviews, which are likely part of a quality assurance workflow in the annotation pipeline.

## Column Descriptions

- **created_at (DATETIME, nullable=YES):** The timestamp when the review record was created in the database. This indicates when the review process was initiated.
  
- **updated_at (DATETIME, nullable=YES):** The timestamp of the last update to the review record. This typically reflects when the review process was completed or when any subsequent changes were made to the record.
  
- **id (INT64, nullable=YES):** A unique identifier for each review record. This serves as the primary key for the table.
  
- **status (STRING, nullable=YES):** The current status of the review process. Common statuses include "done," indicating that the review has been completed.
  
- **started_at (DATETIME, nullable=YES):** The timestamp when the review process began. This helps in calculating the duration of the review.
  
- **completed_at (DATETIME, nullable=YES):** The timestamp when the review process was completed. This marks the end of the review session.
  
- **success_count (INT64, nullable=YES):** The number of items successfully reviewed without errors. This metric is used to assess the effectiveness of the review process.
  
- **failure_count (INT64, nullable=YES):** The number of items that failed the review process. This helps identify issues or errors that need attention.
  
- **batch_id (INT64, nullable=YES):** A foreign key linking to the batch table, indicating which batch was reviewed. This establishes a relationship between the review and the specific batch of data.
  
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** A structured field containing metadata about the data stream. The `uuid` is a unique identifier for the data stream, and `source_timestamp` represents the original timestamp of the data source, aiding in traceability and auditability.

## Table Relationships
The `batch_auto_review` table is likely related to a `batch` table through the `batch_id` column, which serves as a foreign key. This relationship allows for the association of review results with specific batches of data. Common patterns in similar databases include relationships with `project`, `conversation`, `review`, and `contributor` tables, which may not be explicitly defined here but are typical in annotation tool databases.

## Key Insights
- The table provides a detailed log of automated review processes, including timestamps, status, and outcomes, which are essential for monitoring and improving the quality assurance pipeline.
- The presence of `success_count` and `failure_count` allows for performance analysis of the review processes, enabling identification of trends or recurring issues.
- The `datastream_metadata` field enhances traceability, providing a link between the review process and the original data source, which is valuable for auditing and debugging purposes.

### Sample Data

See: [`batch_auto_review_sample.json`](./batch_auto_review_sample.json)

---

## batch_import_attempt

**Row Count**: 491 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `status` | STRING | YES |
| `number_of_files` | INT64 | YES |
| `number_of_successes` | INT64 | YES |
| `number_of_failures` | INT64 | YES |
| `started_at` | DATETIME | YES |
| `completed_at` | DATETIME | YES |
| `batch_id` | INT64 | YES |
| `author_id` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Analysis: `batch_import_attempt`

## Table Description
The `batch_import_attempt` table stores records of attempts to import batches of files into a labeling or annotation tool. Each record captures the details of an import attempt, including its status, the number of files processed, and metadata related to the import process. This table is crucial for tracking the success and failure rates of batch imports, as well as for auditing and troubleshooting import activities.

## Column Descriptions

- **created_at (DATETIME, nullable=YES):** The timestamp when the import attempt record was created in the database. This helps in tracking when the import process was initiated.

- **updated_at (DATETIME, nullable=YES):** The timestamp of the last update to the import attempt record. This is useful for identifying when the record was last modified, which could indicate changes in status or other updates.

- **id (INT64, nullable=YES):** A unique identifier for each import attempt. This serves as the primary key for the table, allowing for easy reference to specific import attempts.

- **status (STRING, nullable=YES):** The current status of the import attempt, such as "completed" or "failed." This indicates the outcome of the import process.

- **number_of_files (INT64, nullable=YES):** The total number of files included in the import attempt. This provides insight into the scale of each import operation.

- **number_of_successes (INT64, nullable=YES):** The number of files successfully imported during the attempt. This helps in assessing the effectiveness of the import process.

- **number_of_failures (INT64, nullable=YES):** The number of files that failed to import. This is critical for identifying issues in the import process and for subsequent troubleshooting.

- **started_at (DATETIME, nullable=YES):** The timestamp when the import attempt began. This is used to measure the duration of the import process.

- **completed_at (DATETIME, nullable=YES):** The timestamp when the import attempt was completed. This, along with `started_at`, helps in calculating the total time taken for the import.

- **batch_id (INT64, nullable=YES):** A reference to the batch being imported. This likely links to a `batch` table, associating the import attempt with a specific batch of files.

- **author_id (INT64, nullable=YES):** The identifier of the user or system that initiated the import attempt. This likely links to a `contributor` or `user` table, providing information about who performed the import.

- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** Metadata related to the data stream, including a unique identifier (`uuid`) and a `source_timestamp` indicating when the data was sourced. This is useful for tracing the origin and timing of the data being imported.

## Table Relationships
- **Batch:** The `batch_id` column suggests a relationship with a `batch` table, where each import attempt is associated with a specific batch of files.
- **Contributor/User:** The `author_id` column indicates a link to a `contributor` or `user` table, identifying the person or system responsible for the import attempt.

## Key Insights
- The table provides a comprehensive log of import attempts, including both successful and failed imports, which is essential for operational monitoring and auditing.
- The presence of timestamps (`created_at`, `started_at`, `completed_at`) allows for detailed analysis of the import process duration and efficiency.
- The `status` and `number_of_failures` columns are critical for identifying and addressing issues in the import process, enabling continuous improvement of the system's reliability.
- The `datastream_metadata` provides additional context about the data being imported, which can be useful for debugging and ensuring data integrity.

### Sample Data

See: [`batch_import_attempt_sample.json`](./batch_import_attempt_sample.json)

---

## batch_statistics

**Row Count**: 256 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `batch_id` | INT64 | YES |
| `total_conversations` | INT64 | YES |
| `draft` | INT64 | YES |
| `pending` | INT64 | YES |
| `labeling_approval` | INT64 | YES |
| `labeling` | INT64 | YES |
| `completed_approval` | INT64 | YES |
| `completed` | INT64 | YES |
| `validating` | INT64 | YES |
| `validated` | INT64 | YES |
| `rework` | INT64 | YES |
| `improper` | INT64 | YES |
| `delivered` | INT64 | YES |
| `rating_sum` | INT64 | YES |
| `rating_count` | INT64 | YES |
| `avg_rating` | NUMERIC(4, 2) | YES |
| `updated_at` | TIMESTAMP | YES |
| `claimed` | INT64 | YES |
| `reviewed` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Analysis: `batch_statistics`

## Table Description
The `batch_statistics` table stores aggregated data about the status and progress of conversation labeling tasks within specific batches. Each row represents a batch and provides detailed statistics on the number of conversations at various stages of the labeling process, as well as quality metrics such as ratings and timestamps for updates.

## Column Descriptions

- **batch_id (INT64, nullable=YES):** Unique identifier for each batch of conversations. This serves as the primary key for the table.
- **total_conversations (INT64, nullable=YES):** Total number of conversations included in the batch.
- **draft (INT64, nullable=YES):** Number of conversations in the draft stage, indicating initial preparation or setup.
- **pending (INT64, nullable=YES):** Number of conversations awaiting action, possibly queued for labeling.
- **labeling_approval (INT64, nullable=YES):** Number of conversations that have been labeled and are awaiting approval.
- **labeling (INT64, nullable=YES):** Number of conversations currently in the process of being labeled.
- **completed_approval (INT64, nullable=YES):** Number of conversations that have been completed and are awaiting final approval.
- **completed (INT64, nullable=YES):** Number of conversations that have been fully labeled and approved.
- **validating (INT64, nullable=YES):** Number of conversations undergoing validation checks.
- **validated (INT64, nullable=YES):** Number of conversations that have passed validation checks.
- **rework (INT64, nullable=YES):** Number of conversations that require rework due to errors or issues.
- **improper (INT64, nullable=YES):** Number of conversations marked as improperly labeled or unsuitable.
- **delivered (INT64, nullable=YES):** Number of conversations that have been finalized and delivered.
- **rating_sum (INT64, nullable=YES):** Sum of ratings given to the conversations in the batch, used for calculating average quality.
- **rating_count (INT64, nullable=YES):** Number of ratings provided, used to compute the average rating.
- **avg_rating (NUMERIC(4, 2), nullable=YES):** Average rating of the conversations in the batch, indicating overall quality.
- **updated_at (TIMESTAMP, nullable=YES):** Timestamp of the last update to the batch statistics, useful for tracking changes over time.
- **claimed (INT64, nullable=YES):** Number of conversations claimed by contributors for labeling.
- **reviewed (INT64, nullable=YES):** Number of conversations that have been reviewed for quality assurance.
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** Metadata containing a unique identifier and a timestamp for data streaming purposes.

## Table Relationships
The `batch_statistics` table is likely related to other tables in the database through the `batch_id` column, which can be used to join with:
- **Project Table:** To associate batches with specific projects.
- **Conversation Table:** To link individual conversation records to their respective batches.
- **Review Table:** To connect with reviews conducted on conversations within the batch.
- **Contributor Table:** To track which contributors have worked on conversations in the batch.

## Key Insights
- The table provides a comprehensive view of the progress and status of conversation labeling tasks, which is critical for managing workflow efficiency and quality control.
- The presence of multiple stages (e.g., pending, labeling, completed) allows for detailed tracking of the labeling process, helping identify bottlenecks or areas needing improvement.
- Quality metrics such as `avg_rating` and `reviewed` help assess the effectiveness and accuracy of the labeling efforts.
- The `datastream_metadata` suggests integration with real-time data processing systems, indicating the table's role in dynamic, ongoing operations.

### Sample Data

See: [`batch_statistics_sample.json`](./batch_statistics_sample.json)

---

## category

**Row Count**: 10 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `id` | INT64 | YES |
| `conversation_id` | INT64 | YES |
| `project_id` | INT64 | YES |
| `category` | STRING | YES |
| `created_at` | TIMESTAMP | YES |
| `updated_at` | TIMESTAMP | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Analysis: `category`

## Table Description
The `category` table is designed to store information about different categories assigned to conversations within a labeling or annotation tool. Each entry in the table represents a specific categorization event, linking a conversation to a project and providing metadata about the categorization process. This table is crucial for organizing and managing conversations based on predefined categories, which can be used for reporting, analytics, or further processing.

## Column Descriptions

- **id (INT64, nullable=YES):** A unique identifier for each category entry. This serves as the primary key for the table.
  
- **conversation_id (INT64, nullable=YES):** A foreign key that links the category entry to a specific conversation. This indicates which conversation the category is associated with.

- **project_id (INT64, nullable=YES):** A foreign key that associates the category entry with a particular project. This helps in organizing categories under different projects.

- **category (STRING, nullable=YES):** The name or identifier of the category assigned to the conversation. This field typically contains a code and a description, indicating the nature of the categorization.

- **created_at (TIMESTAMP, nullable=YES):** The timestamp when the category entry was created. This helps in tracking when the categorization was initially applied.

- **updated_at (TIMESTAMP, nullable=YES):** The timestamp for the last update made to the category entry. This is useful for maintaining the history of changes to the categorization.

- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** A structured field containing metadata about the data stream. It includes:
  - **uuid (STRING):** A unique identifier for the data stream event.
  - **source_timestamp (INT64):** The original timestamp from the data source, providing context about when the data was generated or captured.

## Relationships to Other Tables
The `category` table is likely related to several other tables in the database:

- **Conversations Table:** Linked via `conversation_id`, this relationship allows categorization of specific conversations.
  
- **Projects Table:** Connected through `project_id`, enabling categorization within the context of specific projects.

- **Potentially Related Tables:** While not explicitly mentioned, this table might also relate to tables like `batch`, `review`, or `contributor` if those tables exist in the database, providing a comprehensive view of the labeling process.

## Key Insights

- **Categorization Tracking:** The table provides a mechanism to track the categorization of conversations over time, with timestamps indicating when categories were applied or modified.

- **Project and Conversation Organization:** By linking categories to both projects and conversations, the table supports multi-dimensional organization, allowing for complex queries and analytics based on project-specific or conversation-specific categorizations.

- **Metadata Utilization:** The inclusion of `datastream_metadata` suggests a focus on integrating external data streams, which could be useful for auditing or synchronizing with other systems.

- **Data Integrity and Updates:** The presence of both `created_at` and `updated_at` fields indicates an emphasis on maintaining data integrity and tracking changes, which is essential for audit trails and historical analysis.

### Sample Data

See: [`category_sample.json`](./category_sample.json)

---

## contributor

**Row Count**: 1,238 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `name` | STRING | YES |
| `turing_email` | STRING | YES |
| `personal_email` | STRING | YES |
| `type` | STRING | YES |
| `hours_per_week` | INT64 | YES |
| `start_date` | DATETIME | YES |
| `end_date` | DATETIME | YES |
| `termination_reason_notes` | STRING | YES |
| `comment` | STRING | YES |
| `turing_profile_link` | STRING | YES |
| `profile_picture` | STRING | YES |
| `turing_developer_id` | INT64 | YES |
| `role_id` | INT64 | YES |
| `team_lead_id` | INT64 | YES |
| `status` | STRING | YES |
| `is_registration_completed` | INT64 | YES |
| `is_blocked` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |
| `slack_user_id` | STRING | YES |
| `reviewer_id` | INT64 | YES |
| `external_id` | STRING | YES |
| `employment_type` | STRING | YES |
| `main_language_id` | INT64 | YES |
| `main_accent_id` | INT64 | YES |
| `gender` | STRING | YES |

### AI Analysis

# Contributor Table Analysis

## Table Description
The `contributor` table stores information about individuals involved in a labeling or annotation project, likely within a platform managed by Turing. Each row represents a contributor, capturing both personal and professional details, such as contact information, employment status, and role within the project.

## Column Descriptions

- **created_at (DATETIME)**: The timestamp when the contributor record was created in the database.
- **updated_at (DATETIME)**: The timestamp of the last update made to the contributor's record.
- **id (INT64)**: A unique identifier for each contributor.
- **name (STRING)**: The full name of the contributor.
- **turing_email (STRING)**: The official email address provided by Turing for the contributor.
- **personal_email (STRING)**: The personal email address of the contributor, if available.
- **type (STRING)**: The type of user, typically indicating their role or status (e.g., "user").
- **hours_per_week (INT64)**: The number of hours the contributor is expected to work per week.
- **start_date (DATETIME)**: The date when the contributor started their engagement.
- **end_date (DATETIME)**: The date when the contributor's engagement ended or is expected to end.
- **termination_reason_notes (STRING)**: Notes on the reason for termination, if applicable.
- **comment (STRING)**: Additional comments or notes related to the contributor.
- **turing_profile_link (STRING)**: A link to the contributor's profile on the Turing platform.
- **profile_picture (STRING)**: A URL to the contributor's profile picture.
- **turing_developer_id (INT64)**: An identifier linking the contributor to a developer profile within Turing.
- **role_id (INT64)**: A reference to the role assigned to the contributor, likely linking to a roles table.
- **team_lead_id (INT64)**: The ID of the contributor's team lead, indicating a hierarchical relationship.
- **status (STRING)**: The current status of the contributor (e.g., "in-trial").
- **is_registration_completed (INT64)**: A flag indicating whether the contributor's registration is complete (1 for yes, 0 for no).
- **is_blocked (INT64)**: A flag indicating whether the contributor is blocked from the platform (1 for yes, 0 for no).
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>)**: Metadata related to data streaming, including a unique identifier and a timestamp.
- **slack_user_id (STRING)**: The contributor's Slack user ID, if integrated with Slack.
- **reviewer_id (INT64)**: An ID linking to a reviewer, possibly indicating oversight or quality control responsibilities.
- **external_id (STRING)**: An external identifier for the contributor, potentially for integration with other systems.
- **employment_type (STRING)**: The type of employment (e.g., "full-time").
- **main_language_id (INT64)**: An identifier for the contributor's main language, likely linking to a languages table.
- **main_accent_id (INT64)**: An identifier for the contributor's main accent, if applicable.
- **gender (STRING)**: The gender of the contributor.

## Table Relationships
The `contributor` table is likely related to several other tables within the database:

- **Project**: Contributors are typically assigned to specific projects, suggesting a relationship with a project table.
- **Batch**: Contributors may work on specific batches of data, indicating a potential link to a batch table.
- **Conversation**: If the platform involves conversational data, contributors might be linked to conversations they annotate.
- **Review**: The `reviewer_id` suggests a relationship with a review table, where contributions are evaluated.
- **Contributor**: The `team_lead_id` and `reviewer_id` indicate hierarchical and oversight relationships within the contributor table itself.

## Key Insights
- The table provides a comprehensive view of each contributor's professional engagement, including their role, status, and employment details.
- The presence of both Turing and personal emails suggests a dual communication channel, potentially for official and personal correspondence.
- The `is_registration_completed` and `is_blocked` flags are crucial for understanding the contributor's current access and participation status.
- The `datastream_metadata` indicates that the table might be part of a real-time data processing system, capturing changes and updates efficiently.
- The hierarchical structure implied by `team_lead_id` and `reviewer_id` allows for organized team management and quality control processes.

### Sample Data

See: [`contributor_sample.json`](./contributor_sample.json)

---

## contributor_history

**Row Count**: 1,812 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `changed_fields` | JSON | YES |
| `comment` | STRING | YES |
| `contributor_id` | INT64 | YES |
| `author_id` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Contributor History Table Documentation

## Table Description
The `contributor_history` table records changes and updates made to contributor profiles within a labeling/annotation tool database. Each entry in the table captures a specific change event, including the fields that were modified, the contributor involved, and the author of the change. This table is essential for auditing and tracking the evolution of contributor data over time.

## Column Descriptions

- **created_at (DATETIME, nullable=YES)**: The timestamp when the change event was initially recorded. This helps in tracking when specific updates were made.
  
- **updated_at (DATETIME, nullable=YES)**: The timestamp of the last update to the change event record. This is useful for identifying the most recent modifications to the record itself.
  
- **id (INT64, nullable=YES)**: A unique identifier for each change event. This serves as the primary key for the table, ensuring each record can be uniquely referenced.
  
- **changed_fields (JSON, nullable=YES)**: A JSON object detailing the specific fields that were changed, including their old and new values. This provides a clear view of what modifications were made during the event.
  
- **comment (STRING, nullable=YES)**: An optional text field for additional context or notes about the change event. This can include reasons for changes or descriptions of the event.
  
- **contributor_id (INT64, nullable=YES)**: The identifier of the contributor whose data was modified. This links the change event to a specific contributor profile.
  
- **author_id (INT64, nullable=YES)**: The identifier of the user who made the change. This is crucial for accountability and tracking who is responsible for updates.
  
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES)**: Metadata about the data stream, including a unique UUID for the event and a source timestamp. This aids in integrating and synchronizing data across systems.

## Table Relationships

- **Project**: Changes in contributor roles or team assignments may relate to specific projects, though this relationship is not directly represented in the table.
  
- **Batch**: Contributors might be associated with specific batches of work, and changes in their status or roles could impact batch assignments.
  
- **Conversation**: While not directly linked, changes in contributor information could affect conversations or communications within the system.
  
- **Review**: Contributor history might be referenced during reviews to understand changes in contributor performance or roles.
  
- **Contributor**: The table directly relates to the `contributor` table, as it logs changes to contributor profiles.

## Key Insights

- The table provides a detailed audit trail of changes to contributor data, which is crucial for maintaining data integrity and accountability.
  
- The `changed_fields` JSON structure allows for flexible and comprehensive tracking of multiple field changes in a single event, which is beneficial for complex data management scenarios.
  
- The presence of both `contributor_id` and `author_id` allows for a clear distinction between the subject of the change and the initiator, supporting robust auditing processes.
  
- The `datastream_metadata` can be used for advanced data integration tasks, ensuring that changes are consistently propagated across different systems or services.

### Sample Data

See: [`contributor_history_sample.json`](./contributor_history_sample.json)

---

## conversation

**Row Count**: 70,980 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `colab_link` | STRING | YES |
| `number_of_turns` | INT64 | YES |
| `minimum_turns` | INT64 | YES |
| `maximum_turns` | INT64 | YES |
| `status` | STRING | YES |
| `completed_at` | DATETIME | YES |
| `project_id` | INT64 | YES |
| `conversation_seed_id` | INT64 | YES |
| `batch_id` | INT64 | YES |
| `llm_role_id` | INT64 | YES |
| `human_role_id` | INT64 | YES |
| `current_user_id` | INT64 | YES |
| `statement` | STRING | YES |
| `duration_minutes` | INT64 | YES |
| `review_form_url` | STRING | YES |
| `locked` | INT64 | YES |
| `labeling` | JSON | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |
| `parent_id` | INT64 | YES |
| `title` | STRING | YES |
| `is_golden` | INT64 | YES |
| `form_stage` | STRING | YES |
| `content_restricted` | INT64 | YES |
| `review_required` | INT64 | YES |
| `automatic_duration_minutes` | INT64 | YES |

### AI Analysis

# Table Analysis: `conversation`

## Description
The `conversation` table stores detailed records of conversations within a labeling or annotation tool, primarily used for training or evaluating language models. Each record represents a conversation instance with metadata about its creation, status, and associated project information. This table is integral to tracking the lifecycle of conversations from initiation to completion, including the context and parameters under which they occur.

## Column Descriptions

- **created_at (DATETIME)**: The timestamp when the conversation record was created, indicating the start of the conversation lifecycle.
- **updated_at (DATETIME)**: The timestamp of the last update made to the conversation record, useful for tracking changes over time.
- **id (INT64)**: A unique identifier for each conversation, serving as the primary key.
- **colab_link (STRING)**: A URL to a Google Colab notebook associated with the conversation, potentially containing relevant data or analysis scripts.
- **number_of_turns (INT64)**: The actual number of dialogue exchanges in the conversation, useful for assessing conversation depth.
- **minimum_turns (INT64)**: The minimum required number of dialogue exchanges, indicating expected conversation length.
- **maximum_turns (INT64)**: The maximum allowed number of dialogue exchanges, setting a boundary for conversation length.
- **status (STRING)**: The current state of the conversation (e.g., pending, completed), indicating its progress in the workflow.
- **completed_at (DATETIME)**: The timestamp when the conversation was marked as completed, useful for duration analysis.
- **project_id (INT64)**: A foreign key linking the conversation to a specific project, indicating the broader context or objective.
- **conversation_seed_id (INT64)**: An identifier for the initial seed or prompt that started the conversation, useful for traceability.
- **batch_id (INT64)**: A foreign key linking to a batch, indicating the group of conversations processed together.
- **llm_role_id (INT64)**: An identifier for the role of the language model in the conversation, if applicable.
- **human_role_id (INT64)**: An identifier for the human participant's role, if applicable.
- **current_user_id (INT64)**: The user currently interacting with or responsible for the conversation, if applicable.
- **statement (STRING)**: A detailed description or scenario of the conversation, providing context and expectations.
- **duration_minutes (INT64)**: The duration of the conversation in minutes, useful for performance and efficiency analysis.
- **review_form_url (STRING)**: A URL to a review form for the conversation, indicating if additional evaluation is required.
- **locked (INT64)**: A flag indicating if the conversation is locked from further edits, ensuring data integrity.
- **labeling (JSON)**: JSON data containing labeling information, if applicable, for detailed annotation.
- **datastream_metadata (STRUCT)**: Metadata about the data stream, including a UUID and source timestamp, for tracking data provenance.
- **parent_id (INT64)**: An identifier linking to a parent conversation, if applicable, indicating hierarchical relationships.
- **title (STRING)**: A title for the conversation, providing a quick reference or summary.
- **is_golden (INT64)**: A flag indicating if the conversation is a "golden" or benchmark example, used for quality assurance.
- **form_stage (STRING)**: The current stage of the form or conversation process, indicating progress in the workflow.
- **content_restricted (INT64)**: A flag indicating if the conversation content is restricted, affecting access and visibility.
- **review_required (INT64)**: A flag indicating if the conversation requires review, guiding workflow priorities.
- **automatic_duration_minutes (INT64)**: The automatically calculated duration of the conversation, potentially for comparison with manual timing.

## Relationships to Other Tables
The `conversation` table is likely related to other tables through common identifiers such as `project_id`, `batch_id`, and `conversation_seed_id`. These relationships suggest integration with tables managing projects, batches, and conversation seeds, facilitating comprehensive tracking and management of annotation workflows.

## Key Insights
- The table supports detailed tracking of conversation metadata, essential for managing and evaluating language model interactions.
- The presence of both manual and automatic duration fields allows for validation and accuracy checks in conversation timing.
- The inclusion of fields like `is_golden` and `review_required` highlights a focus on quality control and iterative improvement in the labeling process.
- The `statement` field provides rich context, which can be leveraged for training models with specific scenarios and requirements.

### Sample Data

See: [`conversation_sample.json`](./conversation_sample.json)

---

## conversation_import_attempt

**Row Count**: 19,818 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `status` | STRING | YES |
| `notes` | STRING | YES |
| `conversation_id` | INT64 | YES |
| `batch_import_attempt_id` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Documentation: `conversation_import_attempt`

## Table Description
The `conversation_import_attempt` table stores records of attempts to import conversation data into a labeling or annotation tool. Each row represents a single import attempt for a conversation, capturing metadata about the attempt, its status, and related identifiers. This table is crucial for tracking the import process and diagnosing issues related to data ingestion.

## Column Descriptions

- **created_at (DATETIME, nullable=YES):** The timestamp when the import attempt record was initially created. This helps in tracking when the import process was initiated.
  
- **updated_at (DATETIME, nullable=YES):** The timestamp of the most recent update to the import attempt record. This is useful for auditing changes or updates to the import status or other details.
  
- **id (INT64, nullable=YES):** A unique identifier for each import attempt. This serves as the primary key for the table, allowing for unique identification of each record.
  
- **status (STRING, nullable=YES):** Indicates the outcome of the import attempt, such as "success" or "failure". This column is essential for monitoring the success rate of imports and identifying failed attempts that may need attention.
  
- **notes (STRING, nullable=YES):** A field for additional information or comments regarding the import attempt. This could include error messages or other relevant details that provide context for the import status.
  
- **conversation_id (INT64, nullable=YES):** References the unique identifier of the conversation being imported. This links the import attempt to a specific conversation record, facilitating data integrity and traceability.
  
- **batch_import_attempt_id (INT64, nullable=YES):** References the identifier of the batch import attempt to which this conversation import belongs. This allows grouping of multiple conversation imports under a single batch process, aiding in batch processing analysis.
  
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** Contains metadata about the data stream, including a unique UUID and a source timestamp. This information is useful for tracking the origin and timing of the data being imported.

## Table Relationships

- **Project:** The `conversation_import_attempt` table may relate to a `project` table where each conversation import is part of a larger project. The `project` table would typically manage overarching details about the labeling or annotation tasks.
  
- **Batch:** The `batch_import_attempt_id` links this table to a `batch` table that records details about batch import processes. This relationship helps in analyzing the performance and issues at the batch level.
  
- **Conversation:** The `conversation_id` connects this table to a `conversation` table, which stores the actual conversation data being imported. This relationship is critical for ensuring that each import attempt corresponds to a valid conversation record.
  
- **Review:** If there is a `review` table, this table might interact with it to track the review status of imported conversations, especially if imports are subject to quality checks post-import.
  
- **Contributor:** This table might relate to a `contributor` table if specific users or systems are responsible for initiating imports, allowing for accountability and performance tracking of contributors.

## Key Insights

- The table contains 19,818 records, indicating a significant volume of import attempts, which suggests a high level of activity in data ingestion processes.
  
- The presence of a `status` column allows for easy monitoring of import success rates, which is crucial for operational efficiency and troubleshooting.
  
- The `datastream_metadata` provides valuable context for each import attempt, particularly useful for debugging issues related to data origin and timing.
  
- The linkage through `batch_import_attempt_id` and `conversation_id` facilitates comprehensive analysis of import processes at both the batch and individual conversation levels, enabling targeted improvements and optimizations.

### Sample Data

See: [`conversation_import_attempt_sample.json`](./conversation_import_attempt_sample.json)

---

## conversation_label

**Row Count**: 5 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `conversation_id` | INT64 | YES |
| `label_id` | INT64 | YES |
| `author_id` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Analysis: `conversation_label`

## Description
The `conversation_label` table is designed to store metadata about labels applied to conversations within a labeling or annotation tool. Each entry in the table represents a specific label that has been assigned to a conversation by an author, capturing both the creation and update timestamps for audit and tracking purposes. This table is crucial for understanding the labeling history and the contributors involved in the annotation process.

## Column Descriptions

- **created_at (DATETIME, nullable=YES):** The timestamp indicating when the label was initially applied to the conversation. This helps in tracking the chronological order of labeling activities.

- **updated_at (DATETIME, nullable=YES):** The timestamp of the most recent update to the label entry. This is useful for maintaining a record of modifications and ensuring data integrity over time.

- **id (INT64, nullable=YES):** A unique identifier for each label entry. This serves as the primary key for the table, allowing for efficient querying and management of label records.

- **conversation_id (INT64, nullable=YES):** A foreign key linking to the `conversation` table, identifying which conversation the label is associated with. This connection is vital for aggregating labels by conversation.

- **label_id (INT64, nullable=YES):** A foreign key that associates the entry with a specific label from a `label` table. This allows for categorization and analysis of the types of labels used across conversations.

- **author_id (INT64, nullable=YES):** A foreign key pointing to the `contributor` table, indicating the user who applied the label. This is important for tracking contributor activity and performance.

- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** A structured field containing metadata about the data stream, including a unique identifier (`uuid`) and a timestamp (`source_timestamp`) indicating when the data was sourced. This information is useful for tracing the origin and flow of data within the system.

## Relationships to Other Tables

- **Project:** While not directly referenced, the `conversation_label` table likely relates to a `project` table through the `conversation_id`, as conversations are typically part of larger projects.

- **Batch:** The table may indirectly relate to a `batch` table if conversations are processed in batches, though this relationship is not explicitly defined here.

- **Conversation:** Directly related through the `conversation_id`, linking each label to its respective conversation.

- **Review:** Potentially related if there is a review process for labels, though this is not directly indicated in the table schema.

- **Contributor:** Directly related through the `author_id`, connecting each label to the user who applied it.

## Key Insights

- The table provides a detailed log of labeling activities, which can be used to audit the labeling process and ensure compliance with project guidelines.

- The presence of both `created_at` and `updated_at` timestamps allows for tracking changes over time, which can be useful for understanding the evolution of labeling decisions.

- The `datastream_metadata` field suggests that the table is part of a larger data ingestion or processing pipeline, providing traceability for data origin and timing.

- The use of foreign keys (`conversation_id`, `label_id`, `author_id`) indicates a well-structured relational database design, facilitating complex queries and data integrity across related tables.

### Sample Data

See: [`conversation_label_sample.json`](./conversation_label_sample.json)

---

## conversation_message

**Row Count**: 210,481 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `role` | STRING | YES |
| `content` | STRING | YES |
| `message_idx` | JSON | YES |
| `submitted_at` | DATETIME | YES |
| `sender_id` | INT64 | YES |
| `conversation_id` | INT64 | YES |
| `duration_minutes` | INT64 | YES |
| `conversation_version_id` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Analysis: `conversation_message`

## Table Description
The `conversation_message` table stores detailed records of messages exchanged within conversations in a labeling or annotation tool. Each row represents a single message, capturing metadata about the message's creation, the sender, the content, and its association with a specific conversation. This table is essential for tracking the flow and context of interactions, particularly in environments where conversations are analyzed or annotated for further processing.

## Column Descriptions

- **created_at (DATETIME, nullable=YES):** The timestamp indicating when the message was initially created in the system. This helps in tracking the chronological order of message exchanges.
  
- **updated_at (DATETIME, nullable=YES):** The timestamp of the last update made to the message. Useful for auditing changes or edits to messages post-creation.
  
- **id (INT64, nullable=YES):** A unique identifier for each message. This serves as the primary key for identifying individual message records.
  
- **role (STRING, nullable=YES):** Specifies the role of the message sender, such as "assistant" or "user". This helps in distinguishing between different participants in the conversation.
  
- **content (STRING, nullable=YES):** Contains the actual message content, often formatted as JSON. This field holds the main text of the message, which can include structured data like markdown or annotations.
  
- **message_idx (JSON, nullable=YES):** A JSON object that might contain additional indexing information or metadata about the message. This could be used for advanced querying or indexing purposes.
  
- **submitted_at (DATETIME, nullable=YES):** The timestamp when the message was submitted, possibly after being drafted. This can differ from `created_at` if there is a delay in submission.
  
- **sender_id (INT64, nullable=YES):** A foreign key linking to the sender's unique identifier, likely referencing a user or contributor table. This helps in identifying who sent the message.
  
- **conversation_id (INT64, nullable=YES):** A foreign key linking the message to a specific conversation, facilitating the grouping of messages into coherent conversation threads.
  
- **duration_minutes (INT64, nullable=YES):** The duration in minutes that the message was active or relevant, potentially used for timing analysis or session tracking.
  
- **conversation_version_id (INT64, nullable=YES):** A reference to a specific version of the conversation, useful for version control or tracking changes over time.
  
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** A structured field containing metadata about the data stream, including a unique identifier and a source timestamp. This can be used for tracing the origin and timing of data ingestion.

## Table Relationships
The `conversation_message` table is likely related to several other tables within the database:

- **Project Table:** Messages may be part of conversations that are grouped under specific projects. The `conversation_id` could indirectly link to a project through a conversation table.
  
- **Batch Table:** If messages are processed in batches, there might be a relationship where `conversation_id` connects to a batch identifier.
  
- **Conversation Table:** Directly related through `conversation_id`, this table would store overarching details about each conversation.
  
- **Review Table:** Messages might be subject to review processes, where `id` or `conversation_id` could link to review records.
  
- **Contributor Table:** The `sender_id` likely corresponds to a contributor or user table, identifying the individual who sent the message.

## Key Insights
- The table captures both the content and metadata of messages, allowing for detailed analysis of conversation dynamics.
- The presence of `role` and `sender_id` facilitates the differentiation between various participants, which is crucial for understanding interactions.
- The `content` field's JSON structure suggests that messages may include rich text or annotations, indicating a sophisticated messaging system.
- The `conversation_version_id` and `datastream_metadata` fields imply a focus on version control and data provenance, which are important for maintaining data integrity and traceability.

### Sample Data

See: [`conversation_message_sample.json`](./conversation_message_sample.json)

---

## conversation_seed

**Row Count**: 73,230 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `metadata` | JSON | YES |
| `project_id` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |
| `turing_metadata` | JSON | YES |

### AI Analysis

# Table Analysis: `conversation_seed`

## Description
The `conversation_seed` table is designed to store metadata and identifiers for conversation instances within a labeling or annotation tool. Each row represents a unique conversation seed, capturing details about the conversation's context, structure, and associated project. This table is crucial for tracking and managing conversation data, particularly in projects involving language models and structured data analysis.

## Column Descriptions

- **created_at (DATETIME, nullable=YES):** The timestamp indicating when the conversation seed was initially created. This helps in tracking the lifecycle and versioning of conversation data.
  
- **updated_at (DATETIME, nullable=YES):** The timestamp for the most recent update to the conversation seed. This is useful for auditing changes and maintaining data integrity over time.

- **id (INT64, nullable=YES):** A unique identifier for each conversation seed. It serves as the primary key for the table, ensuring each entry is distinct and can be referenced in related operations.

- **metadata (JSON, nullable=YES):** A JSON object containing detailed information about the conversation, such as domain, language, model, scenario, and use case. This rich metadata supports nuanced analysis and categorization of conversation seeds.

- **project_id (INT64, nullable=YES):** A foreign key linking the conversation seed to a specific project. This establishes a relationship with a `project` table, allowing for organization and retrieval of conversation seeds by project context.

- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** A structured field containing a UUID and a source timestamp, which may be used for tracking the origin and timing of data streams related to the conversation.

- **turing_metadata (JSON, nullable=YES):** An optional JSON field for storing additional metadata related to Turing tests or model evaluations, though it is null in the provided sample.

## Table Relationships

- **Project:** The `project_id` column links each conversation seed to a specific project, suggesting a relationship with a `project` table. This connection allows for grouping and managing conversation seeds within the context of larger projects.

- **Batch/Contributor/Review:** While not explicitly detailed in the schema, common patterns suggest that conversation seeds may be part of larger batches, involve contributors for annotation, and undergo review processes. These relationships would typically be managed through additional tables linking conversation seeds to these entities.

## Key Insights

- **Metadata Richness:** The `metadata` column provides a comprehensive view of each conversation's context, including domain, language, and specific use case scenarios. This richness supports detailed analysis and customization of language model interactions.

- **Temporal Tracking:** The `created_at` and `updated_at` columns facilitate robust tracking of conversation seed lifecycles, enabling insights into data evolution and version control.

- **Project Alignment:** The `project_id` ensures that conversation seeds are organized and retrievable within the context of specific projects, which is essential for managing large-scale annotation efforts.

- **Potential for Expansion:** The presence of `turing_metadata` and `datastream_metadata` indicates potential for future expansion into more complex data tracking and evaluation scenarios, although these fields are currently underutilized in the sample data.

### Sample Data

See: [`conversation_seed_sample.json`](./conversation_seed_sample.json)

---

## conversation_status_history

**Row Count**: 162,205 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `old_status` | STRING | YES |
| `new_status` | STRING | YES |
| `notes` | STRING | YES |
| `conversation_id` | INT64 | YES |
| `author_id` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |
| `form_stage` | STRING | YES |

### AI Analysis

# Table Analysis: `conversation_status_history`

## Table Description
The `conversation_status_history` table records the history of status changes for conversations within a labeling or annotation tool. Each entry represents a transition from one status to another, capturing the context and metadata associated with the change. This table is crucial for tracking the workflow and progress of conversations as they move through various stages of processing and review.

## Column Descriptions

- **created_at (DATETIME, nullable=YES)**: The timestamp when the status change record was created. This marks the exact moment the transition was logged.
  
- **updated_at (DATETIME, nullable=YES)**: The timestamp when the status change record was last updated. This may reflect corrections or additional information added after the initial creation.
  
- **id (INT64, nullable=YES)**: A unique identifier for each status change record. This serves as the primary key for the table.
  
- **old_status (STRING, nullable=YES)**: The previous status of the conversation before the change. This indicates the starting point of the transition.
  
- **new_status (STRING, nullable=YES)**: The new status of the conversation after the change. This indicates the endpoint of the transition.
  
- **notes (STRING, nullable=YES)**: Additional information or comments regarding the status change. This often includes reasons for the change or references to related reviews or actions.
  
- **conversation_id (INT64, nullable=YES)**: A foreign key linking to the conversation that underwent the status change. This ties the status history to specific conversations.
  
- **author_id (INT64, nullable=YES)**: The identifier of the user or system that initiated the status change. This helps track accountability and origin of changes.
  
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES)**: Metadata related to the data stream, including a unique identifier (`uuid`) and a timestamp (`source_timestamp`) indicating when the data was sourced. This provides context for data lineage and traceability.
  
- **form_stage (STRING, nullable=YES)**: The stage of the form associated with the status change, if applicable. This could be used to track progress through predefined stages of a workflow.

## Table Relationships
The `conversation_status_history` table is likely related to other tables in the database through common identifiers:

- **Project Table**: May relate via `conversation_id` if conversations are grouped by projects.
- **Batch Table**: Could be indirectly related if conversations are processed in batches.
- **Conversation Table**: Directly related through `conversation_id`, providing detailed information about each conversation.
- **Review Table**: May relate through `notes` or `author_id` if reviews trigger status changes.
- **Contributor Table**: Related through `author_id`, linking status changes to specific contributors or users.

## Key Insights

- The table provides a comprehensive audit trail of status changes, crucial for understanding workflow dynamics and identifying bottlenecks or frequent transitions.
- The presence of `notes` suggests that many status changes are accompanied by qualitative insights, which can be valuable for process improvement or understanding decision-making contexts.
- The `datastream_metadata` column indicates a focus on data provenance, ensuring that each status change can be traced back to its source, which is essential for maintaining data integrity and compliance.
- The `form_stage` column, although often null, could be leveraged to analyze the progression of conversations through specific workflow stages, offering insights into process efficiency and potential areas for optimization.

### Sample Data

See: [`conversation_status_history_sample.json`](./conversation_status_history_sample.json)

---

## conversation_version

**Row Count**: 42,009 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `colab_revision_id` | STRING | YES |
| `conversation_id` | INT64 | YES |
| `duration_minutes` | INT64 | YES |
| `status` | STRING | YES |
| `labeling` | JSON | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |
| `conversation_version_name` | STRING | YES |
| `form_stage` | STRING | YES |
| `author_id` | INT64 | YES |
| `non_billable` | INT64 | YES |
| `automatic_duration_minutes` | INT64 | YES |
| `is_public` | INT64 | YES |

### AI Analysis

# Table Analysis: `conversation_version`

## Table Description
The `conversation_version` table stores metadata and versioning information related to conversations within a labeling or annotation tool. Each row represents a version of a conversation, capturing details such as creation and update timestamps, version identifiers, and author information. This table is crucial for tracking the evolution and status of conversations as they undergo various stages of annotation and review.

## Column Descriptions
- **created_at (DATETIME, nullable=YES):** The timestamp when the conversation version was created. This helps in tracking the lifecycle of a conversation version.
- **updated_at (DATETIME, nullable=YES):** The timestamp of the last update to the conversation version, indicating the most recent modification.
- **id (INT64, nullable=YES):** A unique identifier for each conversation version, serving as the primary key for the table.
- **colab_revision_id (STRING, nullable=YES):** A unique string identifier for the collaborative revision, likely used for version control or integration with external systems.
- **conversation_id (INT64, nullable=YES):** References the conversation to which this version belongs, linking to a `conversation` table.
- **duration_minutes (INT64, nullable=YES):** The total duration in minutes that the conversation version spans, possibly indicating the length of the conversation.
- **status (STRING, nullable=YES):** The current status of the conversation version (e.g., "published"), indicating its stage in the workflow.
- **labeling (JSON, nullable=YES):** A JSON object storing labeling or annotation data, if applicable, for this version.
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** Contains metadata about the data stream, including a unique identifier (`uuid`) and a timestamp (`source_timestamp`) for data synchronization.
- **conversation_version_name (STRING, nullable=YES):** An optional name for the conversation version, possibly used for easier identification.
- **form_stage (STRING, nullable=YES):** Indicates the current stage of the form associated with the conversation, useful for tracking progress.
- **author_id (INT64, nullable=YES):** The ID of the author who created or last modified the conversation version, linking to a `contributor` or `user` table.
- **non_billable (INT64, nullable=YES):** A flag indicating whether the conversation version is non-billable (0 for false, 1 for true).
- **automatic_duration_minutes (INT64, nullable=YES):** The duration in minutes calculated automatically, possibly for auditing or billing purposes.
- **is_public (INT64, nullable=YES):** A flag indicating the visibility of the conversation version (0 for private, 1 for public).

## Table Relationships
- **Project/Batches:** The `conversation_version` table may relate to a `project` or `batch` table through the `conversation_id`, as conversations are often grouped into projects or batches for processing.
- **Conversation:** Directly related to a `conversation` table via the `conversation_id`, which holds the core details of the conversation itself.
- **Contributor:** Linked to a `contributor` or `user` table through the `author_id`, identifying the user responsible for the version.
- **Review:** May interact with a `review` table if versions undergo a review process, with status changes reflecting review outcomes.

## Key Insights
- The table supports version control and tracking of conversations, which is essential for maintaining the integrity and history of annotations.
- The presence of both `duration_minutes` and `automatic_duration_minutes` suggests a need for manual and automated tracking of conversation lengths, possibly for billing or auditing.
- The `status` and `form_stage` columns provide insight into the workflow and progress of each conversation version, which can be used for process optimization.
- The `is_public` and `non_billable` flags indicate considerations for access control and financial tracking, respectively, highlighting the table's role in operational and business processes.

### Sample Data

See: [`conversation_version_sample.json`](./conversation_version_sample.json)

---

## delivery_batch

**Row Count**: 204 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `name` | STRING | YES |
| `description` | STRING | YES |
| `open_date` | TIMESTAMP | YES |
| `close_date` | TIMESTAMP | YES |
| `status` | STRING | YES |
| `author_id` | INT64 | YES |
| `project_id` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |
| `metadata` | JSON | YES |

### AI Analysis

# Table Analysis: `delivery_batch`

## 1. Table Description
The `delivery_batch` table is designed to store information about batches within a labeling or annotation tool database. Each batch represents a collection of tasks or items grouped for processing, often associated with a specific project. This table captures metadata about the batch, including its creation and update timestamps, status, and associated project and author details.

## 2. Column Descriptions
- **created_at (DATETIME, nullable=YES):** The timestamp when the batch was initially created. This helps track the lifecycle of the batch from inception.
- **updated_at (DATETIME, nullable=YES):** The timestamp of the last update made to the batch record, useful for auditing changes over time.
- **id (INT64, nullable=YES):** A unique identifier for each batch, serving as the primary key for this table.
- **name (STRING, nullable=YES):** A descriptive name for the batch, which can be used for easy identification and reference.
- **description (STRING, nullable=YES):** An optional field for additional details or notes about the batch.
- **open_date (TIMESTAMP, nullable=YES):** The date and time when the batch was opened or made available for processing.
- **close_date (TIMESTAMP, nullable=YES):** The date and time when the batch was closed or completed. A null value indicates the batch is still active.
- **status (STRING, nullable=YES):** The current state of the batch, such as "ongoing" or "completed", indicating its progress.
- **author_id (INT64, nullable=YES):** A reference to the user or contributor who created the batch, likely linking to a user or contributor table.
- **project_id (INT64, nullable=YES):** A reference to the associated project, linking this batch to a specific project table.
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** Contains metadata related to the data stream, including a unique identifier (UUID) and a source timestamp, which may be used for tracking data lineage or synchronization.
- **metadata (JSON, nullable=YES):** A flexible field for storing additional structured information about the batch, allowing for extensibility.

## 3. Table Relationships
- **Project:** The `project_id` column links each batch to a specific project, suggesting that multiple batches can belong to a single project.
- **Contributor/Author:** The `author_id` column likely connects to a contributor or user table, indicating who is responsible for creating the batch.
- **Common Patterns:** This table fits into a broader schema where batches are grouped under projects and managed by contributors. It may interact with tables like `project`, `contributor`, and possibly `review` if batches undergo a review process.

## 4. Key Insights
- The `delivery_batch` table is central to managing and tracking the progress of annotation tasks within projects.
- The presence of `open_date` and `close_date` allows for monitoring the duration and activity period of each batch.
- The `status` column provides a quick overview of the batch's current state, which is crucial for workflow management.
- The `datastream_metadata` field suggests integration with external data systems or streams, highlighting the importance of data provenance.
- The use of a `metadata` JSON field indicates a need for flexibility in capturing additional batch-specific information that may not fit into predefined columns.

### Sample Data

See: [`delivery_batch_sample.json`](./delivery_batch_sample.json)

---

## delivery_batch_auto_review_item

**Row Count**: 3,903 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `delivery_batch_auto_review_id` | INT64 | YES |
| `review_success` | INT64 | YES |
| `conversation_id` | INT64 | YES |
| `review_id` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Analysis: `delivery_batch_auto_review_item`

## Table Description
The `delivery_batch_auto_review_item` table stores records of automated review items associated with delivery batches in a labeling/annotation tool database. Each entry represents an individual review item, detailing the outcome of automated reviews conducted on specific conversations within a batch. This table is crucial for tracking the success of automated reviews and linking them to their respective conversations and review processes.

## Column Descriptions

- **created_at (DATETIME, nullable=YES):** The timestamp indicating when the review item was created. This is used to track the initiation of the review process.
  
- **updated_at (DATETIME, nullable=YES):** The timestamp of the last update to the review item record. This helps in monitoring changes or updates to the review status.

- **id (INT64, nullable=YES):** A unique identifier for each review item. This serves as the primary key for the table, allowing for unique identification of each record.

- **delivery_batch_auto_review_id (INT64, nullable=YES):** References the specific automated review batch to which this review item belongs. It links the item to a broader review batch process.

- **review_success (INT64, nullable=YES):** An indicator of whether the review was successful (commonly binary, e.g., 1 for success, 0 for failure). This column is essential for evaluating the effectiveness of the review process.

- **conversation_id (INT64, nullable=YES):** Identifies the conversation that was subject to review. This links the review item to specific conversations within the system.

- **review_id (INT64, nullable=YES):** References the specific review process or instance that this item is part of. It connects the item to a detailed review record.

- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** Contains metadata about the data stream, including a unique identifier (`uuid`) and a timestamp (`source_timestamp`) indicating when the data was sourced. This provides context and traceability for the data stream involved in the review.

## Table Relationships
- **Project:** This table may indirectly relate to projects through the `delivery_batch_auto_review_id`, which could be tied to specific projects.
  
- **Batch:** The `delivery_batch_auto_review_id` directly associates each review item with a particular batch, indicating that this table is a component of a larger batch processing system.

- **Conversation:** The `conversation_id` links each review item to a specific conversation, suggesting that this table is used to evaluate and track reviews at the conversation level.

- **Review:** The `review_id` connects the review item to a specific review process, indicating that this table is part of a broader review framework.

- **Contributor:** While not directly referenced, contributors may be involved in the creation or oversight of review processes that this table records.

## Key Insights
- The table is designed to facilitate the tracking and evaluation of automated review processes within a batch framework, providing detailed insights into the success and metadata of each review item.
- The presence of timestamps for creation and updates allows for historical tracking and auditing of review processes, which is crucial for maintaining the integrity and reliability of the review system.
- The integration of `datastream_metadata` suggests a focus on data provenance and traceability, ensuring that each review item can be traced back to its source data stream.
- The table's structure supports scalability and detailed analysis, enabling users to assess the performance of automated reviews across different conversations and batches, which is vital for optimizing review strategies and improving overall system efficiency.

### Sample Data

See: [`delivery_batch_auto_review_item_sample.json`](./delivery_batch_auto_review_item_sample.json)

---

## delivery_batch_auto_reviews

**Row Count**: 22 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `status` | STRING | YES |
| `started_at` | DATETIME | YES |
| `completed_at` | DATETIME | YES |
| `success_count` | INT64 | YES |
| `failure_count` | INT64 | YES |
| `delivery_batch_id` | INT64 | YES |
| `report` | JSON | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Analysis: `delivery_batch_auto_reviews`

## Table Description
The `delivery_batch_auto_reviews` table stores information about automated review processes for delivery batches within a labeling/annotation tool. Each row represents a distinct review event, capturing the status, timing, and outcome of the review process. This table is crucial for tracking the performance and completion of automated reviews associated with specific delivery batches.

## Column Descriptions

- **created_at (DATETIME, nullable=YES):** The timestamp when the review record was initially created in the database. This helps in tracking the initiation of the review process.
  
- **updated_at (DATETIME, nullable=YES):** The timestamp of the most recent update to the review record. This indicates the last time any information related to the review was modified.
  
- **id (INT64, nullable=YES):** A unique identifier for each review record. This serves as the primary key for the table.
  
- **status (STRING, nullable=YES):** The current status of the review process, such as "done", indicating whether the review has been completed or is still in progress.
  
- **started_at (DATETIME, nullable=YES):** The timestamp when the review process began. This helps in calculating the duration of the review process.
  
- **completed_at (DATETIME, nullable=YES):** The timestamp when the review process was completed. This, along with `started_at`, can be used to measure the total time taken for the review.
  
- **success_count (INT64, nullable=YES):** The number of successful review items within the batch. This metric is used to assess the effectiveness of the review process.
  
- **failure_count (INT64, nullable=YES):** The number of failed review items within the batch. This provides insight into potential issues or errors encountered during the review.
  
- **delivery_batch_id (INT64, nullable=YES):** A foreign key linking to the delivery batch that the review is associated with. This establishes a relationship with the delivery batch table.
  
- **report (JSON, nullable=YES):** A JSON object containing detailed information or results from the review process. This field can store complex data structures for in-depth analysis.
  
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** Metadata related to the data stream, including a unique identifier (`uuid`) and a timestamp (`source_timestamp`) indicating when the data was sourced. This provides additional context for the review process.

## Table Relationships
The `delivery_batch_auto_reviews` table is likely related to other tables within the database through the `delivery_batch_id` column, which connects it to a delivery batch table. This relationship is essential for linking review records to specific batches of data or tasks. Common patterns in such databases may include relationships with project, batch, conversation, review, and contributor tables, where this table would specifically focus on the review aspect.

## Key Insights
- The table provides a detailed log of automated review processes, including timestamps and outcomes, which are crucial for performance tracking and quality assurance.
- The `success_count` and `failure_count` columns offer a quantitative measure of the review's effectiveness, allowing for the identification of trends or issues over time.
- The presence of `datastream_metadata` suggests integration with external data sources or systems, which could be important for understanding the context and origin of the data being reviewed.
- The table's structure supports detailed reporting and analysis through the `report` column, although in the sample data, this field is not populated, indicating potential areas for enhancement in data capture.

### Sample Data

See: [`delivery_batch_auto_reviews_sample.json`](./delivery_batch_auto_reviews_sample.json)

---

## delivery_batch_status_history

**Row Count**: 487 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `old_status` | STRING | YES |
| `new_status` | STRING | YES |
| `notes` | STRING | YES |
| `delivery_batch_id` | INT64 | YES |
| `author_id` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Analysis: `delivery_batch_status_history`

## Table Description
The `delivery_batch_status_history` table records the historical status changes of delivery batches within a labeling or annotation tool. Each entry in the table represents a transition from one status to another for a specific delivery batch, capturing the time of change, the author responsible, and additional metadata about the event.

## Column Descriptions
- **created_at (DATETIME, nullable=YES):** The timestamp when the status change record was created. This indicates when the status transition was initially logged.
- **updated_at (DATETIME, nullable=YES):** The timestamp of the last update to the record. Typically, this will match `created_at` unless the record has been modified after its creation.
- **id (INT64, nullable=YES):** A unique identifier for each status change record. This serves as the primary key for the table.
- **old_status (STRING, nullable=YES):** The previous status of the delivery batch before the change. This can be null if the status change is the initial state assignment.
- **new_status (STRING, nullable=YES):** The new status assigned to the delivery batch. This reflects the current state after the transition.
- **notes (STRING, nullable=YES):** Any additional information or comments regarding the status change. This field is often used for contextual notes or explanations.
- **delivery_batch_id (INT64, nullable=YES):** A foreign key linking to the delivery batch that underwent the status change. This associates the record with a specific batch.
- **author_id (INT64, nullable=YES):** A foreign key identifying the user or system that initiated the status change. This links to a contributor or user table.
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** Metadata about the data stream event, including a unique identifier (`uuid`) and a timestamp (`source_timestamp`) indicating when the event was sourced.

## Table Relationships
- **Project:** This table may indirectly relate to a project table through the delivery batch, as batches are often part of larger projects.
- **Batch:** The `delivery_batch_id` directly links this table to a batch table, where more detailed information about each delivery batch can be found.
- **Contributor:** The `author_id` column connects to a contributor or user table, identifying who made the status change.
- **Review:** While not directly linked, status changes may trigger or result from reviews, suggesting an indirect relationship with a review table.
- **Conversation:** There might be interactions or discussions logged in a conversation table related to status changes, especially if notes are involved.

## Key Insights
- The table provides a detailed audit trail of status changes, which is crucial for tracking the progress and history of delivery batches.
- The presence of both `old_status` and `new_status` allows for easy identification of status transitions and can be used to analyze patterns or bottlenecks in the delivery process.
- The `datastream_metadata` provides additional context for each status change, which can be useful for tracing the origin and timing of data events, especially in distributed systems.
- The `notes` field, although often empty, can provide valuable qualitative insights when populated, offering explanations or justifications for certain status changes.
- The table's structure supports integration with other tables, facilitating comprehensive reporting and analysis across projects, batches, and contributors.

### Sample Data

See: [`delivery_batch_status_history_sample.json`](./delivery_batch_status_history_sample.json)

---

## delivery_batch_task

**Row Count**: 24,840 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `notes` | JSON | YES |
| `delivery_batch_id` | INT64 | YES |
| `task_id` | INT64 | YES |
| `task_version_id` | INT64 | YES |
| `author_id` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Analysis: `delivery_batch_task`

## Table Description
The `delivery_batch_task` table stores information about tasks associated with delivery batches within a labeling/annotation tool. Each record in the table represents a specific task that is part of a delivery batch, capturing metadata about the task's creation, updates, and associated entities such as authors and task versions. This table is crucial for tracking the progress and changes of tasks within different delivery batches, facilitating task management and review processes.

## Column Descriptions

- **created_at (DATETIME, nullable=YES):** The timestamp when the task record was initially created. This helps in tracking the lifecycle and history of the task.
  
- **updated_at (DATETIME, nullable=YES):** The timestamp of the most recent update to the task record. It is used to monitor changes and ensure the task data is current.
  
- **id (INT64, nullable=YES):** A unique identifier for each task record in the table. This serves as the primary key for referencing specific tasks.
  
- **notes (JSON, nullable=YES):** A JSON object containing additional information or comments about the task, such as notes from reviews or annotations. This field provides context and insights into the task's history or purpose.
  
- **delivery_batch_id (INT64, nullable=YES):** A foreign key linking the task to a specific delivery batch. This establishes the relationship between tasks and their respective batches, enabling batch-level management and analysis.
  
- **task_id (INT64, nullable=YES):** A foreign key referencing the specific task being tracked. This connects the task record to the broader task management system, allowing for detailed task tracking and reporting.
  
- **task_version_id (INT64, nullable=YES):** A foreign key indicating the version of the task. This is important for version control and understanding the evolution of tasks over time.
  
- **author_id (INT64, nullable=YES):** A foreign key identifying the author or contributor who created or last modified the task. This helps in attributing work and managing contributor performance.
  
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** A structured field containing metadata about the data stream, including a unique identifier (UUID) and a source timestamp. This is used for tracking data lineage and ensuring data integrity.

## Table Relationships
The `delivery_batch_task` table is likely related to several other tables in a typical annotation tool database:

- **Projects:** Tasks may be part of larger projects, with a potential relationship through the `task_id` or `delivery_batch_id`.
- **Batches:** The `delivery_batch_id` directly links tasks to specific delivery batches, indicating which batch a task belongs to.
- **Conversations/Reviews:** The `notes` field often references conversation reviews, suggesting a relationship with a table that logs review activities.
- **Contributors:** The `author_id` links tasks to contributors, indicating who is responsible for task creation or updates.

## Key Insights

- The table provides a comprehensive view of task management within delivery batches, capturing both static and dynamic aspects of tasks.
- The presence of versioning and author information allows for robust tracking of task evolution and contributor activity.
- The use of JSON and structured metadata fields indicates a flexible schema design, accommodating additional context and data lineage tracking.
- The relationship between tasks and reviews, as seen in the `notes`, highlights the importance of quality assurance and iterative improvement in the annotation process.

### Sample Data

See: [`delivery_batch_task_sample.json`](./delivery_batch_task_sample.json)

---

## difficulty_level

**Row Count**: 8,900 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `conversation_id` | INT64 | YES |
| `level` | STRING | YES |
| `reason` | STRING | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Analysis: `difficulty_level`

## Table Description
The `difficulty_level` table stores information about the difficulty assessment of various conversations within a labeling or annotation tool. Each entry corresponds to a specific conversation and records the perceived difficulty level, along with a reason for this assessment. This data is crucial for understanding the challenges faced during the annotation process and for optimizing task allocation and resource management.

## Column Descriptions

- **created_at (DATETIME, nullable=YES):** The timestamp indicating when the difficulty level record was created. This helps track when the assessment was made.
  
- **updated_at (DATETIME, nullable=YES):** The timestamp indicating the last time the difficulty level record was updated. This is useful for auditing changes and understanding the evolution of difficulty assessments over time.
  
- **conversation_id (INT64, nullable=YES):** A unique identifier for the conversation associated with the difficulty assessment. This serves as a foreign key linking to a `conversation` table, allowing for the retrieval of detailed conversation data.
  
- **level (STRING, nullable=YES):** The assessed difficulty level of the conversation, typically categorized as "easy," "medium," or "hard." This qualitative measure helps in analyzing the distribution of task difficulties.
  
- **reason (STRING, nullable=YES):** A textual explanation for the assigned difficulty level. This provides context and justification for the assessment, which can be useful for quality control and process improvement.
  
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** Metadata related to the data stream, including a unique identifier (`uuid`) and a `source_timestamp`, which represents the original time the data was generated or captured. This information is vital for tracking data provenance and ensuring data integrity.

## Table Relationships
- **Project:** The `difficulty_level` table may relate to a `project` table through the `conversation_id`, as conversations are typically part of larger projects.
- **Batch:** If conversations are processed in batches, this table might indirectly relate to a `batch` table through the `conversation_id`.
- **Conversation:** Directly linked via the `conversation_id`, allowing detailed conversation data to be accessed.
- **Review:** If difficulty assessments are reviewed, there might be a connection to a `review` table, possibly through a review process that evaluates the difficulty assessments.
- **Contributor:** While not directly linked, contributors who assess difficulty might be tracked in a separate `contributor` table, potentially linked through the `conversation_id`.

## Key Insights
- The table provides a structured way to assess and record the difficulty of annotation tasks, which can be analyzed to identify patterns in task complexity.
- The `level` and `reason` columns offer qualitative insights into the challenges faced during annotation, which can inform training and support for contributors.
- The timestamps (`created_at` and `updated_at`) allow for temporal analysis of difficulty assessments, enabling the identification of trends over time.
- The `datastream_metadata` ensures traceability and can be used to verify the authenticity and timing of the data, which is crucial for maintaining data quality and reliability.

### Sample Data

See: [`difficulty_level_sample.json`](./difficulty_level_sample.json)

---

## email_notification_log

**Row Count**: 2,305 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `email` | STRING | YES |
| `status` | STRING | YES |
| `template_id` | INT64 | YES |
| `replacements` | JSON | YES |
| `error` | STRING | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Analysis: `email_notification_log`

## Table Description
The `email_notification_log` table records the history of email notifications sent by a labeling/annotation tool. Each row represents an individual email notification, capturing details about the email's creation, delivery status, and any associated metadata. This table is crucial for tracking communication between the system and its users, particularly in the context of project reviews and feedback.

## Column Descriptions

- **created_at (DATETIME, nullable=YES):** The timestamp when the email notification was initially created. This helps in tracking when the notification process started.
  
- **updated_at (DATETIME, nullable=YES):** The timestamp of the last update to the email notification record, which could reflect changes in status or other metadata.

- **id (INT64, nullable=YES):** A unique identifier for each email notification entry. This serves as the primary key for the table.

- **email (STRING, nullable=YES):** The recipient's email address to which the notification was sent. This is essential for identifying the user involved in the communication.

- **status (STRING, nullable=YES):** The current status of the email notification, such as "success" or "failure," indicating whether the email was delivered successfully or encountered issues.

- **template_id (INT64, nullable=YES):** The identifier of the email template used for the notification. This links the notification to a specific template, which defines the structure and content of the email.

- **replacements (JSON, nullable=YES):** A JSON object containing dynamic content replacements used in the email template. This includes links, feedback, and scores relevant to the specific notification context.

- **error (STRING, nullable=YES):** A description of any error that occurred during the email sending process. This is useful for debugging and understanding delivery failures.

- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** Metadata related to the data stream, including a unique identifier and a source timestamp, which can be used for tracing and auditing purposes.

## Table Relationships
The `email_notification_log` table likely interacts with several other tables in the database:

- **Project Table:** The `replacements` JSON includes a `conversationProjectName`, suggesting a link to a project table where project details are stored.

- **Batch Table:** While not explicitly mentioned, email notifications could be related to specific batches of tasks or reviews.

- **Conversation Table:** The `conversationId` and `conversationLink` in the `replacements` JSON indicate a direct relationship with a conversation table, which stores details about specific conversations or tasks.

- **Review Table:** The `reviewLink` and `reviewerEmail` in the `replacements` JSON suggest a connection to a review table, where feedback and scores are recorded.

- **Contributor Table:** The `email` field could relate to a contributor or user table, identifying the recipient of the notification.

## Key Insights
- The table provides a comprehensive log of email notifications, which is essential for auditing communication and ensuring transparency in user interactions.
- The `status` column is critical for monitoring the success rate of email deliveries, allowing for quick identification of issues.
- The `replacements` JSON is rich with contextual information, indicating that emails are highly customized and relevant to specific user actions or feedback.
- The presence of `datastream_metadata` suggests that this table might be part of a larger data pipeline, possibly for real-time analytics or monitoring.

### Sample Data

See: [`email_notification_log_sample.json`](./email_notification_log_sample.json)

---

## feedback_action_comment

**Row Count**: 2 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `id` | INT64 | YES |
| `action` | STRING | YES |
| `review_quality_dimension_value_id` | INT64 | YES |
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `action_comment` | STRING | YES |
| `turn` | INT64 | YES |
| `positive_feedback` | INT64 | YES |
| `feedback_comment` | STRING | YES |
| `author_id` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Analysis: `feedback_action_comment`

## Table Description
The `feedback_action_comment` table stores information related to feedback actions and comments within a labeling or annotation tool. It captures details about feedback provided on specific review quality dimensions, including metadata about the feedback's creation and updates, as well as the author of the feedback. This table is likely used to track and analyze feedback for quality assurance and improvement processes.

## Column Descriptions

- **id (INT64, nullable=YES)**: A unique identifier for each feedback action comment entry.
- **action (STRING, nullable=YES)**: Describes the type of action taken, potentially indicating the nature of feedback (e.g., approve, reject). Currently, this field is null in the sample data.
- **review_quality_dimension_value_id (INT64, nullable=YES)**: References the specific quality dimension being reviewed or commented on, likely linking to a quality dimension table.
- **created_at (DATETIME, nullable=YES)**: Timestamp indicating when the feedback action comment was created.
- **updated_at (DATETIME, nullable=YES)**: Timestamp indicating when the feedback action comment was last updated.
- **action_comment (STRING, nullable=YES)**: Contains any comments related to the action taken. This field is null in the sample data, suggesting it is optional or not always used.
- **turn (INT64, nullable=YES)**: May represent the sequence or order of feedback actions within a session or conversation. This field is null in the sample data.
- **positive_feedback (INT64, nullable=YES)**: A numeric indicator of positive feedback, where a value of 0 suggests no positive feedback was given.
- **feedback_comment (STRING, nullable=YES)**: Textual comments provided as feedback. In the sample data, this field is empty, indicating no additional comments were made.
- **author_id (INT64, nullable=YES)**: Identifies the user or contributor who authored the feedback, likely linking to a user or contributor table.
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES)**: Contains metadata about the data stream, including a unique identifier (uuid) and a source timestamp, which may be used for tracking and synchronization purposes.

## Table Relationships
- **Project**: The feedback might be associated with a specific project, although not directly referenced in this table. A project table could relate via the `review_quality_dimension_value_id`.
- **Batch**: If feedback is collected in batches, this table might relate to a batch table through a foreign key not explicitly listed here.
- **Conversation**: The `turn` column suggests a possible relationship with a conversation or session table, indicating the feedback's position within a sequence of interactions.
- **Review**: The `review_quality_dimension_value_id` likely connects to a review or quality dimension table, indicating the specific aspect of the review process the feedback pertains to.
- **Contributor**: The `author_id` column suggests a relationship with a contributor or user table, identifying who provided the feedback.

## Key Insights
- The table currently has minimal data, with both entries lacking detailed action or comment information, indicating either incomplete data entry or a specific use case where these fields are not always populated.
- The presence of `positive_feedback` as a numeric field allows for quantitative analysis of feedback trends, although in the sample data, no positive feedback is recorded.
- The `datastream_metadata` provides a mechanism for tracking the origin and timing of feedback entries, which can be crucial for data integrity and synchronization in distributed systems.
- The table structure supports a flexible feedback system that can accommodate various types of feedback actions and comments, although the current data suggests limited usage of these capabilities.

### Sample Data

See: [`feedback_action_comment_sample.json`](./feedback_action_comment_sample.json)

---

## form_stages

**Row Count**: 4 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `name` | STRING | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Analysis: `form_stages`

## Table Description
The `form_stages` table is designed to store information about different stages or roles involved in a labeling or annotation process within a project. Each entry in the table represents a distinct stage, such as a reviewer or trainer, which is part of the workflow in the annotation tool. This table is crucial for managing and tracking the progression of tasks through various stages of the annotation lifecycle.

## Column Descriptions

- **created_at (DATETIME, nullable=YES):** This column records the date and time when the stage entry was created. It is essential for tracking the history and evolution of stages over time.

- **updated_at (DATETIME, nullable=YES):** This column captures the date and time when the stage entry was last updated. It helps in auditing changes and maintaining the integrity of the stage information.

- **id (INT64, nullable=YES):** A unique identifier for each stage entry. This serves as the primary key for the table, ensuring each stage can be distinctly referenced.

- **name (STRING, nullable=YES):** The name of the stage, which typically describes the role or function within the annotation process, such as "Reviewer" or "Trainer B". This is crucial for understanding the responsibilities associated with each stage.

- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** This structured column contains metadata about the data stream associated with the stage. The `uuid` is a unique identifier for the data stream, while `source_timestamp` indicates the time the data was sourced, which is useful for synchronization and data lineage purposes.

## Table Relationships
The `form_stages` table is likely related to other tables in the database through common patterns such as projects, batches, conversations, reviews, and contributors. For instance:

- **Projects:** The stages might be linked to specific projects, indicating which stages are part of which project workflows.
- **Batches:** Stages could be associated with batches of data, showing how data moves through different stages.
- **Conversations and Reviews:** Stages like "Reviewer" suggest a connection to review processes, where annotations are checked and validated.
- **Contributors:** The stages might be linked to contributors who perform tasks at each stage, facilitating role assignments and task tracking.

## Key Insights
- The presence of structured metadata (`datastream_metadata`) suggests an emphasis on data lineage and tracking, which is vital for maintaining data integrity and understanding the flow of information.
- The table's design supports a flexible workflow management system, where stages can be dynamically added or updated, reflecting changes in the annotation process.
- The `name` column indicates a role-based approach to task management, allowing for clear delineation of responsibilities within the annotation tool.
- The timestamps (`created_at` and `updated_at`) provide a robust mechanism for auditing and historical analysis, enabling the tracking of changes over time.

### Sample Data

See: [`form_stages_sample.json`](./form_stages_sample.json)

---

## integration

**Row Count**: 4 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `id` | INT64 | YES |
| `name` | STRING | YES |
| `description` | STRING | YES |
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Analysis: `integration`

## 1. Description
The `integration` table is designed to store information about various integrations within a labeling or annotation tool database. Each row represents a unique integration, capturing essential metadata such as its name, description, creation and update timestamps, and specific datastream metadata. This table is crucial for managing and tracking the different integrations that facilitate data flow and interaction between the labeling tool and external systems or projects.

## 2. Column Purpose
- **id (INT64, nullable=YES):** A unique identifier for each integration entry. It serves as the primary key for the table, allowing for efficient querying and referencing.
- **name (STRING, nullable=YES):** The name of the integration, which provides a concise label or identifier for the integration, often reflecting its purpose or associated project.
- **description (STRING, nullable=YES):** A detailed explanation of the integration, offering context and clarifying its role or the project it supports.
- **created_at (DATETIME, nullable=YES):** The timestamp indicating when the integration was initially created, useful for tracking the lifecycle and history of the integration.
- **updated_at (DATETIME, nullable=YES):** The timestamp of the most recent update to the integration, which helps in maintaining the current status and version control.
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** A nested structure containing:
  - **uuid (STRING):** A universally unique identifier for the datastream, ensuring distinct identification across systems.
  - **source_timestamp (INT64):** A timestamp representing a specific point in time related to the data source, possibly used for synchronization or versioning purposes.

## 3. Relationship to Other Tables
In a typical labeling/annotation tool database, the `integration` table is likely related to several other tables:
- **Project Table:** Integrations may be linked to specific projects, facilitating data flow and operations specific to project requirements.
- **Batch Table:** Integrations could be associated with data batches, ensuring that data is processed and annotated in an organized manner.
- **Conversation Table:** For integrations involving chat or dialogue systems, this table might connect to conversations, enabling seamless data exchange.
- **Review Table:** Integrations might also interact with review processes, ensuring that data annotations meet quality standards.
- **Contributor Table:** Contributors or users might interact with integrations, either by configuring them or using them to facilitate their tasks.

## 4. Key Insights
- The `integration` table is a foundational component for managing how external systems interact with the labeling tool, ensuring that data is accurately and efficiently processed.
- The presence of `datastream_metadata` suggests that the table supports advanced data management features, such as synchronization and version control, which are critical for maintaining data integrity across systems.
- The timestamps (`created_at` and `updated_at`) are crucial for auditing and tracking changes over time, providing insights into the evolution and maintenance of each integration.
- The small row count (4) indicates that the table currently manages a limited number of integrations, which might suggest a focused or specialized use case, or it could be in the early stages of deployment.

### Sample Data

See: [`integration_sample.json`](./integration_sample.json)

---

## label

**Row Count**: 3 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `name` | STRING | YES |
| `description` | STRING | YES |
| `color` | STRING | YES |
| `project_id` | INT64 | YES |
| `author_id` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Analysis: `label`

## Table Description
The `label` table is designed to store metadata about labels used within a labeling or annotation tool. Each label is associated with a specific project and is created by an author. The table captures essential details such as the label's name, description, color, and metadata related to its creation and updates.

## Column Descriptions

- **created_at (DATETIME, nullable=YES):** The timestamp indicating when the label was initially created. This helps in tracking the lifecycle of the label.
  
- **updated_at (DATETIME, nullable=YES):** The timestamp for the last update made to the label. This is useful for auditing changes and maintaining version control.

- **id (INT64, nullable=YES):** A unique identifier for each label. It serves as the primary key for the table, ensuring each label can be uniquely referenced.

- **name (STRING, nullable=YES):** The name of the label. This is a human-readable identifier used to distinguish the label within the project.

- **description (STRING, nullable=YES):** A brief description of the label's purpose or usage. This provides context to users about what the label represents.

- **color (STRING, nullable=YES):** The color associated with the label, often used in UI to visually differentiate labels.

- **project_id (INT64, nullable=YES):** A foreign key linking the label to a specific project. This establishes a relationship between the label and the project it belongs to.

- **author_id (INT64, nullable=YES):** A foreign key referencing the user who created the label. This helps in tracking authorship and responsibility.

- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** A structured field containing metadata about the data stream, including a unique UUID and a source timestamp. This can be used for tracing the origin and timing of data ingestion.

## Table Relationships

- **Project:** The `project_id` column links each label to a specific project, indicating that labels are organized or utilized within the context of projects.

- **Contributor:** The `author_id` column connects labels to contributors or users, identifying who created or is responsible for the label.

## Key Insights

- **Label Organization:** The table allows for the organization of labels by project, facilitating project-specific labeling and management.

- **User Tracking:** By associating labels with authors, the table supports accountability and tracking of user contributions.

- **Version Control:** The `created_at` and `updated_at` timestamps provide a mechanism for tracking changes over time, which is crucial for maintaining data integrity and historical records.

- **UI Customization:** The inclusion of a `color` field suggests an emphasis on user interface customization, allowing labels to be visually distinct.

- **Data Provenance:** The `datastream_metadata` field indicates an advanced level of data management, supporting traceability and auditability of data streams.

### Sample Data

See: [`label_sample.json`](./label_sample.json)

---

## labeling_workflow

**Row Count**: 14 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `name` | STRING | YES |
| `system_name` | STRING | YES |
| `description` | STRING | YES |
| `status` | STRING | YES |
| `version` | INT64 | YES |
| `configuration` | JSON | YES |
| `project_id` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Documentation: `labeling_workflow`

## Table Description
The `labeling_workflow` table stores metadata and configuration details for various labeling workflows used in an annotation tool. Each row represents a distinct workflow, detailing its creation and update timestamps, descriptive attributes, status, version, and specific configuration settings. This table is essential for managing and orchestrating the labeling processes within projects, ensuring tasks are assigned and processed according to predefined rules and roles.

## Column Descriptions

- **created_at (DATETIME, nullable=YES):** The timestamp when the workflow was initially created. This helps track the lifecycle and history of the workflow.
- **updated_at (DATETIME, nullable=YES):** The timestamp of the most recent update to the workflow, indicating the last modification time.
- **id (INT64, nullable=YES):** A unique identifier for each workflow, used as a primary key to distinguish between different workflows.
- **name (STRING, nullable=YES):** A human-readable name for the workflow, providing a quick reference to its purpose or function.
- **system_name (STRING, nullable=YES):** A system-generated name used internally to reference the workflow, often reflecting its role or configuration.
- **description (STRING, nullable=YES):** A textual description of the workflow, offering additional context or details about its setup or intent.
- **status (STRING, nullable=YES):** The current state of the workflow, such as 'active', indicating whether it is currently in use or not.
- **version (INT64, nullable=YES):** The version number of the workflow, useful for tracking changes and updates over time.
- **configuration (JSON, nullable=YES):** A JSON object containing detailed configuration settings for the workflow, including task assignment rules, collaborator roles, and conditions for task processing.
- **project_id (INT64, nullable=YES):** A foreign key linking the workflow to a specific project, indicating which project the workflow is associated with.
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** Metadata related to the data stream, including a unique identifier and a timestamp for the source data, which can be used for tracking and auditing purposes.

## Table Relationships
The `labeling_workflow` table is typically related to other tables through the `project_id` column, which associates each workflow with a specific project. Common patterns in databases of this nature include relationships with tables such as `project`, `batch`, `conversation`, `review`, and `contributor`. These relationships facilitate the management of workflows across different projects and ensure that tasks are appropriately assigned and reviewed.

## Key Insights
- The table captures both the static and dynamic aspects of a workflow, including its creation and update history, which is crucial for audit trails and version control.
- The `configuration` column provides a flexible and detailed mechanism for defining the workflow's behavior, including task assignment and role management, which can be tailored to specific project needs.
- The presence of a `status` column allows for easy filtering of active workflows, aiding in the operational management of ongoing projects.
- The integration of `datastream_metadata` suggests an emphasis on tracking and auditing data flows, which can be critical for compliance and quality assurance in labeling processes.

### Sample Data

See: [`labeling_workflow_sample.json`](./labeling_workflow_sample.json)

---

## labeling_workflow_history

**Row Count**: 210 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `old_name` | STRING | YES |
| `new_name` | STRING | YES |
| `old_status` | STRING | YES |
| `new_status` | STRING | YES |
| `version` | INT64 | YES |
| `old_configuration` | JSON | YES |
| `new_configuration` | JSON | YES |
| `workflow_id` | INT64 | YES |
| `author_id` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |
| `description` | STRING | YES |

### AI Analysis

# Table Documentation: `labeling_workflow_history`

## Table Description
The `labeling_workflow_history` table records the historical changes and updates made to labeling workflows within an annotation tool. Each entry in the table captures a snapshot of a workflow's state before and after a modification, including changes in name, status, configuration, and version. This table is essential for tracking the evolution of workflows and understanding the modifications made by different users over time.

## Column Descriptions

- **created_at (DATETIME, nullable=YES)**: The timestamp when the workflow change was initially recorded. This helps in tracking when specific changes were made.
  
- **updated_at (DATETIME, nullable=YES)**: The timestamp of the most recent update to this record. It indicates if and when a record was modified after its creation.
  
- **id (INT64, nullable=YES)**: A unique identifier for each record in the table, used to distinguish between different workflow history entries.
  
- **old_name (STRING, nullable=YES)**: The name of the workflow before the change was applied. Useful for tracking name changes over time.
  
- **new_name (STRING, nullable=YES)**: The updated name of the workflow after the change. This helps in identifying the current name of the workflow.
  
- **old_status (STRING, nullable=YES)**: The status of the workflow before the change (e.g., active, inactive). This is important for understanding the workflow's lifecycle.
  
- **new_status (STRING, nullable=YES)**: The status of the workflow after the change. It shows the current operational state of the workflow.
  
- **version (INT64, nullable=YES)**: The version number of the workflow after the change, indicating the sequence of changes made.
  
- **old_configuration (JSON, nullable=YES)**: The configuration settings of the workflow before the change, stored in JSON format. This includes details like task assignment and collaborator roles.
  
- **new_configuration (JSON, nullable=YES)**: The updated configuration settings of the workflow after the change, also in JSON format. It reflects the current setup of the workflow.
  
- **workflow_id (INT64, nullable=YES)**: A reference to the specific workflow that was modified, linking this history to the main workflow records.
  
- **author_id (INT64, nullable=YES)**: The identifier of the user who made the changes, which is crucial for auditing and accountability.
  
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES)**: Metadata about the data stream, including a unique identifier and a timestamp, which can be used for data tracking and synchronization purposes.
  
- **description (STRING, nullable=YES)**: A textual description of the change, providing additional context and rationale for the modifications made.

## Table Relationships
The `labeling_workflow_history` table is likely related to other tables in the database through common entities such as `workflow_id` and `author_id`. Common patterns include:

- **Projects**: Workflows may be part of larger projects, and changes in workflows could be linked to project requirements.
- **Batches**: Workflows might be applied to specific batches of data, and changes could reflect batch-specific adjustments.
- **Conversations**: If workflows are used in annotation tasks involving conversations, changes might be related to conversation handling.
- **Reviews**: Workflow changes could be tied to review processes, especially if roles like "Reviewer" are involved.
- **Contributors**: The `author_id` can be linked to a contributors table to identify who made changes.

## Key Insights
- The table provides a comprehensive audit trail of workflow changes, which is crucial for maintaining data integrity and understanding the evolution of annotation processes.
- The presence of both old and new configurations in JSON format allows for detailed comparisons and rollback capabilities if needed.
- The versioning system ensures that changes are tracked sequentially, which is vital for managing complex workflows with multiple updates.
- The table supports accountability by recording the author of each change, which is essential for collaborative environments where multiple users can modify workflows.

### Sample Data

See: [`labeling_workflow_history_sample.json`](./labeling_workflow_history_sample.json)

---

## language

**Row Count**: 29 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `id` | INT64 | YES |
| `name` | STRING | YES |
| `code` | STRING | YES |
| `is_available` | INT64 | YES |
| `description` | STRING | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Language Table Documentation

## Table Description
The `language` table stores information about various languages that are supported or recognized by a labeling/annotation tool. Each entry in the table corresponds to a specific language, detailing its name, code, availability status, and additional metadata related to its data stream. This table is essential for managing language-specific operations within the tool, such as text annotation or translation tasks.

## Column Descriptions

- **id (INT64, nullable=YES):** A unique identifier for each language entry. This serves as the primary key for the table.
- **name (STRING, nullable=YES):** The full name of the language. This is used for display purposes and to provide a human-readable reference to the language.
- **code (STRING, nullable=YES):** The ISO 639-1 or ISO 639-3 code representing the language. This code is used for programmatic identification and integration with other systems or datasets.
- **is_available (INT64, nullable=YES):** A flag indicating whether the language is currently available for use in the tool. A value of `1` means available, while a value of `0` would mean unavailable.
- **description (STRING, nullable=YES):** A textual description of the language. This field can provide additional context or notes about the language, though it is empty in the sample data provided.
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** A nested structure containing metadata about the data stream associated with the language. It includes:
  - **uuid (STRING):** A unique identifier for the data stream, which can be used to trace the source or version of the language data.
  - **source_timestamp (INT64):** A timestamp indicating when the data stream was last updated or sourced, stored as a Unix epoch time in milliseconds.

## Table Relationships
The `language` table is likely related to other tables in the database through common patterns such as projects, batches, conversations, reviews, or contributors. For example:
- **Project/Batches:** Languages might be associated with specific projects or batches that require multilingual support.
- **Conversations:** In a conversational AI context, this table could link to conversations to specify the language used.
- **Reviews:** Language-specific reviews might be conducted to ensure quality and accuracy in annotations.
- **Contributors:** Contributors might be assigned tasks based on their language proficiency, linking this table to user or contributor profiles.

## Key Insights
- The table contains 29 entries, suggesting a diverse range of languages supported by the tool.
- All sample data entries have `is_available` set to `1`, indicating these languages are currently active and usable within the tool.
- The presence of `datastream_metadata` suggests that language data is versioned or sourced from specific streams, which could be important for maintaining data integrity and consistency across different tool versions or deployments.
- The `description` field is currently empty in the sample data, which might indicate a need for further documentation or could be reserved for future use.

### Sample Data

See: [`language_sample.json`](./language_sample.json)

---

## latest_review_qdv_index

**Row Count**: 84,320 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `conversation_version_id` | INT64 | YES |
| `quality_dimension_id` | INT64 | YES |
| `conversation_id` | INT64 | YES |
| `latest_manual_qdv_id` | INT64 | YES |
| `latest_manual_review_id` | INT64 | YES |
| `latest_auto_qdv_id` | INT64 | YES |
| `latest_auto_review_id` | INT64 | YES |
| `is_reviewer_misaligned` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Analysis: `latest_review_qdv_index`

## Table Description
The `latest_review_qdv_index` table stores metadata about the latest quality dimension evaluations and reviews associated with different conversation versions within a labeling/annotation tool. Each row represents a unique combination of a conversation version and a quality dimension, detailing both manual and automated review statuses. This table is crucial for tracking the most recent assessments and identifying any discrepancies in reviewer alignment.

## Column Descriptions

- **created_at (DATETIME, nullable=YES):** The timestamp when the record was initially created in the database. This helps in tracking the data entry timeline.
  
- **updated_at (DATETIME, nullable=YES):** The timestamp of the last update made to the record. Useful for auditing changes and maintaining data integrity over time.
  
- **id (INT64, nullable=YES):** A unique identifier for each record in the table. This serves as the primary key for referencing specific entries.
  
- **conversation_version_id (INT64, nullable=YES):** References the specific version of a conversation that is being evaluated. This is crucial for version control and ensuring the correct context is reviewed.
  
- **quality_dimension_id (INT64, nullable=YES):** Identifies the specific quality dimension being assessed. This links to predefined quality metrics or standards used in the review process.
  
- **conversation_id (INT64, nullable=YES):** Links to the broader conversation entity, allowing aggregation and analysis across different versions of the same conversation.
  
- **latest_manual_qdv_id (INT64, nullable=YES):** Points to the most recent manual quality dimension evaluation, indicating the latest human-reviewed assessment.
  
- **latest_manual_review_id (INT64, nullable=YES):** References the latest manual review conducted, providing insights into the most recent human oversight.
  
- **latest_auto_qdv_id (INT64, nullable=YES):** References the latest automated quality dimension evaluation, if available. This is used to compare automated assessments with manual ones.
  
- **latest_auto_review_id (INT64, nullable=YES):** Points to the most recent automated review, facilitating comparison with manual reviews to assess automation accuracy.
  
- **is_reviewer_misaligned (INT64, nullable=YES):** A flag indicating whether there is a misalignment between reviewers, with `0` for aligned and `1` for misaligned. This helps in identifying discrepancies in evaluations.
  
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** Contains metadata about the data stream, including a unique identifier (`uuid`) and a timestamp (`source_timestamp`) indicating when the data was sourced. This aids in tracking data provenance and ensuring data consistency.

## Table Relationships

- **Project:** This table likely relates to a project table where each conversation is part of a larger project. The `conversation_id` can be used to link to specific projects.
  
- **Batch:** Conversations might be processed in batches, and this table could relate to a batch table through `conversation_id` or `conversation_version_id`.
  
- **Conversation:** Directly related through `conversation_id`, this table provides detailed review data for each conversation.
  
- **Review:** The table is inherently connected to a review table through `latest_manual_review_id` and `latest_auto_review_id`, detailing the outcomes of these reviews.
  
- **Contributor:** While not directly referenced, contributors (reviewers) might be linked through the review tables, providing insights into who conducted the evaluations.

## Key Insights

- **Review Alignment:** The `is_reviewer_misaligned` column provides a quick way to identify potential issues in review consistency, which is critical for maintaining quality standards.
  
- **Manual vs. Automated Reviews:** The presence of both manual and automated review identifiers allows for comparative analysis, helping to evaluate the effectiveness and reliability of automated systems.
  
- **Data Provenance:** The `datastream_metadata` ensures that each record's origin and timing are traceable, which is essential for auditing and compliance purposes.
  
- **Temporal Analysis:** With `created_at` and `updated_at` timestamps, it's possible to analyze the review process's timeliness and efficiency, identifying potential bottlenecks or delays.

### Sample Data

See: [`latest_review_qdv_index_sample.json`](./latest_review_qdv_index_sample.json)

---

## migrations

**Row Count**: 745 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `id` | INT64 | YES |
| `timestamp` | INT64 | YES |
| `name` | STRING | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Analysis: `migrations`

## Description
The `migrations` table stores metadata related to database schema changes or updates within a labeling/annotation tool. Each entry in the table represents a specific migration event, detailing when it occurred, its unique identifier, and any associated metadata. This table is crucial for tracking the evolution of the database schema over time, ensuring that changes are applied consistently and can be audited if necessary.

## Column Descriptions

- **id (INT64, nullable=YES):** A unique identifier for each migration event. This serves as the primary key for the table, allowing for distinct identification of each migration record.

- **timestamp (INT64, nullable=YES):** The Unix timestamp indicating when the migration was executed. This helps in ordering migrations chronologically and understanding the timeline of schema changes.

- **name (STRING, nullable=YES):** A descriptive name for the migration, often including a brief description of the change and a unique timestamp. This provides human-readable context about what the migration aims to achieve.

- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** A nested structure containing:
  - **uuid (STRING):** A universally unique identifier for the migration event, ensuring global uniqueness across potential distributed systems.
  - **source_timestamp (INT64):** The timestamp of the source event that triggered the migration, useful for tracing back to the origin of the change.

## Relationships to Other Tables
The `migrations` table is typically related to other tables through the context of schema changes that affect various aspects of the database. Common patterns include:

- **Project:** Migrations may involve changes to project configurations or structures.
- **Batch:** Schema updates could affect how data batches are processed or stored.
- **Conversation:** Migrations might introduce new fields or modify existing ones in conversation-related tables.
- **Review:** Changes could impact review processes, such as adding new review quality dimensions.
- **Contributor:** Migrations might adjust contributor-related data structures or permissions.

## Key Insights

- The `migrations` table is essential for maintaining a historical record of all schema changes, which is critical for database integrity and rollback capabilities.
- The use of descriptive names for migrations aids in quickly understanding the purpose and impact of each change without needing to delve into the specifics of the migration scripts.
- The inclusion of `datastream_metadata` provides additional context and traceability, linking migrations back to their source events, which is particularly useful in complex systems with multiple data streams.
- The sequential nature of the `id` and `timestamp` columns allows for easy chronological tracking of changes, facilitating audit trails and debugging processes.

### Sample Data

See: [`migrations_sample.json`](./migrations_sample.json)

---

## permission

**Row Count**: 559 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `id` | INT64 | YES |
| `name` | STRING | YES |
| `description` | STRING | YES |
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Analysis: `permission`

## Table Description
The `permission` table stores information about various permissions available within a labeling or annotation tool. Each entry in the table represents a specific permission that can be granted to users or roles, detailing what actions they are allowed to perform within the system. This table is crucial for managing access control and ensuring that users have the appropriate rights to perform their tasks.

## Column Descriptions

- **id (INT64, nullable=YES):** A unique identifier for each permission entry. This serves as the primary key for the table.
  
- **name (STRING, nullable=YES):** The name of the permission, typically formatted in a way that indicates the action and the resource it pertains to (e.g., "deliverybatchtasks.unlockAll").

- **description (STRING, nullable=YES):** A detailed explanation of what the permission allows. This helps administrators understand the scope and impact of the permission.

- **created_at (DATETIME, nullable=YES):** The date and time when the permission entry was created. This can be used for auditing and tracking the evolution of permissions over time.

- **updated_at (DATETIME, nullable=YES):** The date and time when the permission entry was last updated. This is useful for maintaining the currency of the permission data.

- **datastream_metadata (STRUCT, nullable=YES):** Contains metadata related to data streaming processes:
  - **uuid (STRING):** A unique identifier for the data stream event associated with this permission entry.
  - **source_timestamp (INT64):** A timestamp indicating when the data stream event occurred, represented in milliseconds since the Unix epoch.

## Table Relationships
The `permission` table is likely related to other tables that manage user roles and access control, such as:

- **User or Contributor Table:** Permissions are often assigned to users or contributors, allowing them to perform specific actions within the system.
  
- **Role Table:** Permissions might be grouped into roles, which are then assigned to users. This table would help define which permissions are included in each role.

- **Project or Batch Table:** Permissions might be scoped to specific projects or batches, indicating that certain actions are permissible only within those contexts.

- **Review or Task Table:** Permissions could control access to reviewing or modifying tasks, ensuring that only authorized users can perform these actions.

## Key Insights
- The table contains a manageable number of entries (559 rows), suggesting a well-defined set of permissions within the system.
  
- The `name` and `description` fields provide a clear understanding of each permission's purpose, which is essential for effective access control management.

- The presence of `created_at` and `updated_at` timestamps indicates that the system tracks changes to permissions, which is vital for auditing and compliance purposes.

- The `datastream_metadata` field suggests that permissions are part of a larger data streaming architecture, possibly for real-time updates or integration with other systems.

Overall, the `permission` table is a foundational component of the system's access control mechanism, ensuring that users have the appropriate level of access to perform their duties effectively.

### Sample Data

See: [`permission_sample.json`](./permission_sample.json)

---

## project

**Row Count**: 53 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `name` | STRING | YES |
| `description` | STRING | YES |
| `possible_risks` | STRING | YES |
| `status` | STRING | YES |
| `project_type` | STRING | YES |
| `is_deliverable` | INT64 | YES |
| `supports_function_calling` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |
| `supports_workflows` | INT64 | YES |
| `jibble_activity` | STRING | YES |
| `supports_multiple_files_per_task` | INT64 | YES |
| `instructions_link` | STRING | YES |
| `time_control` | JSON | YES |
| `readonly` | INT64 | YES |
| `workstream_id` | INT64 | YES |
| `average_handle_time_minutes` | INT64 | YES |
| `category` | STRING | YES |
| `health` | STRING | YES |

### AI Analysis

# Project Table Analysis

## Table Description
The `project` table stores metadata and configuration details for various projects managed within a labeling/annotation tool. Each row represents a unique project, capturing essential attributes such as project status, type, and operational parameters. This table is crucial for tracking project progress, managing workflows, and ensuring deliverables meet specified requirements.

## Column Descriptions

- **created_at (DATETIME, nullable=YES):** The timestamp indicating when the project record was created.
- **updated_at (DATETIME, nullable=YES):** The timestamp of the last update made to the project record, useful for tracking changes over time.
- **id (INT64, nullable=YES):** A unique identifier for each project, serving as the primary key.
- **name (STRING, nullable=YES):** The name of the project, typically descriptive of its purpose or scope.
- **description (STRING, nullable=YES):** A textual description providing additional context about the project.
- **possible_risks (STRING, nullable=YES):** Information about potential risks associated with the project, aiding in risk management.
- **status (STRING, nullable=YES):** The current state of the project, such as "ongoing" or "completed," indicating its progress.
- **project_type (STRING, nullable=YES):** The classification of the project, such as "sft," which may denote a specific methodology or focus area.
- **is_deliverable (INT64, nullable=YES):** A flag (1 or 0) indicating whether the project has deliverables that need to be completed.
- **supports_function_calling (INT64, nullable=YES):** A flag indicating if the project supports function calling, which may relate to technical capabilities.
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** A structure containing metadata about the data stream, including a unique identifier and a timestamp.
- **supports_workflows (INT64, nullable=YES):** A flag indicating if the project supports workflow processes, which can affect task management.
- **jibble_activity (STRING, nullable=YES):** Possibly related to activity tracking or integration with external systems, though its specific use is unclear.
- **supports_multiple_files_per_task (INT64, nullable=YES):** A flag indicating whether tasks within the project can handle multiple files.
- **instructions_link (STRING, nullable=YES):** A URL or link to detailed project instructions, guiding contributors on task execution.
- **time_control (JSON, nullable=YES):** JSON data potentially used for managing time-related aspects of the project, such as deadlines or schedules.
- **readonly (INT64, nullable=YES):** A flag indicating if the project is in a read-only state, preventing modifications.
- **workstream_id (INT64, nullable=YES):** An identifier linking the project to a specific workstream, which may be part of a larger workflow or batch.
- **average_handle_time_minutes (INT64, nullable=YES):** The average time in minutes taken to handle tasks within the project, useful for performance analysis.
- **category (STRING, nullable=YES):** The category of the project, such as "external-client," which may influence prioritization or resource allocation.
- **health (STRING, nullable=YES):** A qualitative measure of the project's health, potentially indicating issues or areas needing attention.

## Table Relationships
The `project` table is likely related to other tables in the database through common patterns such as:

- **Batch:** Projects may be grouped into batches for processing, with a potential link via `workstream_id`.
- **Conversation:** Projects might involve conversations or interactions, particularly if annotation involves dialogue data.
- **Review:** Projects could undergo a review process, linking to a review table that tracks feedback and quality checks.
- **Contributor:** Contributors working on projects may be tracked in a separate table, with potential links through project IDs.

## Key Insights

- The table captures a comprehensive set of attributes that facilitate project management, including status tracking, risk assessment, and deliverable management.
- The presence of flags for workflow and function calling support indicates flexibility in project execution, allowing for varied project configurations.
- The `average_handle_time_minutes` column provides valuable insight into project efficiency and can be used to optimize resource allocation and task management.
- The `health` column, though not detailed in the sample data, could be pivotal for proactive project management by highlighting projects that require intervention.

### Sample Data

See: [`project_sample.json`](./project_sample.json)

---

## project_config

**Row Count**: 20 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `value` | JSON | YES |
| `project_id` | INT64 | YES |
| `app_config_id` | INT64 | YES |
| `config_id` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Analysis: `project_config`

## Description
The `project_config` table stores configuration settings for various projects within a labeling or annotation tool. Each entry in the table represents a specific configuration associated with a project, potentially linked to an application configuration. This table is crucial for managing and tracking changes to project-specific settings over time.

## Column Descriptions

- **created_at (DATETIME, nullable=YES):** The timestamp indicating when the configuration record was initially created. This helps in tracking the history of configuration changes.
  
- **updated_at (DATETIME, nullable=YES):** The timestamp of the most recent update to the configuration record. This is useful for auditing and understanding the timeline of changes.

- **id (INT64, nullable=YES):** A unique identifier for each configuration record. This serves as the primary key for the table, ensuring each entry is distinct.

- **value (JSON, nullable=YES):** A JSON object storing the actual configuration settings. The flexibility of JSON allows for varied types of configuration data to be stored, such as integers, booleans, or more complex structures.

- **project_id (INT64, nullable=YES):** A foreign key linking the configuration to a specific project. This establishes the relationship between the configuration and the project it applies to.

- **app_config_id (INT64, nullable=YES):** A foreign key that may link the configuration to a specific application configuration, suggesting a hierarchical or modular configuration setup.

- **config_id (INT64, nullable=YES):** Potentially a foreign key to another configuration table, though null in the sample data, indicating it might be used for advanced configurations or linking to a parent configuration.

- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** Metadata related to the data stream, including a unique identifier (UUID) and a source timestamp. This can be used for tracking the origin and timing of the data, especially in real-time data processing scenarios.

## Relationships to Other Tables

- **Project Table:** The `project_id` serves as a foreign key, linking each configuration to a specific project. This is a common pattern in databases where configurations are project-specific.

- **Application Configuration Table:** The `app_config_id` suggests a relationship with another table that stores application-wide configurations, allowing for shared settings across multiple projects.

- **Potential Parent Configuration Table:** The `config_id`, though null in the sample, may relate to another configuration table, indicating hierarchical or inherited configurations.

## Key Insights

- **Temporal Tracking:** The presence of `created_at` and `updated_at` timestamps allows for detailed tracking of configuration changes over time, which is essential for auditing and understanding the evolution of project settings.

- **Flexible Configuration Storage:** The use of a JSON column for `value` provides flexibility in storing diverse configuration data, accommodating a wide range of settings without requiring schema changes.

- **Metadata Utilization:** The `datastream_metadata` column suggests an integration with data streaming processes, providing context about the data's origin and timing, which is valuable for real-time data processing and analysis.

- **Project-Specific Configurations:** The table is designed to support project-specific configurations, allowing for tailored settings that can be adjusted independently for each project, enhancing customization and control.

### Sample Data

See: [`project_config_sample.json`](./project_config_sample.json)

---

## project_config_history

**Row Count**: 31 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `old_value` | JSON | YES |
| `new_value` | JSON | YES |
| `project_id` | INT64 | YES |
| `app_config_id` | INT64 | YES |
| `author_id` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Analysis: `project_config_history`

## Table Description
The `project_config_history` table is designed to store historical records of configuration changes made to projects within a labeling/annotation tool. Each entry in the table represents a specific change in the configuration, capturing both the previous and updated values, along with metadata about the change, such as the author and timestamps.

## Column Descriptions

- **created_at (DATETIME, nullable=YES):** The timestamp when the configuration change was initially recorded in the database.
- **updated_at (DATETIME, nullable=YES):** The timestamp when the configuration change record was last updated. Typically, this matches `created_at` unless the record itself is modified.
- **id (INT64, nullable=YES):** A unique identifier for each configuration change entry, serving as the primary key for the table.
- **old_value (JSON, nullable=YES):** A JSON object representing the configuration value before the change was made. This allows for flexible storage of various data types.
- **new_value (JSON, nullable=YES):** A JSON object representing the configuration value after the change was made, similar in structure to `old_value`.
- **project_id (INT64, nullable=YES):** A foreign key linking the configuration change to a specific project. This associates the change with the relevant project context.
- **app_config_id (INT64, nullable=YES):** Identifies the specific application configuration setting that was altered. This allows for tracking changes at a granular level.
- **author_id (INT64, nullable=YES):** A foreign key referencing the user who made the change, enabling accountability and traceability of configuration modifications.
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** Contains metadata about the data stream, including a unique identifier (`uuid`) and a `source_timestamp` indicating when the change was captured by the data stream.

## Table Relationships
- **Projects:** The `project_id` column links this table to a `projects` table, which would store details about each project. This relationship allows for tracking configuration changes specific to each project.
- **Contributors:** The `author_id` column connects to a `contributors` or `users` table, providing information about the individual responsible for the change.
- **Application Configurations:** The `app_config_id` suggests a relationship with an `app_configurations` table, where specific configuration settings and their descriptions are stored.

## Key Insights
- The table effectively captures a history of configuration changes, which is crucial for auditing and understanding the evolution of project settings over time.
- The use of JSON for `old_value` and `new_value` allows for flexibility in storing different types of configuration data, accommodating a wide range of potential settings.
- The presence of `datastream_metadata` indicates integration with a data streaming system, suggesting real-time or near-real-time tracking of configuration changes.
- The relatively small row count (31) suggests this table is either newly implemented or used for a limited number of projects or settings, which may grow over time as more changes are recorded.

### Sample Data

See: [`project_config_history_sample.json`](./project_config_history_sample.json)

---

## project_contributor

**Row Count**: 1,400 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `project_id` | INT64 | YES |
| `contributor_id` | INT64 | YES |
| `is_active` | INT64 | YES |
| `start_date` | DATE | YES |
| `end_date` | DATE | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |
| `expertise_level` | STRING | YES |
| `chat_role` | STRING | YES |

### AI Analysis

# Table Analysis: `project_contributor`

## Table Description
The `project_contributor` table stores information about contributors who are involved in various projects within a labeling or annotation tool. Each record represents a unique association between a contributor and a project, capturing details about their participation status, roles, and expertise levels. This table is crucial for tracking the contributors' engagement and contributions over time.

## Column Descriptions

- **created_at (DATETIME, nullable=YES):** The timestamp when the record was created. This helps in tracking when a contributor was first associated with a project.
  
- **updated_at (DATETIME, nullable=YES):** The timestamp of the last update to the record, indicating when any changes were last made to the contributor's association with the project.

- **id (INT64, nullable=YES):** A unique identifier for each record in the table, serving as the primary key for the `project_contributor` table.

- **project_id (INT64, nullable=YES):** A foreign key linking to the `project` table, identifying the specific project to which the contributor is associated.

- **contributor_id (INT64, nullable=YES):** A foreign key linking to the `contributor` table, identifying the specific contributor involved in the project.

- **is_active (INT64, nullable=YES):** A flag indicating whether the contributor is currently active in the project (1 for active, 0 for inactive).

- **start_date (DATE, nullable=YES):** The date when the contributor started their involvement in the project, useful for tracking the duration of engagement.

- **end_date (DATE, nullable=YES):** The date when the contributor's involvement in the project ended, if applicable. A null value indicates ongoing participation.

- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** Metadata related to the data stream, including a unique identifier (`uuid`) and a timestamp (`source_timestamp`) indicating when the data was sourced.

- **expertise_level (STRING, nullable=YES):** The level of expertise of the contributor, such as "proficient," which can be used to allocate tasks based on skill level.

- **chat_role (STRING, nullable=YES):** The role of the contributor in chat interactions, such as "target," which may influence their responsibilities within the project.

## Table Relationships
The `project_contributor` table is likely related to several other tables in the database:

- **Project Table:** Linked via `project_id`, this relationship allows for the identification of which project a contributor is working on.

- **Contributor Table:** Linked via `contributor_id`, this relationship provides detailed information about the contributor, such as their profile and history.

- **Batch, Conversation, Review Tables:** While not directly linked in this schema, contributors may be involved in specific batches, conversations, or reviews, which could be managed in separate tables.

## Key Insights

- **Contributor Engagement:** The `is_active`, `start_date`, and `end_date` columns provide insights into the duration and current status of a contributor's engagement in projects.

- **Expertise Utilization:** The `expertise_level` column can be used to match contributors with projects that require specific skill sets, optimizing project outcomes.

- **Role Assignment:** The `chat_role` column indicates the contributor's role in communication within the project, which can be crucial for understanding team dynamics and responsibilities.

- **Data Provenance:** The `datastream_metadata` provides a mechanism for tracking the origin and timing of data, which is important for audit trails and data integrity checks.

### Sample Data

See: [`project_contributor_sample.json`](./project_contributor_sample.json)

---

## project_form_stages

**Row Count**: 1 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `project_id` | INT64 | YES |
| `form_stages` | JSON | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Documentation: `project_form_stages`

## Description
The `project_form_stages` table is designed to store information about the different stages of forms associated with specific projects within a labeling or annotation tool. Each row in the table represents a unique configuration of form stages for a given project, detailing the sequence and identifiers of each stage.

## Column Descriptions

- **created_at (DATETIME, nullable=YES)**: This column records the date and time when the entry was initially created. It helps track the inception of the form stage configuration.
  
- **updated_at (DATETIME, nullable=YES)**: This column captures the date and time of the most recent update to the entry, allowing users to monitor changes over time.

- **id (INT64, nullable=YES)**: A unique identifier for each row in the table, serving as the primary key for the table.

- **project_id (INT64, nullable=YES)**: This column links the form stages to a specific project, indicating which project the form stages are associated with. It is likely a foreign key referencing a `projects` table.

- **form_stages (JSON, nullable=YES)**: A JSON object that contains an ordered list of stages, each with a `key`, `name`, and `order`. This structure defines the sequence and identifiers for each stage in the form process.

- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES)**: This column holds metadata related to the data stream, including a unique `uuid` for tracking and a `source_timestamp` indicating when the data was sourced.

## Table Relationships

- **Project**: The `project_id` column suggests a relationship with a `projects` table, where each project can have multiple form stages defined in this table.

- **Batch, Conversation, Review, Contributor**: While not directly referenced in this table, the form stages could influence workflows in tables related to batches, conversations, reviews, or contributors, depending on how stages are used in the broader system.

## Key Insights

- The table currently contains only one row, indicating a potentially singular configuration or a test entry. This might suggest that the system is in an early stage of development or testing.

- The `form_stages` JSON structure provides flexibility in defining and ordering stages, which can be crucial for customizing workflows in labeling or annotation processes.

- The presence of `datastream_metadata` implies integration with a data streaming system, which could be used for real-time updates or tracking changes across systems.

- The use of both `created_at` and `updated_at` timestamps allows for effective auditing and tracking of changes over time, which is essential for maintaining data integrity and understanding historical configurations.

### Sample Data

See: [`project_form_stages_sample.json`](./project_form_stages_sample.json)

---

## project_history

**Row Count**: 46 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `changed_fields` | JSON | YES |
| `comment` | STRING | YES |
| `project_id` | INT64 | YES |
| `author_id` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Analysis: `project_history`

## Table Description
The `project_history` table is designed to store historical records of changes made to projects within a labeling/annotation tool database. Each entry in this table represents a specific change event, capturing the details of what was modified, who made the change, and when it occurred. This table is crucial for auditing and tracking the evolution of projects over time.

## Column Descriptions

- **created_at (DATETIME, nullable=YES):** The timestamp indicating when the change record was created. This helps in tracking when a particular change was made.
  
- **updated_at (DATETIME, nullable=YES):** The timestamp indicating the last update to the change record. This is useful for identifying the most recent modifications to the change history entry.
  
- **id (INT64, nullable=YES):** A unique identifier for each change record. This serves as the primary key for the table, ensuring each entry is distinct.
  
- **changed_fields (JSON, nullable=YES):** A JSON object detailing the specific fields that were changed in the project. It includes both the new and old values, providing a clear view of what was modified.
  
- **comment (STRING, nullable=YES):** A textual comment describing the change event. This often includes a brief explanation or reason for the change, aiding in understanding the context.
  
- **project_id (INT64, nullable=YES):** A reference to the project associated with the change. This links the history record to a specific project in the broader database schema.
  
- **author_id (INT64, nullable=YES):** The identifier of the user who made the change. This allows tracking of user activity and accountability.
  
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** Metadata related to the data stream that generated the change event, including a unique identifier (UUID) and a source timestamp. This is useful for integration with external systems or for tracking data lineage.

## Table Relationships

The `project_history` table is likely related to other tables in the database through the `project_id` and `author_id` columns. Common patterns include:

- **Project Table:** The `project_id` serves as a foreign key linking to a `projects` table, which contains detailed information about each project.
  
- **Contributor Table:** The `author_id` links to a `contributors` or `users` table, providing information about the user who made the change.
  
- **Batch and Review Tables:** While not directly linked, changes in project history might affect batches or reviews, especially if changes involve project status or deliverability.

## Key Insights

- The `changed_fields` JSON structure allows for flexible and detailed tracking of changes, capturing both the new and old values for each modified field. This is essential for comprehensive audit trails.
  
- The presence of `datastream_metadata` suggests integration with external data sources or systems, indicating that project changes might be influenced by external events or data streams.
  
- The table's design supports robust auditing capabilities, enabling users to trace the history of project modifications, understand the rationale behind changes, and identify trends or patterns in project management practices.

Overall, the `project_history` table is a critical component for maintaining transparency and accountability in project management within the labeling/annotation tool environment.

### Sample Data

See: [`project_history_sample.json`](./project_history_sample.json)

---

## project_integration_configuration

**Row Count**: 19 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `id` | INT64 | YES |
| `configuration_type` | STRING | YES |
| `configuration_value` | JSON | YES |
| `integration_id` | INT64 | YES |
| `project_id` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Documentation: `project_integration_configuration`

## Table Description
The `project_integration_configuration` table stores configuration settings for various integrations associated with projects within a labeling or annotation tool. Each record in the table represents a specific configuration type and its corresponding value, which is applied to a particular integration within a project. This setup allows for customized behavior and rules for processing data streams or other integration-related tasks.

## Column Descriptions
- **id (INT64, nullable=YES):** A unique identifier for each configuration entry. This serves as the primary key for the table.
- **configuration_type (STRING, nullable=YES):** Specifies the type of configuration being stored, such as "llm-checks". This indicates the category or purpose of the configuration.
- **configuration_value (JSON, nullable=YES):** Contains the detailed configuration settings in JSON format. This can include rules, criteria, or parameters that define how the integration should function.
- **integration_id (INT64, nullable=YES):** References the specific integration to which this configuration applies. This links the configuration to a particular integration setup.
- **project_id (INT64, nullable=YES):** Identifies the project associated with the configuration. This links the configuration to a specific project within the system.
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** Provides metadata about the data stream, including a unique identifier (`uuid`) and a timestamp (`source_timestamp`) indicating when the data was sourced.

## Table Relationships
- **Project Relationship:** The `project_id` column links this table to a `projects` table, indicating which project each configuration belongs to.
- **Integration Relationship:** The `integration_id` column connects this table to an `integrations` table, specifying which integration the configuration is for.
- **Common Patterns:** This table is likely part of a broader schema that includes tables for projects, batches, conversations, reviews, and contributors, with configurations being a key aspect of managing how data is processed and evaluated.

## Key Insights
- The table allows for highly customizable configurations, as evidenced by the JSON format of the `configuration_value` column, which can store complex rules and criteria.
- The presence of `datastream_metadata` suggests that configurations may be applied dynamically based on real-time data processing needs.
- The use of specific configuration types like "llm-checks" indicates that the system supports advanced evaluation mechanisms, potentially for AI or machine learning applications.
- The table's design supports scalability and flexibility, allowing for the addition of new configuration types and values as the system evolves.

### Sample Data

See: [`project_integration_configuration_sample.json`](./project_integration_configuration_sample.json)

---

## project_quality_dimension

**Row Count**: 478 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `is_enabled` | INT64 | YES |
| `weight` | FLOAT64 | YES |
| `project_id` | INT64 | YES |
| `quality_dimension_id` | INT64 | YES |
| `prompt` | STRING | YES |
| `prompt_template` | STRING | YES |
| `reviewer_identity_prompt` | STRING | YES |
| `temperature` | FLOAT64 | YES |
| `llm_evaluator` | STRING | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |
| `current_quality_dimension_version_id` | INT64 | YES |
| `reviewer_type` | STRING | YES |
| `model` | STRING | YES |
| `input_filters` | JSON | YES |
| `use_latest_quality_dimension_version` | INT64 | YES |
| `provider` | STRING | YES |
| `web_search_enabled` | INT64 | YES |
| `is_turn_level` | INT64 | YES |
| `description` | STRING | YES |
| `code_execution_enabled` | INT64 | YES |
| `name` | STRING | YES |
| `turn_summarizing_prompt` | STRING | YES |
| `star_rating_tooltip` | JSON | YES |
| `system_prompt` | STRING | YES |
| `image_attach_enabled` | INT64 | YES |
| `review_display` | JSON | YES |
| `form_stages` | JSON | YES |
| `audio_attach_enabled` | INT64 | YES |
| `ac_agent_id` | INT64 | YES |
| `tools` | STRING | YES |
| `sort_order` | INT64 | YES |
| `is_sequential` | INT64 | YES |
| `sequential_call_params` | JSON | YES |
| `negative_review_threshold` | FLOAT64 | YES |
| `is_optional` | INT64 | YES |
| `type` | STRING | YES |

### AI Analysis

# Table Analysis: `project_quality_dimension`

## Table Description
The `project_quality_dimension` table is designed to store configurations and metadata related to quality dimensions within projects in a labeling or annotation tool. Each row represents a specific quality dimension associated with a project, detailing how evaluations should be conducted, including criteria, prompts, and settings for automated or manual reviews. This table is integral for defining the parameters and guidelines that ensure consistent quality assessments across different projects.

## Column Descriptions
- **created_at (DATETIME)**: The timestamp when the quality dimension entry was created.
- **updated_at (DATETIME)**: The timestamp of the most recent update to the quality dimension entry.
- **id (INT64)**: A unique identifier for each quality dimension entry.
- **is_enabled (INT64)**: A flag indicating whether the quality dimension is currently active (1) or inactive (0).
- **weight (FLOAT64)**: A numerical value representing the importance or influence of this quality dimension in the overall evaluation process.
- **project_id (INT64)**: A foreign key linking the quality dimension to a specific project.
- **quality_dimension_id (INT64)**: An identifier for the type or category of the quality dimension.
- **prompt (STRING)**: The textual prompt used to guide reviewers in evaluating the quality dimension.
- **prompt_template (STRING)**: A template for generating prompts, if applicable.
- **reviewer_identity_prompt (STRING)**: A prompt for identifying the reviewer, if necessary.
- **temperature (FLOAT64)**: A parameter for controlling randomness in AI model responses, relevant if AI is used in evaluation.
- **llm_evaluator (STRING)**: The name of the large language model used for evaluation, if applicable.
- **datastream_metadata (STRUCT)**: Metadata containing a unique identifier and a timestamp related to data streaming.
- **current_quality_dimension_version_id (INT64)**: The version identifier for the current quality dimension configuration.
- **reviewer_type (STRING)**: Specifies whether the review is conducted manually or automatically.
- **model (STRING)**: The AI model used for evaluation, if applicable.
- **input_filters (JSON)**: JSON object defining filters applied to inputs before evaluation.
- **use_latest_quality_dimension_version (INT64)**: A flag indicating whether the latest version of the quality dimension is used (1) or not (0).
- **provider (STRING)**: The service provider for AI models or tools used in evaluation.
- **web_search_enabled (INT64)**: A flag indicating if web search capabilities are enabled (1) or not (0).
- **is_turn_level (INT64)**: Indicates if the evaluation is conducted at a turn level (1) or not (0).
- **description (STRING)**: A detailed description of the quality dimension's purpose and criteria.
- **code_execution_enabled (INT64)**: A flag indicating if code execution is enabled (1) or not (0).
- **name (STRING)**: The name of the quality dimension.
- **turn_summarizing_prompt (STRING)**: A prompt for summarizing conversation turns, if applicable.
- **star_rating_tooltip (JSON)**: JSON object containing tooltips for star rating systems.
- **system_prompt (STRING)**: A system-level prompt used during evaluation.
- **image_attach_enabled (INT64)**: A flag indicating if image attachments are enabled (1) or not (0).
- **review_display (JSON)**: JSON object defining how review options are displayed.
- **form_stages (JSON)**: JSON object detailing stages of a form used in evaluation.
- **audio_attach_enabled (INT64)**: A flag indicating if audio attachments are enabled (1) or not (0).
- **ac_agent_id (INT64)**: Identifier for an agent involved in the quality dimension process.
- **tools (STRING)**: Tools used in the evaluation process.
- **sort_order (INT64)**: The order in which quality dimensions are sorted or prioritized.
- **is_sequential (INT64)**: A flag indicating if evaluations are conducted sequentially (1) or not (0).
- **sequential_call_params (JSON)**: JSON object containing parameters for sequential evaluations.
- **negative_review_threshold (FLOAT64)**: The threshold for flagging negative reviews.
- **is_optional (INT64)**: Indicates if the quality dimension is optional (1) or mandatory (0).
- **type (STRING)**: The type or category of the quality dimension.

## Table Relationships
The `project_quality_dimension` table is likely related to other tables through the `project_id`, which connects it to a `project` table. This relationship allows for the organization of quality dimensions within specific projects. Additionally, `quality_dimension_id` may link to a `quality_dimension` table that defines various dimension types or categories. Common patterns in such databases might include relationships with `batch`, `conversation`, `review`, and `contributor` tables, where quality dimensions are applied to specific data sets, conversations, or reviewed by contributors.

## Key Insights
- The table supports both manual and automated evaluation processes, as indicated by columns like `reviewer_type` and `llm_evaluator`.
- The presence of AI-related columns (e.g., `model`, `temperature`) suggests integration with AI models for evaluation purposes.
- The table allows for extensive customization of evaluation criteria and processes, as seen in columns like `prompt`, `input_filters`, and `review_display`.
- The `weight` and `sort_order` columns indicate that quality dimensions can be prioritized or weighted differently, affecting their impact on overall project evaluations.
- The table supports multimedia attachments (image, audio) and code execution, indicating versatility in evaluation methods.

### Sample Data

See: [`project_quality_dimension_sample.json`](./project_quality_dimension_sample.json)

---

## project_statistics

**Row Count**: 42 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `project_id` | INT64 | YES |
| `total_conversations` | INT64 | YES |
| `draft` | INT64 | YES |
| `pending` | INT64 | YES |
| `labeling_approval` | INT64 | YES |
| `labeling` | INT64 | YES |
| `completed_approval` | INT64 | YES |
| `completed` | INT64 | YES |
| `validating` | INT64 | YES |
| `validated` | INT64 | YES |
| `rework` | INT64 | YES |
| `improper` | INT64 | YES |
| `delivered` | INT64 | YES |
| `rating_sum` | INT64 | YES |
| `rating_count` | INT64 | YES |
| `avg_rating` | NUMERIC(4, 2) | YES |
| `updated_at` | TIMESTAMP | YES |
| `claimed` | INT64 | YES |
| `reviewed` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Analysis: `project_statistics`

## Table Description
The `project_statistics` table stores aggregated metrics and status counts for various labeling and annotation projects. Each row corresponds to a specific project, identified by `project_id`, and provides detailed statistics on the progress and quality of the annotation work, including counts of conversations at different stages, ratings, and metadata.

## Column Descriptions
- **project_id (INT64, nullable=YES):** Unique identifier for each project. This serves as the primary key for the table and is used to link to other project-related tables.
- **total_conversations (INT64, nullable=YES):** Total number of conversations or tasks associated with the project.
- **draft (INT64, nullable=YES):** Number of conversations in the draft stage, indicating initial setup or incomplete tasks.
- **pending (INT64, nullable=YES):** Number of conversations awaiting action or review, indicating tasks that are queued for processing.
- **labeling_approval (INT64, nullable=YES):** Number of conversations awaiting approval after labeling, indicating tasks that have been labeled but not yet approved.
- **labeling (INT64, nullable=YES):** Number of conversations currently being labeled, indicating active annotation work.
- **completed_approval (INT64, nullable=YES):** Number of conversations awaiting approval after completion, indicating tasks that are finished but pending final approval.
- **completed (INT64, nullable=YES):** Number of conversations that have been fully completed, indicating tasks that have passed all stages of the workflow.
- **validating (INT64, nullable=YES):** Number of conversations in the validation stage, indicating tasks under quality check.
- **validated (INT64, nullable=YES):** Number of conversations that have been validated, indicating tasks that have passed quality checks.
- **rework (INT64, nullable=YES):** Number of conversations sent back for rework, indicating tasks that require revisions.
- **improper (INT64, nullable=YES):** Number of conversations marked as improper, indicating tasks that are not suitable for labeling.
- **delivered (INT64, nullable=YES):** Number of conversations that have been delivered to the client or end-user, indicating tasks that are finalized and handed over.
- **rating_sum (INT64, nullable=YES):** Sum of ratings given to the project, used to calculate the average rating.
- **rating_count (INT64, nullable=YES):** Total number of ratings received for the project, used to calculate the average rating.
- **avg_rating (NUMERIC(4, 2), nullable=YES):** Average rating of the project, calculated as `rating_sum` divided by `rating_count`.
- **updated_at (TIMESTAMP, nullable=YES):** Timestamp of the last update to the project statistics, indicating the freshness of the data.
- **claimed (INT64, nullable=YES):** Number of conversations claimed by contributors, indicating tasks that have been assigned.
- **reviewed (INT64, nullable=YES):** Number of conversations that have been reviewed, indicating tasks that have undergone a quality check.
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** Metadata about the data stream, including a unique identifier (`uuid`) and a timestamp (`source_timestamp`) for tracking data provenance.

## Table Relationships
- **Projects:** The `project_id` serves as a foreign key linking this table to a `projects` table, which would contain more detailed information about each project.
- **Conversations:** The various status columns (e.g., `pending`, `completed`) suggest a relationship with a `conversations` or `tasks` table, detailing individual tasks within each project.
- **Contributors:** The `claimed` and `reviewed` columns imply a connection to a `contributors` table, which would track who is working on or reviewing each task.
- **Reviews:** The `rating_sum`, `rating_count`, and `avg_rating` columns indicate a relationship with a `reviews` table, capturing feedback and quality assessments.

## Key Insights
- The table provides a comprehensive overview of project progress and quality, allowing for monitoring and management of annotation workflows.
- The presence of various status columns helps in identifying bottlenecks or stages where tasks are accumulating, which can inform process improvements.
- The rating-related columns offer insights into the perceived quality of the work, which can be used to assess contributor performance or project satisfaction.
- The `updated_at` and `datastream_metadata` columns ensure data integrity and traceability, which are crucial for maintaining accurate and reliable project statistics.

### Sample Data

See: [`project_statistics_sample.json`](./project_statistics_sample.json)

---

## quality_dimension

**Row Count**: 160 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `name` | STRING | YES |
| `system_name` | STRING | YES |
| `description` | STRING | YES |
| `prompt` | STRING | YES |
| `weight` | FLOAT64 | YES |
| `mode` | STRING | YES |
| `role` | STRING | YES |
| `reviewer_type` | STRING | YES |
| `prompt_template` | STRING | YES |
| `reviewer_identity_prompt` | STRING | YES |
| `temperature` | FLOAT64 | YES |
| `llm_evaluator` | STRING | YES |
| `project_type` | STRING | YES |
| `checked_part` | STRING | YES |
| `quality_guidelines` | STRING | YES |
| `quality_evaluation_rules` | STRING | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |
| `review_display` | JSON | YES |
| `feedback_display_pref` | STRING | YES |
| `model` | STRING | YES |
| `input_filters` | JSON | YES |
| `is_turn_level` | INT64 | YES |
| `provider` | STRING | YES |
| `star_rating_tooltip` | JSON | YES |

### AI Analysis

# Table Analysis: `quality_dimension`

## Table Description
The `quality_dimension` table stores metadata and configuration details for various quality evaluation dimensions used in a labeling/annotation tool. Each row represents a specific quality dimension, detailing how tasks are evaluated based on predefined criteria, guidelines, and rules. This table is essential for managing and standardizing the quality assessment process across different projects and evaluation modes.

## Column Descriptions
- **created_at (DATETIME)**: The timestamp when the quality dimension entry was created.
- **updated_at (DATETIME)**: The timestamp when the quality dimension entry was last updated.
- **id (INT64)**: A unique identifier for each quality dimension.
- **name (STRING)**: The human-readable name of the quality dimension.
- **system_name (STRING)**: A system-generated identifier for the quality dimension, often used for internal referencing.
- **description (STRING)**: A detailed explanation of the quality dimension, including its purpose and application.
- **prompt (STRING)**: The specific prompt associated with the quality dimension, if applicable.
- **weight (FLOAT64)**: A numerical value indicating the importance or influence of this dimension in the overall evaluation process.
- **mode (STRING)**: Specifies the mode of evaluation, such as "opt-in" or "mandatory".
- **role (STRING)**: Indicates the roles involved in the evaluation, such as "both" for both human and machine involvement.
- **reviewer_type (STRING)**: Describes the type of reviewer, e.g., "manual" for human reviewers.
- **prompt_template (STRING)**: A template for prompts used in evaluations, if applicable.
- **reviewer_identity_prompt (STRING)**: A prompt to identify the reviewer, if applicable.
- **temperature (FLOAT64)**: A parameter used in machine learning models to control randomness in evaluations.
- **llm_evaluator (STRING)**: The specific large language model evaluator used for this dimension.
- **project_type (STRING)**: The type of project this dimension is associated with, such as "sft" (supervised fine-tuning).
- **checked_part (STRING)**: Specifies which part of the task is checked, if applicable.
- **quality_guidelines (STRING)**: Guidelines that define the quality standards for this dimension.
- **quality_evaluation_rules (STRING)**: Rules that govern how quality is evaluated for this dimension.
- **datastream_metadata (STRUCT)**: Contains metadata about the data stream, including a unique identifier and source timestamp.
- **review_display (JSON)**: Configuration for how review options are displayed, including available options and display type.
- **feedback_display_pref (STRING)**: Preference for how feedback is displayed, such as "whole-conversation".
- **model (STRING)**: The specific model associated with this dimension, if applicable.
- **input_filters (JSON)**: Filters applied to input data for this dimension.
- **is_turn_level (INT64)**: Indicates if the evaluation is at the turn level (1 for true, 0 for false).
- **provider (STRING)**: The provider of the evaluation service or tool.
- **star_rating_tooltip (JSON)**: Tooltip information for star ratings, if applicable.

## Table Relationships
The `quality_dimension` table likely relates to other tables in the database through common patterns such as projects, batches, conversations, reviews, and contributors. For example, it may be linked to a `project` table via the `project_type` column, indicating which projects utilize specific quality dimensions. Similarly, it could relate to a `review` table through the `reviewer_type` and `review_display` columns, detailing how reviews are conducted and displayed.

## Key Insights
- The table provides a structured approach to managing quality dimensions, ensuring consistency in how tasks are evaluated across different projects.
- The presence of both `manual` and `llm_evaluator` types indicates a hybrid approach to evaluation, combining human judgment with machine learning models.
- The `weight` column allows for flexible prioritization of different quality dimensions, which can be crucial for projects with varying quality requirements.
- The use of JSON and STRUCT data types for columns like `review_display` and `datastream_metadata` suggests a need for complex data structures to capture detailed configuration and metadata.

### Sample Data

See: [`quality_dimension_sample.json`](./quality_dimension_sample.json)

---

## review

**Row Count**: 24,454 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `status` | STRING | YES |
| `score` | FLOAT64 | YES |
| `feedback` | STRING | YES |
| `followup_required` | INT64 | YES |
| `duration_minutes` | INT64 | YES |
| `submitted_at` | DATETIME | YES |
| `reviewer_id` | INT64 | YES |
| `conversation_version_id` | INT64 | YES |
| `conversation_id` | INT64 | YES |
| `review_type` | STRING | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |
| `reflected_score` | FLOAT64 | YES |
| `review_action` | JSON | YES |
| `additional_data` | JSON | YES |
| `run_id` | INT64 | YES |
| `audit` | INT64 | YES |
| `is_auto_review_seen` | INT64 | YES |

### AI Analysis

# Review Table Documentation

## Table Description
The `review` table stores data related to the evaluation of conversations within a labeling/annotation tool. Each row represents a distinct review instance, capturing details about the review process, including its status, scoring, and feedback. This table is essential for tracking the quality and effectiveness of conversations, whether reviewed manually or automatically.

## Column Descriptions

- **created_at (DATETIME, nullable=YES)**: The timestamp when the review record was created, indicating the initiation of the review process.
- **updated_at (DATETIME, nullable=YES)**: The timestamp of the last update to the review record, reflecting any changes or finalization of the review.
- **id (INT64, nullable=YES)**: A unique identifier for each review record, serving as the primary key.
- **status (STRING, nullable=YES)**: The current state of the review, such as 'draft' or 'published', indicating whether the review is finalized or still in progress.
- **score (FLOAT64, nullable=YES)**: The numerical evaluation of the conversation, representing the quality or performance level.
- **feedback (STRING, nullable=YES)**: Detailed comments or observations provided by the reviewer, offering insights into the review outcome.
- **followup_required (INT64, nullable=YES)**: A flag indicating whether further action is needed post-review (0 for no, 1 for yes).
- **duration_minutes (INT64, nullable=YES)**: The time spent on the review process, measured in minutes.
- **submitted_at (DATETIME, nullable=YES)**: The timestamp when the review was submitted, marking the completion of the review process.
- **reviewer_id (INT64, nullable=YES)**: The identifier of the reviewer who conducted the review, linking to a contributor or user table.
- **conversation_version_id (INT64, nullable=YES)**: The version identifier of the conversation being reviewed, allowing tracking of changes over time.
- **conversation_id (INT64, nullable=YES)**: The identifier of the conversation that is the subject of the review, linking to a conversation table.
- **review_type (STRING, nullable=YES)**: Specifies whether the review was conducted manually or automatically, aiding in process differentiation.
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES)**: Metadata related to the data stream, including a unique identifier and a timestamp of the source data.
- **reflected_score (FLOAT64, nullable=YES)**: An additional score reflecting secondary evaluation criteria or adjustments.
- **review_action (JSON, nullable=YES)**: JSON object detailing any actions taken during the review, such as corrections or annotations.
- **additional_data (JSON, nullable=YES)**: JSON object containing supplementary information relevant to the review process.
- **run_id (INT64, nullable=YES)**: Identifier for the specific run or batch of reviews, linking to a batch or project table.
- **audit (INT64, nullable=YES)**: A flag indicating whether the review has undergone an audit process (0 for no, 1 for yes).
- **is_auto_review_seen (INT64, nullable=YES)**: A flag indicating if an automatically generated review has been viewed by a human (0 for no, 1 for yes).

## Table Relationships
- **Project/Batches**: The `run_id` can be used to associate reviews with specific project runs or batches, facilitating batch processing and analysis.
- **Conversations**: The `conversation_id` and `conversation_version_id` link reviews to specific conversations, allowing for detailed tracking and analysis of conversation quality over time.
- **Contributors**: The `reviewer_id` connects reviews to specific contributors or reviewers, enabling performance tracking and accountability.
- **Review Types**: The `review_type` differentiates between manual and automated reviews, which may relate to different processing workflows or tables.

## Key Insights
- The table captures both manual and automated reviews, providing flexibility in evaluation processes.
- The presence of both `score` and `reflected_score` allows for nuanced assessment, potentially accommodating multiple evaluation criteria.
- The `feedback` column provides qualitative insights that can complement quantitative scores, offering a comprehensive view of review outcomes.
- The use of JSON fields for `review_action` and `additional_data` allows for extensibility and storage of complex, structured information related to the review process.

### Sample Data

See: [`review_sample.json`](./review_sample.json)

---

## review_message_feedback

**Row Count**: 120,003 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `feedback` | STRING | YES |
| `review_id` | INT64 | YES |
| `conversation_message_id` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Documentation: `review_message_feedback`

## Table Description
The `review_message_feedback` table stores feedback data related to messages within a conversation that have undergone a review process. Each entry in the table corresponds to a specific feedback instance linked to a conversation message, capturing metadata about its creation and updates. This table is integral for tracking feedback on reviewed messages, potentially influencing future reviews or annotations.

## Column Descriptions

- **created_at (DATETIME, nullable=YES)**: The timestamp indicating when the feedback record was initially created. This helps in tracking the lifecycle and timing of feedback submissions.
  
- **updated_at (DATETIME, nullable=YES)**: The timestamp of the most recent update to the feedback record. This is useful for auditing changes and understanding the history of feedback modifications.

- **id (INT64, nullable=YES)**: A unique identifier for each feedback entry. This serves as the primary key for the table, ensuring each feedback record can be uniquely referenced.

- **feedback (STRING, nullable=YES)**: The actual feedback content provided for the conversation message. This field may be null, indicating that feedback has not yet been provided or recorded.

- **review_id (INT64, nullable=YES)**: A foreign key linking the feedback to a specific review. This establishes a relationship with the review process, allowing for aggregation and analysis of feedback by review.

- **conversation_message_id (INT64, nullable=YES)**: A foreign key that associates the feedback with a particular message within a conversation. This linkage is crucial for understanding which specific message the feedback pertains to.

- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES)**: A structured field containing metadata about the data stream. The `uuid` is a unique identifier for the data stream instance, and `source_timestamp` records the original timestamp from the data source, aiding in data lineage and traceability.

## Table Relationships
- **Review**: The `review_id` column links to a `review` table, where each review encompasses multiple feedback entries. This relationship allows for comprehensive analysis of feedback within the context of a review process.
  
- **Conversation**: The `conversation_message_id` connects to a `conversation` or `conversation_message` table, associating feedback with specific messages. This linkage is essential for understanding feedback in the context of conversation flows.

- **Contributor**: While not directly referenced, contributors who provide feedback may be tracked in a separate table, potentially linked through the `review_id` or other identifiers.

## Key Insights
- The presence of null values in the `feedback` column suggests that not all messages receive feedback, which could indicate areas where feedback processes need enhancement or where feedback is not deemed necessary.
  
- The consistent timestamps in `created_at` and `updated_at` across sample rows suggest batch processing or automated feedback entry, indicating a systematic approach to feedback collection.

- The `datastream_metadata` provides valuable context for data provenance, ensuring that feedback records can be traced back to their original data sources, which is crucial for data integrity and audit trails.

This table is a critical component of a labeling/annotation tool's database, enabling detailed tracking and analysis of feedback on reviewed conversation messages, ultimately contributing to improved data quality and review processes.

### Sample Data

See: [`review_message_feedback_sample.json`](./review_message_feedback_sample.json)

---

## review_quality_dimension_value

**Row Count**: 132,033 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `score` | FLOAT64 | YES |
| `weight` | FLOAT64 | YES |
| `feedback` | STRING | YES |
| `review_id` | INT64 | YES |
| `quality_dimension_id` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |
| `whole_conversation_feedback` | INT64 | YES |
| `raw_feedback` | STRING | YES |
| `score_text` | STRING | YES |
| `current_quality_dimension_version_id` | INT64 | YES |
| `agent_execution_uuid` | STRING | YES |
| `project_quality_dimension_id` | INT64 | YES |
| `trainer_feedback` | JSON | YES |
| `is_golden` | INT64 | YES |

### AI Analysis

# Table Analysis: `review_quality_dimension_value`

## Table Description
The `review_quality_dimension_value` table stores detailed evaluations of quality dimensions associated with reviews conducted in a labeling/annotation tool. Each row represents a specific quality dimension assessment for a given review, capturing scores, feedback, and metadata related to the evaluation process. This table is crucial for tracking the quality and compliance of annotations across various projects.

## Column Descriptions

- **created_at (DATETIME, nullable=YES):** The timestamp when the record was created, indicating when the quality dimension evaluation was initially logged.
- **updated_at (DATETIME, nullable=YES):** The timestamp of the last update to the record, useful for tracking changes or updates to the evaluation.
- **id (INT64, nullable=YES):** A unique identifier for each quality dimension evaluation record, serving as the primary key for the table.
- **score (FLOAT64, nullable=YES):** The numerical score assigned to the quality dimension, reflecting the evaluation's outcome (e.g., pass/fail).
- **weight (FLOAT64, nullable=YES):** The weight of the score, which may be used to calculate weighted averages or prioritize certain dimensions.
- **feedback (STRING, nullable=YES):** A detailed textual feedback on the evaluation, providing insights into specific criteria and issues identified during the review.
- **review_id (INT64, nullable=YES):** A foreign key linking to the `review` table, associating the quality dimension evaluation with a specific review.
- **quality_dimension_id (INT64, nullable=YES):** A foreign key referencing the `quality_dimension` table, identifying which quality dimension is being evaluated.
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** Metadata about the data stream, including a unique identifier and a timestamp for the source data, aiding in traceability and audit trails.
- **whole_conversation_feedback (INT64, nullable=YES):** An indicator of whether feedback pertains to the entire conversation, likely a boolean represented as an integer.
- **raw_feedback (STRING, nullable=YES):** The unprocessed feedback text, potentially used for further analysis or processing.
- **score_text (STRING, nullable=YES):** A textual representation of the score, such as "Pass" or "Fail", providing a human-readable summary of the evaluation.
- **current_quality_dimension_version_id (INT64, nullable=YES):** References the version of the quality dimension, allowing for version control and historical comparisons.
- **agent_execution_uuid (STRING, nullable=YES):** A unique identifier for the agent execution that performed the evaluation, useful for tracking and debugging.
- **project_quality_dimension_id (INT64, nullable=YES):** Links to a specific project quality dimension, indicating the context or scope of the evaluation.
- **trainer_feedback (JSON, nullable=YES):** Stores additional feedback from trainers in JSON format, potentially used for training or quality improvement purposes.
- **is_golden (INT64, nullable=YES):** Indicates whether the evaluation is a "golden" standard, likely a boolean represented as an integer, used for benchmarking or quality assurance.

## Table Relationships
- **Review Table:** The `review_id` column links this table to the `review` table, associating each quality dimension evaluation with a specific review.
- **Quality Dimension Table:** The `quality_dimension_id` column connects to the `quality_dimension` table, identifying the specific dimension being evaluated.
- **Project Table:** The `project_quality_dimension_id` may relate to a project table, indicating the project context for the evaluation.
- **Version Control:** The `current_quality_dimension_version_id` helps manage different versions of quality dimensions, supporting historical data analysis and version tracking.

## Key Insights
- The table captures detailed feedback and scores for various quality dimensions, which can be used to assess and improve the quality of annotations.
- The presence of metadata and versioning information supports robust traceability and audit capabilities, essential for maintaining high standards in labeling processes.
- The `is_golden` flag can be leveraged to identify benchmark evaluations, which are critical for training and ensuring consistent quality across projects.
- The integration of structured and unstructured feedback allows for comprehensive analysis, combining quantitative scores with qualitative insights.

### Sample Data

See: [`review_quality_dimension_value_sample.json`](./review_quality_dimension_value_sample.json)

---

## review_urgency

**Row Count**: 7,940 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `urgency_score` | FLOAT64 | YES |
| `conversation_id` | INT64 | YES |
| `review_id` | INT64 | YES |
| `last_manual_review_id` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Documentation: `review_urgency`

## Table Description
The `review_urgency` table is designed to store information about the urgency of reviews associated with conversations in a labeling or annotation tool database. Each entry in the table represents a specific review instance, capturing its urgency score and metadata related to the conversation and review process. This table is essential for prioritizing reviews based on urgency, potentially aiding in workflow optimization and resource allocation.

## Column Descriptions

- **created_at (DATETIME, nullable=YES):** The timestamp indicating when the record was created. This helps track the entry's lifecycle and can be used for auditing purposes.

- **updated_at (DATETIME, nullable=YES):** The timestamp of the last update to the record. It is useful for understanding the most recent changes and maintaining data integrity over time.

- **id (INT64, nullable=YES):** A unique identifier for each record in the table. This serves as the primary key for the table, ensuring each entry can be distinctly referenced.

- **urgency_score (FLOAT64, nullable=YES):** A numerical value representing the urgency level of the review. This score is likely used to prioritize reviews, with higher scores indicating more urgent cases.

- **conversation_id (INT64, nullable=YES):** A foreign key linking to a specific conversation. This association allows the table to relate urgency scores to particular conversations, facilitating targeted review processes.

- **review_id (INT64, nullable=YES):** A foreign key that may link to a detailed review record in another table. This column is often null, indicating that not all urgency records are directly tied to a specific review entry.

- **last_manual_review_id (INT64, nullable=YES):** A reference to the last manual review performed, possibly linking to another table that logs manual review actions. This helps track manual interventions in the review process.

- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** A structured field containing metadata about the data stream, including a unique identifier (`uuid`) and a timestamp (`source_timestamp`). This metadata is crucial for tracing the origin and timing of the data entry, supporting data lineage and integrity.

## Table Relationships

The `review_urgency` table is likely related to several other tables within the database:

- **Conversations Table:** The `conversation_id` serves as a foreign key, linking urgency scores to specific conversations. This relationship is crucial for contextualizing the urgency within the broader scope of conversation management.

- **Reviews Table:** The `review_id` and `last_manual_review_id` columns suggest potential links to a reviews table, which would store detailed information about each review process. These relationships help track the review lifecycle and manual interventions.

## Key Insights

- The presence of `urgency_score` indicates a mechanism for prioritizing reviews, which can be critical for efficient resource allocation and workflow management.

- The frequent null values in `review_id` suggest that not all urgency records are tied to a specific review, possibly indicating preliminary or automated urgency assessments.

- The `datastream_metadata` provides essential information for tracing data origins, which is valuable for auditing and ensuring data quality.

- The table's structure supports integration with other key components of the labeling/annotation tool, such as conversations and reviews, highlighting its role in a comprehensive data management system.

### Sample Data

See: [`review_urgency_sample.json`](./review_urgency_sample.json)

---

## reviewer_ranking

**Row Count**: 35 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `rank` | INT64 | YES |
| `score` | FLOAT64 | YES |
| `project_id` | INT64 | YES |
| `reviewer_id` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Analysis: `reviewer_ranking`

## Description
The `reviewer_ranking` table stores information about the ranking and performance scores of reviewers within specific projects in a labeling/annotation tool database. Each entry in the table corresponds to a unique reviewer associated with a project, capturing their rank and score, along with metadata about the data stream from which the ranking information was sourced.

## Column Descriptions

- **created_at (DATETIME, nullable=YES):** The timestamp when the ranking record was initially created. This helps track the inception of the ranking data.
  
- **updated_at (DATETIME, nullable=YES):** The timestamp of the most recent update to the ranking record. This is crucial for understanding the recency of the data and any changes made over time.
  
- **id (INT64, nullable=YES):** A unique identifier for each ranking record. This serves as the primary key for the table, ensuring each entry is distinct.
  
- **rank (INT64, nullable=YES):** The rank assigned to the reviewer within the context of a specific project. This indicates the relative performance or contribution level of the reviewer compared to others.
  
- **score (FLOAT64, nullable=YES):** A numerical score representing the performance or quality of the reviewer's work. This score can be used for quantitative analysis of reviewer effectiveness.
  
- **project_id (INT64, nullable=YES):** A foreign key linking the ranking record to a specific project. This establishes a relationship between the reviewer and the project they are contributing to.
  
- **reviewer_id (INT64, nullable=YES):** A foreign key identifying the reviewer. This links the ranking data to the individual reviewer, allowing for cross-referencing with other reviewer-related data.
  
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** A structured field containing metadata about the data stream. The `uuid` is a unique identifier for the data stream, and `source_timestamp` records the time when the data was sourced, aiding in data lineage and traceability.

## Table Relationships

- **Project Relationship:** The `project_id` column connects this table to a `projects` table, which would hold details about each project. This relationship is essential for aggregating reviewer performance data at the project level.
  
- **Reviewer Relationship:** The `reviewer_id` column links to a `reviewers` or `contributors` table, where individual reviewer details are stored. This allows for comprehensive profiling of reviewers across different projects.
  
- **Potential Batch/Conversation/Review Relationships:** Although not explicitly detailed, the table could relate to `batch`, `conversation`, or `review` tables through indirect associations, such as project or reviewer activities within those contexts.

## Key Insights

- **Performance Tracking:** The table provides a mechanism to track and evaluate reviewer performance over time, using both rank and score metrics.
  
- **Data Freshness and Updates:** The presence of `created_at` and `updated_at` timestamps allows for monitoring data freshness and understanding the dynamics of reviewer ranking changes.
  
- **Data Lineage:** The `datastream_metadata` field ensures that each ranking entry can be traced back to its data source, supporting data integrity and auditability.
  
- **Project-Specific Analysis:** By linking rankings to specific projects, the table facilitates project-level analysis of reviewer performance, which can inform project management and resource allocation decisions.

### Sample Data

See: [`reviewer_ranking_sample.json`](./reviewer_ranking_sample.json)

---

## role

**Row Count**: 6 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `name` | STRING | YES |
| `description` | STRING | YES |
| `is_active` | INT64 | YES |
| `is_default` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |
| `home_route` | STRING | YES |
| `parent_id` | INT64 | YES |
| `is_built_in` | INT64 | YES |
| `login_route` | STRING | YES |

### AI Analysis

# Table Analysis: `role`

## Table Description
The `role` table stores information about various roles within a labeling/annotation tool system. Each role represents a distinct set of permissions and responsibilities that can be assigned to users within the system. The table captures both system-defined roles and custom roles created by users, providing metadata and configuration details for each role.

## Column Descriptions

- **created_at (DATETIME, nullable=YES):** The timestamp indicating when the role was created. Useful for tracking the lifecycle of a role.
  
- **updated_at (DATETIME, nullable=YES):** The timestamp of the last update made to the role, indicating changes in role attributes or metadata.
  
- **id (INT64, nullable=YES):** A unique identifier for each role, serving as the primary key for the table.
  
- **name (STRING, nullable=YES):** The name of the role, providing a human-readable identifier for the role's purpose or function.
  
- **description (STRING, nullable=YES):** A detailed description of the role, explaining its responsibilities and usage within the system.
  
- **is_active (INT64, nullable=YES):** A flag indicating whether the role is currently active (1) or inactive (0), determining its availability for assignment.
  
- **is_default (INT64, nullable=YES):** A flag indicating if the role is a default role (1) within the system, which may be automatically assigned to new users.
  
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** Metadata related to data streaming, including a unique identifier (`uuid`) and a timestamp (`source_timestamp`) for tracking data changes or synchronization.
  
- **home_route (STRING, nullable=YES):** The default route or URL path that users with this role are directed to upon login, which can be customized per role.
  
- **parent_id (INT64, nullable=YES):** A reference to another role's `id`, indicating a hierarchical relationship or inheritance from a parent role.
  
- **is_built_in (INT64, nullable=YES):** A flag indicating if the role is built into the system (1) as opposed to being user-defined (0), which affects its modifiability.
  
- **login_route (STRING, nullable=YES):** The specific login route or URL path for users with this role, which may include dynamic parameters for redirection.

## Table Relationships
The `role` table is likely related to other tables in the database through common patterns such as projects, batches, conversations, reviews, and contributors. Roles may be assigned to contributors or users, defining their permissions and access levels within projects or tasks. The `parent_id` column suggests a hierarchical structure, where roles can inherit properties from parent roles, potentially linking to a broader role management system.

## Key Insights

- The table supports both system-defined and custom roles, allowing flexibility in user management.
- The presence of `parent_id` indicates a role hierarchy, enabling complex permission structures.
- The `is_active` and `is_default` flags provide mechanisms for managing role availability and default assignments.
- The `datastream_metadata` column suggests integration with data streaming or synchronization processes, which may be crucial for real-time updates across distributed systems.
- Customizable `home_route` and `login_route` allow for tailored user experiences based on role assignments, enhancing user navigation and workflow efficiency.

### Sample Data

See: [`role_sample.json`](./role_sample.json)

---

## role_permissions

**Row Count**: 504 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `role_id` | INT64 | YES |
| `permission_id` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |
| `action` | STRING | YES |

### AI Analysis

# Table Analysis: `role_permissions`

## Table Description
The `role_permissions` table stores the mapping of roles to their respective permissions within a labeling/annotation tool database. Each entry in the table represents a specific permission granted or denied to a role, along with metadata about the data stream that recorded this permission. This table is crucial for managing access control and ensuring that users have the appropriate permissions for their roles.

## Column Descriptions

- **role_id (INT64, nullable=YES):** This column represents the unique identifier for a role within the system. It is used to associate specific permissions with a particular role.
  
- **permission_id (INT64, nullable=YES):** This column denotes the unique identifier for a permission. Each permission_id corresponds to a specific action or set of actions that can be performed by a role.

- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** This column contains metadata related to the data stream that recorded the role-permission mapping. 
  - **uuid (STRING):** A universally unique identifier for the data stream entry, ensuring traceability and uniqueness.
  - **source_timestamp (INT64):** A timestamp indicating when the data stream entry was recorded, stored as an integer representing milliseconds since the Unix epoch.

- **action (STRING, nullable=YES):** This column specifies the action associated with the permission, such as "allow" or "deny". It indicates whether the role is permitted or restricted from performing the action linked to the permission_id.

## Table Relationships

The `role_permissions` table is likely related to other tables in the database through the following common patterns:

- **Project:** Roles may be assigned within the context of specific projects, indicating that there might be a `projects` table where roles are defined per project.
  
- **Batch:** Permissions might be batch-specific, suggesting a potential relationship with a `batches` table that organizes tasks or data into batches.

- **Conversation:** If the tool involves annotating conversations, there could be a `conversations` table where permissions are set for roles interacting with conversation data.

- **Review:** Roles might have permissions related to reviewing annotations, linking this table to a `reviews` table.

- **Contributor:** The `role_permissions` table could be related to a `contributors` table, where individuals are assigned roles that determine their permissions.

## Key Insights

- The `role_permissions` table is central to the access control mechanism of the labeling/annotation tool, ensuring that roles are appropriately granted or restricted permissions.
  
- The presence of `datastream_metadata` indicates a focus on traceability and auditing, allowing for detailed tracking of when and how permissions are assigned or modified.

- The uniformity of the `action` column in the sample data ("allow") suggests that the current dataset primarily records permissions granted rather than denied, though the schema supports both actions.

- The table's design supports scalability and flexibility, allowing for the addition of new roles and permissions as the system evolves.

### Sample Data

See: [`role_permissions_sample.json`](./role_permissions_sample.json)

---

## role_permissions_history

**Row Count**: 42 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `old_value` | STRING | YES |
| `new_value` | STRING | YES |
| `comment` | STRING | YES |
| `role_id` | INT64 | YES |
| `permission_id` | INT64 | YES |
| `author_id` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Analysis: `role_permissions_history`

## Table Description
The `role_permissions_history` table stores historical records of changes made to role permissions within a labeling/annotation tool. Each entry logs a specific change in permission status for a role, capturing both the previous and new values, along with metadata about the change event such as timestamps and author information. This table is crucial for auditing and tracking permission modifications over time.

## Column Descriptions

- **created_at (DATETIME, nullable=YES):** The timestamp when the record was created, indicating when the permission change was logged.
- **updated_at (DATETIME, nullable=YES):** The timestamp of the last update to the record, which in this context is typically the same as `created_at` since each change is logged as a new record.
- **id (INT64, nullable=YES):** A unique identifier for each change record, serving as the primary key for the table.
- **old_value (STRING, nullable=YES):** The previous state of the permission before the change (e.g., "unset", "deny", "allow").
- **new_value (STRING, nullable=YES):** The new state of the permission after the change.
- **comment (STRING, nullable=YES):** An optional field for additional context or rationale for the change, provided by the author.
- **role_id (INT64, nullable=YES):** A foreign key referencing the role whose permission is being changed, linking to a roles table.
- **permission_id (INT64, nullable=YES):** A foreign key referencing the specific permission being altered, linking to a permissions table.
- **author_id (INT64, nullable=YES):** A foreign key identifying the user who made the change, linking to a users or contributors table.
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** Metadata about the data stream, including a unique identifier (`uuid`) for the change event and a `source_timestamp` indicating when the change was sourced.

## Table Relationships
- **Roles Table:** The `role_id` column links to a roles table, which defines the various roles available within the system.
- **Permissions Table:** The `permission_id` column connects to a permissions table, detailing the different permissions that can be assigned to roles.
- **Users/Contributors Table:** The `author_id` column associates with a users or contributors table, identifying who made the permission change.

## Key Insights
- The table provides a detailed audit trail of permission changes, which is essential for compliance and security auditing.
- The presence of both `old_value` and `new_value` allows for easy comparison and understanding of how permissions have evolved over time.
- The `comment` field, although optional, can provide valuable insights into the reasoning behind permission changes, aiding in understanding the context of changes.
- The `datastream_metadata` offers additional traceability, particularly useful in distributed systems where changes might originate from different sources or at different times.

### Sample Data

See: [`role_permissions_history_sample.json`](./role_permissions_history_sample.json)

---

## skill

**Row Count**: 784 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `name` | STRING | YES |
| `description` | STRING | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Analysis: `skill`

## Table Description
The `skill` table is designed to store information about various skills that are relevant to a labeling or annotation tool. Each entry in the table represents a unique skill that may be required or utilized within the context of a project or task. This table helps in categorizing and managing the different types of expertise needed for specific annotation tasks.

## Column Descriptions

- **created_at (DATETIME, nullable=YES):** This column records the date and time when the skill entry was initially created in the database. It is useful for tracking the creation timeline of skills.

- **updated_at (DATETIME, nullable=YES):** This column indicates the date and time when the skill entry was last modified. It helps in maintaining the version history of each skill.

- **id (INT64, nullable=YES):** A unique identifier for each skill entry. This serves as the primary key for the table, allowing for easy referencing and linking to other tables.

- **name (STRING, nullable=YES):** The name of the skill. This is a descriptive label that provides a quick reference to the type of skill, such as "Harm-Content Moderation" or "Genetics-DNA Sequencing".

- **description (STRING, nullable=YES):** A detailed description of the skill. Although currently empty in the sample data, this field is intended to provide additional context or details about the skill.

- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** A structured field containing metadata about the data stream associated with the skill. The `uuid` is a unique identifier for the data stream, and `source_timestamp` records the time associated with the data source, likely in milliseconds since the epoch.

## Table Relationships
The `skill` table is likely related to other tables in the database through common patterns such as projects, batches, conversations, reviews, or contributors. Skills are typically linked to projects or tasks that require specific expertise, and thus, this table may be referenced by a project or task table to specify the skills needed for completion. Additionally, contributors or annotators may be associated with specific skills, indicating their qualifications or areas of expertise.

## Key Insights
- The `skill` table provides a structured way to manage and reference the diverse range of skills needed for various annotation tasks. This is crucial for ensuring that tasks are assigned to appropriately skilled contributors.
- The presence of `datastream_metadata` suggests that skills might be dynamically updated or linked to external data sources, allowing for real-time or historical tracking of skill relevance and usage.
- The uniformity of timestamps in the sample data indicates that these entries might have been batch-created or updated simultaneously, which could imply a recent overhaul or initialization of the skill set within the system.

### Sample Data

See: [`skill_sample.json`](./skill_sample.json)

---

## statistics_jobs

**Row Count**: 6,220 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `id` | INT64 | YES |
| `job_type` | STRING | YES |
| `project_id` | INT64 | YES |
| `contributor_id` | INT64 | YES |
| `status` | STRING | YES |
| `enqueue_time` | DATETIME | YES |
| `start_time` | TIMESTAMP | YES |
| `finish_time` | TIMESTAMP | YES |
| `error` | STRING | YES |
| `bull_job_id` | STRING | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Analysis: `statistics_jobs`

## Table Description
The `statistics_jobs` table records metadata and status information for various jobs processed within a labeling or annotation tool. Each row represents a unique job, detailing its type, associated project, processing times, and any errors encountered. This table is crucial for monitoring job execution and diagnosing issues in the job processing pipeline.

## Column Descriptions

- **id (INT64, nullable=YES):** A unique identifier for each job entry, serving as the primary key for the table.
- **job_type (STRING, nullable=YES):** Specifies the type of job being processed, such as 'project', indicating the context or category of the job.
- **project_id (INT64, nullable=YES):** References the specific project associated with the job, linking to a projects table to provide context about the job's scope.
- **contributor_id (INT64, nullable=YES):** Identifies the contributor responsible for the job, if applicable, linking to a contributors table for user-specific job tracking.
- **status (STRING, nullable=YES):** Indicates the current state of the job, such as 'success' or 'failed', providing insight into job completion and potential issues.
- **enqueue_time (DATETIME, nullable=YES):** The date and time when the job was queued for processing, useful for tracking job wait times.
- **start_time (TIMESTAMP, nullable=YES):** The exact timestamp when the job began processing, allowing for performance analysis.
- **finish_time (TIMESTAMP, nullable=YES):** The timestamp marking the completion of the job, used to calculate job duration.
- **error (STRING, nullable=YES):** Describes any errors encountered during job execution, aiding in troubleshooting and error resolution.
- **bull_job_id (STRING, nullable=YES):** An identifier for the job within the Bull queue system, used for tracking and managing job execution in the queue.
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** Contains metadata about the data stream, including a unique identifier (uuid) and a source timestamp, which can be used for data lineage and synchronization purposes.

## Table Relationships
- **Project:** The `project_id` column links this table to a projects table, associating each job with a specific project.
- **Contributor:** The `contributor_id` column, when not null, connects to a contributors table, identifying the user responsible for the job.
- **Batch/Conversation/Review:** While not directly referenced in the schema, jobs may be indirectly related to these entities through the `project_id` or `job_type`, depending on the broader database schema.

## Key Insights
- The table primarily tracks job execution times and statuses, providing a comprehensive view of the job processing pipeline's efficiency and reliability.
- The presence of `error` and `status` fields allows for quick identification of failed jobs and the reasons for failure, facilitating prompt troubleshooting.
- The `datastream_metadata` field suggests integration with external data sources or systems, highlighting the table's role in maintaining data integrity and synchronization.
- The timestamps (`enqueue_time`, `start_time`, `finish_time`) enable performance analysis, such as measuring average job duration and identifying bottlenecks in the job processing workflow.

### Sample Data

See: [`statistics_jobs_sample.json`](./statistics_jobs_sample.json)

---

## task_labeling_workflow

**Row Count**: 47,400 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `status` | STRING | YES |
| `workflow_version` | INT64 | YES |
| `workflow_configuration_snapshot` | JSON | YES |
| `current_workflow_status` | STRING | YES |
| `task_id` | INT64 | YES |
| `workflow_id` | INT64 | YES |
| `current_collaborator_id` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Analysis: `task_labeling_workflow`

## Table Description
The `task_labeling_workflow` table stores information about the workflow processes associated with labeling tasks within an annotation tool. It tracks the status, configuration, and progress of each task through various workflow stages, capturing details about the workflow version, current status, and the collaborators involved. This table is crucial for managing and monitoring the lifecycle of tasks as they move through different stages of labeling and review.

## Column Descriptions

- **created_at (DATETIME, nullable=YES):** The timestamp indicating when the workflow instance was created. This helps in tracking the initiation time of the workflow process.

- **updated_at (DATETIME, nullable=YES):** The timestamp of the most recent update to the workflow instance. It is useful for auditing and understanding the recency of changes in the workflow.

- **id (INT64, nullable=YES):** A unique identifier for each workflow instance. This serves as the primary key for the table, allowing for unique identification of each record.

- **status (STRING, nullable=YES):** The current status of the workflow (e.g., "completed", "in-progress"). This indicates the current state of the task within the workflow.

- **workflow_version (INT64, nullable=YES):** The version number of the workflow configuration being used. This is important for understanding the specific set of rules and processes applied to the task.

- **workflow_configuration_snapshot (JSON, nullable=YES):** A JSON snapshot of the workflow configuration at the time of task initiation. This includes details about task assignment, collaborator roles, and stages, providing a historical record of the workflow setup.

- **current_workflow_status (STRING, nullable=YES):** Describes the current operational status of the workflow, which may include detailed states beyond the general status.

- **task_id (INT64, nullable=YES):** A reference to the specific task associated with this workflow. This links the workflow to the task it is managing.

- **workflow_id (INT64, nullable=YES):** An identifier for the specific workflow template or process being followed. This allows for differentiation between different workflow processes.

- **current_collaborator_id (INT64, nullable=YES):** The ID of the collaborator currently responsible for the task. This helps in tracking who is actively working on or reviewing the task at any given time.

- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** Metadata related to the data stream, including a unique identifier and a timestamp from the data source. This is useful for tracing the origin and timing of data inputs.

## Table Relationships
This table is likely related to other tables in the database through common patterns such as:

- **Project:** The tasks and workflows may be part of larger projects, with a potential relationship to a `project` table that organizes tasks into projects.
  
- **Batch:** Tasks might be grouped into batches for processing, suggesting a link to a `batch` table.
  
- **Conversation:** If tasks involve collaborative discussions, there might be a relationship to a `conversation` table.
  
- **Review:** The workflow stages often include review processes, indicating a connection to a `review` table that tracks review activities.
  
- **Contributor:** Collaborators working on tasks are likely referenced in a `contributor` table, which maintains details about users involved in the workflow.

## Key Insights
- The table captures a comprehensive snapshot of the workflow configuration, allowing for detailed analysis of how tasks are processed and managed.
- The inclusion of versioning and configuration snapshots aids in understanding changes over time and supports rollback or audit requirements.
- The table's structure supports tracking of task progress and collaborator involvement, which is essential for workflow management and optimization.
- The metadata fields provide additional context for data provenance, which is critical for ensuring data integrity and traceability in labeling tasks.

### Sample Data

See: [`task_labeling_workflow_sample.json`](./task_labeling_workflow_sample.json)

---

## task_labeling_workflow_action_execution

**Row Count**: 350,513 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | STRING | YES |
| `status` | STRING | YES |
| `action` | STRING | YES |
| `execution_log` | JSON | YES |
| `success` | INT64 | YES |
| `result` | STRING | YES |
| `task_id` | INT64 | YES |
| `workflow_id` | INT64 | YES |
| `task_workflow_id` | INT64 | YES |
| `collaborator_id` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Documentation: `task_labeling_workflow_action_execution`

## Table Description
The `task_labeling_workflow_action_execution` table records the execution details of various actions within a task labeling workflow. It captures metadata about the execution process, including timestamps, status, and results, as well as detailed logs of the actions performed. This table is crucial for tracking the progress and outcomes of tasks within a labeling or annotation project, providing insights into workflow efficiency and effectiveness.

## Column Descriptions

- **created_at (DATETIME, nullable=YES)**: The timestamp indicating when the action execution record was created. Useful for tracking the initiation time of the workflow action.
  
- **updated_at (DATETIME, nullable=YES)**: The timestamp of the last update to the action execution record. It helps in understanding the duration and any modifications made during the execution process.
  
- **id (STRING, nullable=YES)**: A unique identifier for each action execution record. This serves as the primary key for identifying specific executions.
  
- **status (STRING, nullable=YES)**: The current status of the action execution (e.g., "completed"). It indicates the completion state or progress of the workflow action.
  
- **action (STRING, nullable=YES)**: The type of action being executed (e.g., "complete-review"). This specifies the nature of the task performed within the workflow.
  
- **execution_log (JSON, nullable=YES)**: A detailed log of the execution process, stored in JSON format. It includes information such as user inputs, decision-making criteria, and review notes, providing a comprehensive view of the action's execution.
  
- **success (INT64, nullable=YES)**: A flag indicating whether the action execution was successful (1 for success, 0 for failure). This is critical for assessing the outcome of the workflow action.
  
- **result (STRING, nullable=YES)**: A summary or description of the result of the action execution. It provides a quick reference to the outcome without delving into detailed logs.
  
- **task_id (INT64, nullable=YES)**: A reference to the task associated with the action execution. It links the execution record to a specific task within the project.
  
- **workflow_id (INT64, nullable=YES)**: Identifies the workflow to which the action belongs. This helps in organizing actions under specific workflows.
  
- **task_workflow_id (INT64, nullable=YES)**: A composite identifier linking the task and workflow, facilitating the association of actions with specific task workflows.
  
- **collaborator_id (INT64, nullable=YES)**: The identifier of the collaborator or user who executed the action. This is important for tracking contributions and accountability.
  
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES)**: Metadata related to the data stream, including a unique identifier and a timestamp. This provides context about the data source and timing.

## Table Relationships
This table is likely related to other tables in the database through common identifiers such as `task_id`, `workflow_id`, and `collaborator_id`. It may interact with:

- **Project Table**: To associate actions with specific projects.
- **Batch Table**: For grouping actions under specific batches of tasks.
- **Conversation Table**: If actions involve collaborative discussions or reviews.
- **Review Table**: To link actions with review processes or outcomes.
- **Contributor Table**: To identify and manage contributors involved in task executions.

## Key Insights
- The table provides a detailed audit trail of actions performed within task workflows, which is essential for quality assurance and process optimization.
- The `execution_log` column offers rich, structured data that can be analyzed to improve decision-making processes and identify bottlenecks or inefficiencies in the workflow.
- The success rate of actions can be evaluated using the `success` column, providing insights into the effectiveness of the workflow execution.
- By analyzing the `status` and `result` columns, stakeholders can quickly assess the overall progress and outcomes of tasks within the project.

### Sample Data

See: [`task_labeling_workflow_action_execution_sample.json`](./task_labeling_workflow_action_execution_sample.json)

---

## task_labeling_workflow_collaborator

**Row Count**: 140,306 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `role` | STRING | YES |
| `metadata` | JSON | YES |
| `task_workflow_id` | INT64 | YES |
| `collaborator_id` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |
| `duration_minutes` | INT64 | YES |

### AI Analysis

# Table Documentation: `task_labeling_workflow_collaborator`

## Table Description
The `task_labeling_workflow_collaborator` table stores information about collaborators involved in various task labeling workflows within an annotation tool. Each entry in the table represents a specific collaborator's role and participation details in a particular task workflow, including timestamps and metadata related to their activities.

## Column Descriptions

- **created_at (DATETIME, nullable=YES):** The timestamp indicating when the record was initially created in the database. This helps track the entry's lifecycle and can be used for auditing purposes.

- **updated_at (DATETIME, nullable=YES):** The timestamp indicating the last time the record was updated. This is useful for tracking changes and ensuring data consistency over time.

- **id (INT64, nullable=YES):** A unique identifier for each record in the table. This serves as the primary key for the table, allowing for efficient querying and referencing of specific entries.

- **role (STRING, nullable=YES):** The role of the collaborator within the task workflow, such as "reviewer" or potentially other roles like "annotator" or "validator." This defines the responsibilities and permissions of the collaborator in the workflow.

- **metadata (JSON, nullable=YES):** A JSON object that can store additional information about the collaborator's involvement in the workflow. This could include custom attributes or settings specific to the task.

- **task_workflow_id (INT64, nullable=YES):** A foreign key linking to the task workflow that the collaborator is associated with. This connects the collaborator to the specific workflow they are working on.

- **collaborator_id (INT64, nullable=YES):** A foreign key referencing the collaborator, likely linking to a separate table that contains detailed information about the individual, such as their name, contact information, and other personal details.

- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** A structured field containing metadata about the data stream, including a unique identifier (`uuid`) and a `source_timestamp` indicating when the data was sourced. This is useful for tracking data provenance and ensuring data integrity.

- **duration_minutes (INT64, nullable=YES):** The duration, in minutes, that the collaborator spent on the task. This can be used for performance analysis and workload management.

## Table Relationships
This table is likely related to several other tables in the database:

- **Projects:** The `task_workflow_id` may link to a project table that defines the broader context of the task workflows.
- **Batches:** If tasks are grouped into batches, this table might indirectly relate to a batch table through the task workflows.
- **Conversations:** If the task involves conversational data, there might be a relationship with a conversation table.
- **Reviews:** The `role` column suggests a connection to a review process, possibly linking to a review table.
- **Contributors:** The `collaborator_id` likely links to a contributor or user table, detailing the individuals participating in the workflows.

## Key Insights

- The table captures detailed participation data of collaborators in task workflows, which can be used to analyze individual and team productivity.
- The presence of `datastream_metadata` indicates a focus on data integrity and provenance, which is crucial for maintaining high-quality annotation standards.
- The `duration_minutes` column, although showing zero in the sample data, is critical for understanding the time investment required for different roles and tasks, aiding in resource allocation and efficiency improvements.
- The use of JSON metadata allows for flexible storage of additional collaborator-specific information, enabling customization and extensibility of the workflow processes.

### Sample Data

See: [`task_labeling_workflow_collaborator_sample.json`](./task_labeling_workflow_collaborator_sample.json)

---

## task_labeling_workflow_transition

**Row Count**: 200,845 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `from_status` | STRING | YES |
| `to_status` | STRING | YES |
| `effect_log` | JSON | YES |
| `author_id` | INT64 | YES |
| `workflow_id` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |
| `labeling` | JSON | YES |

### AI Analysis

# Table Documentation: `task_labeling_workflow_transition`

## Table Description
The `task_labeling_workflow_transition` table records the transitions of tasks through different statuses within a labeling or annotation workflow. Each entry in the table represents a specific change in the status of a task, capturing metadata about the transition, the author responsible, and detailed labeling information. This table is crucial for tracking the progress and history of tasks as they move through the workflow pipeline.

## Column Descriptions

- **created_at (DATETIME, nullable=YES):** The timestamp indicating when the transition record was created. This helps in tracking the chronological order of status changes.
  
- **updated_at (DATETIME, nullable=YES):** The timestamp of the last update to the transition record. This is useful for auditing and ensuring data integrity over time.
  
- **id (INT64, nullable=YES):** A unique identifier for each transition record. This serves as the primary key for the table.
  
- **from_status (STRING, nullable=YES):** The initial status of the task before the transition. This helps in understanding the workflow path.
  
- **to_status (STRING, nullable=YES):** The new status of the task after the transition. This indicates the current state of the task within the workflow.
  
- **effect_log (JSON, nullable=YES):** A JSON object capturing any effects or actions taken during the transition. This can include logs or notes relevant to the transition.
  
- **author_id (INT64, nullable=YES):** The identifier of the user or system that initiated the transition. This is important for accountability and tracking user actions.
  
- **workflow_id (INT64, nullable=YES):** The identifier of the workflow to which the task belongs. This links the transition to a specific workflow process.
  
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** Metadata about the data stream, including a unique UUID and a timestamp from the source system. This is useful for tracing data origins and ensuring synchronization.
  
- **labeling (JSON, nullable=YES):** A JSON object containing detailed labeling information, including checklists and notes from reviewers and trainers. This provides insights into the quality and correctness of the labeling process.

## Table Relationships
The `task_labeling_workflow_transition` table is likely related to several other tables within the database:

- **Project Table:** This table may be linked to a project table via the `workflow_id`, as workflows are often associated with specific projects.
  
- **Batch Table:** Tasks are often processed in batches, and this table could be related to a batch table that groups tasks for processing.
  
- **Conversation Table:** If tasks involve dialogue or communication, this table might relate to a conversation table that logs interactions.
  
- **Review Table:** The detailed labeling information suggests a relationship with a review table that tracks the review process and outcomes.
  
- **Contributor Table:** The `author_id` indicates a potential link to a contributor or user table that holds information about individuals involved in the workflow.

## Key Insights
- The table provides a comprehensive audit trail of task status changes, which is essential for workflow management and process optimization.
- The detailed `labeling` JSON structure indicates a robust review process, capturing various quality and correctness metrics.
- The presence of `datastream_metadata` suggests integration with external systems, highlighting the importance of data provenance and synchronization.
- The transitions captured in this table can be analyzed to identify bottlenecks or inefficiencies in the workflow, enabling targeted improvements.

### Sample Data

See: [`task_labeling_workflow_transition_sample.json`](./task_labeling_workflow_transition_sample.json)

---

## timer

**Row Count**: 2 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | STRING | YES |
| `contributor_id` | INT64 | YES |
| `conversation_id` | INT64 | YES |
| `conversation_version_id` | INT64 | YES |
| `state` | STRING | YES |
| `total_tracked_time_seconds` | INT64 | YES |
| `current_session_id` | INT64 | YES |
| `synthetic_unique_key` | STRING | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Timer Table Documentation

## Table Description
The `timer` table records time-tracking data associated with contributors working on conversations within a labeling or annotation tool. It captures the duration of time contributors spend in various states (e.g., active, idle) while interacting with specific conversation versions. This table is essential for monitoring productivity and managing workflow efficiency.

## Column Descriptions

- **created_at (DATETIME, nullable=YES)**: The timestamp indicating when the timer record was initially created. This helps in tracking the start of the time-tracking session.
  
- **updated_at (DATETIME, nullable=YES)**: The timestamp of the most recent update to the timer record. It reflects the last modification time, which could indicate the end of a session or a state change.
  
- **id (STRING, nullable=YES)**: A unique identifier for each timer record. This UUID ensures each entry is distinct and can be referenced independently.
  
- **contributor_id (INT64, nullable=YES)**: The identifier of the contributor associated with the timer record. This links the time-tracking data to a specific user in the system.
  
- **conversation_id (INT64, nullable=YES)**: The identifier of the conversation being worked on. This connects the timer record to a particular conversation, allowing for detailed analysis of time spent per conversation.
  
- **conversation_version_id (INT64, nullable=YES)**: The identifier for the specific version of the conversation. Although nullable, when present, it specifies the exact version being annotated, which is useful for version control and tracking changes over time.
  
- **state (STRING, nullable=YES)**: The current state of the timer, such as "idle" or "active". This indicates the contributor's activity status and can be used to analyze work patterns.
  
- **total_tracked_time_seconds (INT64, nullable=YES)**: The total time tracked in seconds for the session. This provides a quantitative measure of the time spent by the contributor on a conversation.
  
- **current_session_id (INT64, nullable=YES)**: The identifier for the current session, if applicable. This could be used to group multiple timer records into a single session for analysis.
  
- **synthetic_unique_key (STRING, nullable=YES)**: A generated key that uniquely identifies the record, potentially combining contributor and conversation identifiers. It serves as an additional unique identifier for complex queries.
  
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES)**: Metadata about the data stream, including a UUID and a source timestamp. This provides context about the data's origin and timing, useful for data integrity and synchronization purposes.

## Table Relationships
The `timer` table is likely related to other tables in a typical annotation tool database through common identifiers:

- **Project Table**: May use `contributor_id` and `conversation_id` to associate time-tracking data with specific projects.
- **Batch Table**: Could relate via `conversation_id` to group conversations into batches for processing.
- **Conversation Table**: Directly linked through `conversation_id` and `conversation_version_id` to provide detailed conversation metadata.
- **Review Table**: May connect through `contributor_id` and `conversation_id` to track review sessions and time spent.
- **Contributor Table**: Directly related through `contributor_id`, linking timer data to user profiles and activities.

## Key Insights
- The `timer` table provides crucial insights into the productivity and efficiency of contributors by tracking the time spent on conversations.
- The state field allows for analysis of active versus idle times, which can be used to optimize workflow and identify bottlenecks.
- The presence of both `created_at` and `updated_at` timestamps enables the calculation of session durations and the identification of trends over time.
- The `synthetic_unique_key` and `datastream_metadata` fields offer additional layers of data integrity and traceability, which are essential for maintaining accurate records in distributed systems.

### Sample Data

See: [`timer_sample.json`](./timer_sample.json)

---

## timer_session

**Row Count**: 6 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `start_time` | TIMESTAMP | YES |
| `end_time` | TIMESTAMP | YES |
| `timer_id` | STRING | YES |
| `latest_heartbeat` | TIMESTAMP | YES |
| `client_session_id` | STRING | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Analysis: `timer_session`

## Table Description
The `timer_session` table is designed to store session data related to timing activities within a labeling or annotation tool. Each record in the table represents a session where a timer was started and stopped, capturing the duration and metadata associated with that session. This information is crucial for tracking the time spent on specific tasks or projects, potentially for billing or productivity analysis.

## Column Descriptions

- **created_at (DATETIME, nullable=YES):** The timestamp indicating when the timer session record was created in the database. This helps in tracking the record's lifecycle.
  
- **updated_at (DATETIME, nullable=YES):** The timestamp of the last update made to the timer session record. This is useful for auditing changes or updates to the session data.

- **id (INT64, nullable=YES):** A unique identifier for each timer session record. This serves as the primary key for the table, ensuring each session can be distinctly referenced.

- **start_time (TIMESTAMP, nullable=YES):** The exact time when the timer session was initiated. This marks the beginning of the time-tracking period for a session.

- **end_time (TIMESTAMP, nullable=YES):** The exact time when the timer session concluded. This marks the end of the time-tracking period for a session.

- **timer_id (STRING, nullable=YES):** A unique identifier for the timer instance associated with the session. This can be used to correlate sessions across different tables or systems.

- **latest_heartbeat (TIMESTAMP, nullable=YES):** The timestamp of the most recent activity or "heartbeat" during the session. This can indicate active engagement or usage during the session period.

- **client_session_id (STRING, nullable=YES):** An identifier for the client session, which may link the timer session to a specific user or device session.

- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** A structured field containing metadata about the data stream, including a UUID and a source timestamp. This provides additional context about the origin or source of the session data.

## Table Relationships
The `timer_session` table likely interacts with other tables in the database through common identifiers such as `project`, `batch`, `conversation`, `review`, or `contributor`. The `timer_id` and `client_session_id` could be used to join with other tables that track project details, user contributions, or review sessions, enabling comprehensive tracking of time spent across various activities.

## Key Insights

- **Session Duration:** By calculating the difference between `end_time` and `start_time`, one can determine the duration of each session, which is useful for productivity analysis or billing purposes.

- **Activity Monitoring:** The `latest_heartbeat` provides insights into the activity level during a session, helping to identify periods of inactivity or engagement.

- **Data Provenance:** The `datastream_metadata` field offers valuable information about the source and context of the session data, which can be critical for data integrity and traceability.

- **Temporal Analysis:** The timestamps (`created_at`, `updated_at`, `start_time`, `end_time`) allow for temporal analysis of session data, enabling trends and patterns to be identified over time.

Overall, the `timer_session` table is a critical component for tracking and analyzing time-based activities within a labeling or annotation tool, providing insights into user engagement and task durations.

### Sample Data

See: [`timer_session_sample.json`](./timer_session_sample.json)

---

## timer_state_history

**Row Count**: 14 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `timer_id` | STRING | YES |
| `old_state` | STRING | YES |
| `new_state` | STRING | YES |
| `timer_session_id` | INT64 | YES |
| `author_id` | INT64 | YES |
| `notes` | STRING | YES |
| `metadata` | JSON | YES |
| `total_tracked_time_seconds` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Analysis: `timer_state_history`

## Description
The `timer_state_history` table records the state transitions of timers used within a labeling or annotation tool. Each row represents a historical entry of a timer's state change, capturing details about the transition, including timestamps, the author of the change, and additional metadata. This table is essential for tracking the lifecycle and usage patterns of timers, which may be used for time-tracking or productivity analysis within the tool.

## Column Purpose

- **created_at (DATETIME, nullable=YES):** The timestamp when the state transition record was created. This indicates when the state change was logged in the system.
  
- **updated_at (DATETIME, nullable=YES):** The timestamp when the state transition record was last updated. This is useful for tracking modifications to the record after its initial creation.
  
- **id (INT64, nullable=YES):** A unique identifier for each state transition record. This serves as the primary key for the table.
  
- **timer_id (STRING, nullable=YES):** A unique identifier for the timer whose state is being tracked. This links the state change to a specific timer instance.
  
- **old_state (STRING, nullable=YES):** The previous state of the timer before the transition occurred. Common states might include "running," "paused," or "idle."
  
- **new_state (STRING, nullable=YES):** The new state of the timer after the transition. This indicates the current status of the timer post-transition.
  
- **timer_session_id (INT64, nullable=YES):** An identifier for the session associated with the timer state change. This may link to a session table to provide context about the timer's usage session.
  
- **author_id (INT64, nullable=YES):** The identifier of the user or system component that initiated the state change. This can be used to audit changes and identify responsible parties.
  
- **notes (STRING, nullable=YES):** Additional information or comments regarding the state change. This field can provide context or reasoning for the transition.
  
- **metadata (JSON, nullable=YES):** A JSON object containing supplementary data about the state transition. This can store flexible, structured data relevant to the transition.
  
- **total_tracked_time_seconds (INT64, nullable=YES):** The total time, in seconds, that the timer has tracked up to the point of the state transition. This helps in calculating the duration of timer usage.
  
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** A structured field containing metadata about the data stream, including a unique identifier and a source timestamp. This can be used for data synchronization and integrity checks.

## Relationships to Other Tables
The `timer_state_history` table likely relates to other tables in the database through common patterns such as:

- **Project:** Timers may be associated with specific projects, and there could be a `project_id` in a related table linking timers to projects.
  
- **Batch:** Timers might be used to track time for specific batches of work, with potential links to a batch table.
  
- **Conversation:** If timers are used to track time spent on conversations, there might be a link to a conversation table.
  
- **Review:** Timers could be part of a review process, with potential connections to a review table.
  
- **Contributor:** The `author_id` can be linked to a contributor or user table to identify who performed the state change.

## Key Insights
- The table provides a detailed audit trail of timer state changes, which can be crucial for understanding user behavior and timer utilization patterns.
- The `total_tracked_time_seconds` column offers insights into how long timers are active, which can be used for productivity analysis or billing purposes.
- The presence of `metadata` and `datastream_metadata` allows for flexible data storage and integration with external systems, enhancing the table's utility in diverse scenarios.
- The `notes` and `author_id` columns provide context and accountability for state changes, supporting robust change management and auditing processes.

### Sample Data

See: [`timer_state_history_sample.json`](./timer_state_history_sample.json)

---

## token

**Row Count**: 563 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `sub` | INT64 | YES |
| `iat` | INT64 | YES |
| `exp` | INT64 | YES |
| `author_id` | INT64 | YES |
| `device` | STRING | YES |
| `ip_address` | STRING | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Documentation: `token`

## Table Description
The `token` table stores authentication tokens generated for users interacting with a labeling/annotation tool. Each row represents a unique token issued to a user, capturing metadata about the token's creation, validity, and associated user information. This table is crucial for managing user sessions and ensuring secure access to the tool.

## Column Descriptions

- **created_at (DATETIME, nullable=YES)**: The timestamp when the token was created. This helps in tracking when a user session was initiated.
  
- **updated_at (DATETIME, nullable=YES)**: The timestamp of the last update to the token record. This is useful for auditing changes to token information.
  
- **id (INT64, nullable=YES)**: A unique identifier for each token. This serves as the primary key for the table, ensuring each token can be uniquely referenced.
  
- **sub (INT64, nullable=YES)**: Represents the subject or user ID for whom the token was issued. This links the token to a specific user within the system.
  
- **iat (INT64, nullable=YES)**: The "issued at" timestamp in Unix time, indicating when the token was generated. This is used to validate the token's age.
  
- **exp (INT64, nullable=YES)**: The expiration timestamp in Unix time, defining when the token will no longer be valid. This is critical for session management and security.
  
- **author_id (INT64, nullable=YES)**: The ID of the user who generated the token. Typically matches the `sub` field, but may differ in cases where tokens are issued by administrators on behalf of users.
  
- **device (STRING, nullable=YES)**: The device information from which the token was generated. This field is currently null, indicating that device tracking may not be implemented or is optional.
  
- **ip_address (STRING, nullable=YES)**: The IP address from which the token was generated. This field is also null, suggesting IP tracking is not actively used or is optional.
  
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES)**: A nested structure containing metadata about the data stream, including a unique UUID and a source timestamp. This helps in tracking the origin and timing of the data stream associated with the token.

## Table Relationships
The `token` table is likely related to other tables in the database through the `sub` or `author_id` fields, which correspond to user identifiers. Common patterns in such systems include:

- **User Table**: The `sub` or `author_id` fields may link to a user table, providing details about the user associated with each token.
- **Project/Batch/Conversation/Review Tables**: While not directly evident from this table alone, tokens may be used to authenticate users accessing specific projects, batches, or conversations within the annotation tool.
- **Contributor Table**: If contributors are tracked separately from general users, the `sub` or `author_id` fields could link to a contributor table.

## Key Insights
- The `token` table is integral to managing user sessions and security within the annotation tool, providing a mechanism for authenticating and authorizing user actions.
- The presence of `iat` and `exp` fields highlights the importance of token validity and expiration in maintaining secure access.
- The `datastream_metadata` field suggests an emphasis on tracking the provenance and timing of data streams, which could be important for auditing and compliance purposes.
- The null values in `device` and `ip_address` indicate potential areas for enhancement if device or IP tracking becomes necessary for security or analytics.

### Sample Data

See: [`token_sample.json`](./token_sample.json)

---

## typeorm_metadata

**Row Count**: 19 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `type` | STRING | YES |
| `database` | STRING | YES |
| `schema` | STRING | YES |
| `table` | STRING | YES |
| `name` | STRING | YES |
| `value` | STRING | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64, is_deleted BOOL> | YES |

### AI Analysis

# Table Analysis: `typeorm_metadata`

## Table Description
The `typeorm_metadata` table is designed to store metadata related to database views and possibly other database objects within a labeling/annotation tool. This table captures the structure and logic of views, which are used to derive specific insights or configurations from the underlying data. It includes metadata about the views' definitions, their associated schemas, and additional metadata for data streaming purposes.

## Column Descriptions

- **type (STRING, nullable=YES):** Indicates the type of database object, such as a VIEW. This helps in identifying the nature of the metadata entry.
- **database (STRING, nullable=YES):** Specifies the database name where the object resides. It is often null, suggesting a single database context or that the focus is on schema-level organization.
- **schema (STRING, nullable=YES):** Denotes the schema within the database that contains the object. This is useful for organizing and categorizing database objects.
- **table (STRING, nullable=YES):** Represents the table name associated with the metadata. It is typically null for views, as views are not directly tied to a single table.
- **name (STRING, nullable=YES):** The name of the view or object. This is crucial for identifying and referencing the specific view or object within the database.
- **value (STRING, nullable=YES):** Contains the SQL query or definition of the view. This is the core logic that defines what the view does and how it aggregates or transforms data.
- **datastream_metadata (STRUCT, nullable=YES):** A structured field containing:
  - **uuid (STRING):** A unique identifier for the metadata entry, useful for tracking changes or referencing specific entries.
  - **source_timestamp (INT64):** The timestamp indicating when the metadata was sourced or last updated, aiding in version control and auditing.
  - **is_deleted (BOOL):** A boolean flag indicating if the metadata entry is marked as deleted, which helps in managing the lifecycle of metadata entries.

## Table Relationships
The `typeorm_metadata` table is likely related to other tables in the database through the views it defines. Common patterns suggest that these views might be used to aggregate or transform data from tables such as `project`, `batch`, `conversation`, `review`, and `contributor`. For example, the `latest_manual_review` and `latest_auto_review` views aggregate data from a `review` table, indicating a relationship where reviews are grouped by conversation and filtered by type and status.

## Key Insights
- The table primarily serves as a metadata repository for views, capturing both their definitions and associated metadata for data streaming.
- The presence of views like `latest_manual_review` and `latest_auto_review` suggests a focus on processing and analyzing review data, specifically to identify the most recent reviews by type and status.
- The `difficulty_level_name` view indicates a configuration aspect, possibly used to map or interpret difficulty levels from a JSON configuration stored in an `app_config` table.
- The `datastream_metadata` field provides a mechanism for tracking changes and managing the lifecycle of metadata entries, which is crucial for maintaining data integrity and consistency in a dynamic environment.

### Sample Data

See: [`typeorm_metadata_sample.json`](./typeorm_metadata_sample.json)

---

## video_annotation_activity

**Row Count**: 1 rows

### Schema

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | DATETIME | YES |
| `updated_at` | DATETIME | YES |
| `id` | INT64 | YES |
| `task_id` | INT64 | YES |
| `annotation_data` | JSON | YES |
| `origin` | STRING | YES |
| `source` | STRING | YES |
| `event` | STRING | YES |
| `status` | STRING | YES |
| `created_by` | INT64 | YES |
| `datastream_metadata` | STRUCT<uuid STRING, source_timestamp INT64> | YES |

### AI Analysis

# Table Analysis: `video_annotation_activity`

## Table Description
The `video_annotation_activity` table stores records of activities related to video annotation tasks within a labeling or annotation tool. Each entry in the table represents a specific action or event performed on a video annotation task, capturing details such as the task's status, the event type, and metadata associated with the annotation process. This table is crucial for tracking the history and changes made to video annotations, facilitating audit trails and performance analysis.

## Column Descriptions

- **created_at (DATETIME, nullable=YES):** The timestamp indicating when the annotation activity was initially recorded in the system.
- **updated_at (DATETIME, nullable=YES):** The timestamp reflecting the most recent update to the annotation activity record, useful for tracking modifications over time.
- **id (INT64, nullable=YES):** A unique identifier for each annotation activity record, serving as the primary key for the table.
- **task_id (INT64, nullable=YES):** References the specific annotation task associated with this activity, likely linking to a task or project table.
- **annotation_data (JSON, nullable=YES):** A JSON object containing details about the annotation changes, such as before and after states, which provides context for the activity.
- **origin (STRING, nullable=YES):** The URL or source from which the annotation activity originated, indicating the platform or tool used.
- **source (STRING, nullable=YES):** Describes the tool or system component that generated the activity, such as "labeling-tool."
- **event (STRING, nullable=YES):** Specifies the type of event that occurred, such as "UPDATE_CONVERSATION," indicating the nature of the activity.
- **status (STRING, nullable=YES):** The current status of the annotation activity, such as "completed," which helps in understanding the progress and state of the task.
- **created_by (INT64, nullable=YES):** The identifier for the user or system that created the annotation activity, potentially linking to a contributor or user table.
- **datastream_metadata (STRUCT<uuid STRING, source_timestamp INT64>, nullable=YES):** Contains metadata about the data stream, including a unique identifier (UUID) and a source timestamp, which aids in tracking and synchronization of data streams.

## Table Relationships
This table likely interacts with several other tables in a labeling/annotation tool database:

- **Project Table:** The `task_id` may link to a project or task table that provides broader context about the video annotation project.
- **Batch Table:** If annotations are processed in batches, this table might relate to a batch table through the `task_id`.
- **Contributor Table:** The `created_by` column could connect to a contributor or user table, identifying who performed the annotation activity.
- **Review Table:** If annotations undergo review, this table might relate to a review table to track review activities and outcomes.

## Key Insights
- The presence of both `created_at` and `updated_at` timestamps allows for detailed tracking of annotation activities over time, which is essential for auditing and understanding workflow efficiency.
- The `annotation_data` column, stored as JSON, provides flexibility in capturing diverse changes and states related to annotations, enabling detailed analysis of annotation modifications.
- The `event` and `status` columns are critical for understanding the lifecycle and current state of annotation tasks, which can inform process improvements and performance metrics.
- The `datastream_metadata` provides essential information for data synchronization and integrity checks, particularly in distributed or real-time processing environments.

### Sample Data

See: [`video_annotation_activity_sample.json`](./video_annotation_activity_sample.json)

---

