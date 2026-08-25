CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `course_ai_outputs` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`comprehensive_summary_markdown` text NOT NULL,
	`course_outline_json` text NOT NULL,
	`mermaid_diagram` text NOT NULL,
	`suggested_study_plan_json` text NOT NULL,
	`generated_from_lesson_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `course_ai_outputs_course_id_idx` ON `course_ai_outputs` (`course_id`);--> statement-breakpoint
CREATE TABLE `courses` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`code` text,
	`cfu` integer DEFAULT 0 NOT NULL,
	`exam_date` text,
	`introduction` text,
	`objectives` text,
	`target_lessons` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`color` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `courses_status_idx` ON `courses` (`status`);--> statement-breakpoint
CREATE TABLE `document_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`lesson_id` text,
	`material_id` text,
	`content` text NOT NULL,
	`source_label` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`embedding` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `document_chunks_course_id_idx` ON `document_chunks` (`course_id`);--> statement-breakpoint
CREATE INDEX `document_chunks_lesson_id_idx` ON `document_chunks` (`lesson_id`);--> statement-breakpoint
CREATE INDEX `document_chunks_material_id_idx` ON `document_chunks` (`material_id`);--> statement-breakpoint
CREATE TABLE `flashcards` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`lesson_id` text,
	`front` text NOT NULL,
	`back` text NOT NULL,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`difficulty` text DEFAULT 'medium' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`next_review_at` text,
	`review_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `flashcards_course_id_idx` ON `flashcards` (`course_id`);--> statement-breakpoint
CREATE INDEX `flashcards_lesson_id_idx` ON `flashcards` (`lesson_id`);--> statement-breakpoint
CREATE INDEX `flashcards_next_review_at_idx` ON `flashcards` (`next_review_at`);--> statement-breakpoint
CREATE TABLE `lesson_ai_outputs` (
	`id` text PRIMARY KEY NOT NULL,
	`lesson_id` text NOT NULL,
	`summary_markdown` text NOT NULL,
	`key_points_json` text NOT NULL,
	`study_outline_json` text NOT NULL,
	`mermaid_diagram` text NOT NULL,
	`self_check_questions_json` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lesson_ai_outputs_lesson_id_uidx` ON `lesson_ai_outputs` (`lesson_id`);--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`lesson_number` integer NOT NULL,
	`title` text NOT NULL,
	`lesson_date` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`notes_json` text,
	`notes_plain_text` text,
	`ai_status` text DEFAULT 'idle' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lessons_course_id_idx` ON `lessons` (`course_id`);--> statement-breakpoint
CREATE INDEX `lessons_status_idx` ON `lessons` (`status`);--> statement-breakpoint
CREATE TABLE `materials` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`lesson_id` text,
	`title` text NOT NULL,
	`original_filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`file_path` text NOT NULL,
	`file_size` integer NOT NULL,
	`material_type` text DEFAULT 'other' NOT NULL,
	`extracted_text` text,
	`extraction_status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `materials_course_id_idx` ON `materials` (`course_id`);--> statement-breakpoint
CREATE INDEX `materials_lesson_id_idx` ON `materials` (`lesson_id`);