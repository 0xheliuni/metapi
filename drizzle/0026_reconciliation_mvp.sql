CREATE TABLE `downstream_site_channels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`downstream_site_id` integer NOT NULL,
	`remote_channel_id` text NOT NULL,
	`remote_name` text NOT NULL,
	`remote_type` integer,
	`remote_group` text,
	`balance` real,
	`raw_consumed_quota` real,
	`derived_consumed_usd` real,
	`request_count` integer,
	`raw_payload` text,
	`synced_at` text DEFAULT (datetime('now')),
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`downstream_site_id`) REFERENCES `downstream_sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `downstream_site_channels_site_channel_unique` ON `downstream_site_channels` (`downstream_site_id`,`remote_channel_id`);--> statement-breakpoint
CREATE INDEX `downstream_site_channels_site_id_idx` ON `downstream_site_channels` (`downstream_site_id`);--> statement-breakpoint
CREATE INDEX `downstream_site_channels_synced_at_idx` ON `downstream_site_channels` (`synced_at`);--> statement-breakpoint
CREATE TABLE `downstream_sites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`host_site_id` integer NOT NULL,
	`base_url_override` text,
	`auth_mode` text DEFAULT 'session-admin' NOT NULL,
	`admin_credential_cipher` text NOT NULL,
	`admin_user_id` integer,
	`description` text,
	`enabled` integer DEFAULT true,
	`last_sync_status` text DEFAULT 'idle',
	`last_sync_message` text,
	`last_sync_at` text,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`host_site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `downstream_sites_host_site_id_idx` ON `downstream_sites` (`host_site_id`);--> statement-breakpoint
CREATE INDEX `downstream_sites_enabled_idx` ON `downstream_sites` (`enabled`);--> statement-breakpoint
CREATE UNIQUE INDEX `downstream_sites_host_site_name_unique` ON `downstream_sites` (`host_site_id`,`name`);--> statement-breakpoint
CREATE TABLE `reconciliation_facts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`fact_type` text NOT NULL,
	`source_type` text DEFAULT 'global' NOT NULL,
	`source_id` integer,
	`host_site_id` integer,
	`downstream_site_id` integer,
	`supplier_site_id` integer,
	`time_bucket_type` text NOT NULL,
	`time_bucket_start` text NOT NULL,
	`time_bucket_end` text NOT NULL,
	`model_requested_raw` text,
	`model_actual_raw` text,
	`model_canonical` text,
	`model_family` text DEFAULT 'other' NOT NULL,
	`supplier_key` text,
	`supplier_confidence` real,
	`request_count` integer,
	`token_count` integer,
	`billed_quota` real,
	`cost_usd` real,
	`usage_confidence` real,
	`price_confidence` real,
	`raw_payload` text,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`run_id`) REFERENCES `reconciliation_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`host_site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`downstream_site_id`) REFERENCES `downstream_sites`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`supplier_site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `reconciliation_facts_run_id_idx` ON `reconciliation_facts` (`run_id`);--> statement-breakpoint
CREATE INDEX `reconciliation_facts_run_type_idx` ON `reconciliation_facts` (`run_id`,`fact_type`);--> statement-breakpoint
CREATE INDEX `reconciliation_facts_run_window_family_idx` ON `reconciliation_facts` (`run_id`,`time_bucket_start`,`model_family`);--> statement-breakpoint
CREATE TABLE `reconciliation_model_mappings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pattern` text NOT NULL,
	`model_canonical` text NOT NULL,
	`model_family` text NOT NULL,
	`supplier_hint` text,
	`priority` integer DEFAULT 100 NOT NULL,
	`enabled` integer DEFAULT true,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reconciliation_model_mappings_pattern_unique` ON `reconciliation_model_mappings` (`pattern`);--> statement-breakpoint
CREATE INDEX `reconciliation_model_mappings_enabled_priority_idx` ON `reconciliation_model_mappings` (`enabled`,`priority`);--> statement-breakpoint
CREATE INDEX `reconciliation_model_mappings_family_idx` ON `reconciliation_model_mappings` (`model_family`);--> statement-breakpoint
CREATE TABLE `reconciliation_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`source_type` text DEFAULT 'global' NOT NULL,
	`source_id` integer,
	`host_site_id` integer,
	`downstream_site_id` integer,
	`time_bucket_type` text NOT NULL,
	`time_bucket_start` text NOT NULL,
	`time_bucket_end` text NOT NULL,
	`model_family` text DEFAULT 'other' NOT NULL,
	`model_canonical` text,
	`downstream_billed_tokens` integer DEFAULT 0 NOT NULL,
	`downstream_billed_cost_usd` real DEFAULT 0 NOT NULL,
	`metapi_observed_tokens` integer DEFAULT 0 NOT NULL,
	`metapi_observed_cost_usd` real DEFAULT 0 NOT NULL,
	`upstream_consumed_quota` real DEFAULT 0 NOT NULL,
	`upstream_consumed_cost_usd_derived` real DEFAULT 0 NOT NULL,
	`delta_tokens` integer DEFAULT 0 NOT NULL,
	`delta_cost_usd` real DEFAULT 0 NOT NULL,
	`delta_rate` real,
	`status` text DEFAULT 'warning' NOT NULL,
	`confidence_score` real DEFAULT 0 NOT NULL,
	`explanation_codes` text,
	`explanation_text` text,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`run_id`) REFERENCES `reconciliation_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`host_site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`downstream_site_id`) REFERENCES `downstream_sites`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `reconciliation_results_run_id_idx` ON `reconciliation_results` (`run_id`);--> statement-breakpoint
CREATE INDEX `reconciliation_results_run_window_family_idx` ON `reconciliation_results` (`run_id`,`time_bucket_start`,`model_family`);--> statement-breakpoint
CREATE TABLE `reconciliation_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_type` text DEFAULT 'global' NOT NULL,
	`source_id` integer,
	`scope_type` text NOT NULL,
	`window_start` text NOT NULL,
	`window_end` text NOT NULL,
	`model_scope` text DEFAULT 'family' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`summary_json` text,
	`error_message` text,
	`started_at` text,
	`finished_at` text,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE INDEX `reconciliation_runs_created_at_idx` ON `reconciliation_runs` (`created_at`);--> statement-breakpoint
CREATE INDEX `reconciliation_runs_status_idx` ON `reconciliation_runs` (`status`);--> statement-breakpoint
CREATE INDEX `reconciliation_runs_source_scope_idx` ON `reconciliation_runs` (`source_type`,`source_id`,`scope_type`);
