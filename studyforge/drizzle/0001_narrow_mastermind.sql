CREATE TABLE `lesson_ai_generations` (
	`id` text PRIMARY KEY NOT NULL,
	`lesson_id` text NOT NULL,
	`kind` text NOT NULL,
	`source_content_hash` text NOT NULL,
	`schema_version` integer NOT NULL,
	`model` text NOT NULL,
	`status` text NOT NULL,
	`payload_json` text,
	`error_message` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lesson_ai_generations_lesson_id_idx` ON `lesson_ai_generations` (`lesson_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `lesson_ai_generations_ready_cache_uidx` ON `lesson_ai_generations` (`lesson_id`,`kind`,`source_content_hash`) WHERE "lesson_ai_generations"."status" = 'ready';