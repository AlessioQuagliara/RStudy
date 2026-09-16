CREATE TABLE `license` (
	`id` text PRIMARY KEY NOT NULL,
	`license_key` text NOT NULL,
	`paddle_transaction_id` text NOT NULL,
	`purchased_at` text NOT NULL,
	`activated_at` text NOT NULL,
	`updates_valid_until` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
