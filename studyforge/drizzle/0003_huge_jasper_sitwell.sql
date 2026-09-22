CREATE TABLE `cloud_ai_usage_daily` (
	`usage_date` text PRIMARY KEY NOT NULL,
	`general_ai_count` integer DEFAULT 0 NOT NULL,
	`dictation_count` integer DEFAULT 0 NOT NULL,
	`last_used_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `study_session_generation_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`generation_id` text NOT NULL,
	`step_name` text NOT NULL,
	`step_index` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`output_json` text,
	`error_message` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`generation_id`) REFERENCES `study_session_generations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `study_session_generation_steps_generation_id_idx` ON `study_session_generation_steps` (`generation_id`);--> statement-breakpoint
CREATE TABLE `study_session_generations` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`current_step` text,
	`progress_percentage` integer DEFAULT 0 NOT NULL,
	`source_content_version_hash` text NOT NULL,
	`source_lessons_count` integer DEFAULT 0 NOT NULL,
	`cloud_calls_used` integer DEFAULT 0 NOT NULL,
	`pdf_path` text,
	`pdf_file_name` text,
	`pdf_file_size` integer,
	`error_message` text,
	`completed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `study_session_generations_course_id_idx` ON `study_session_generations` (`course_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `study_session_generations_active_uidx` ON `study_session_generations` (`course_id`) WHERE "study_session_generations"."status" in ('queued','running');