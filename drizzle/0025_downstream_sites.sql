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
CREATE INDEX `downstream_sites_host_site_id_idx` ON `downstream_sites` (`host_site_id`);
--> statement-breakpoint
CREATE INDEX `downstream_sites_enabled_idx` ON `downstream_sites` (`enabled`);
--> statement-breakpoint
CREATE UNIQUE INDEX `downstream_sites_host_site_name_unique` ON `downstream_sites` (`host_site_id`,`name`);
--> statement-breakpoint
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
CREATE UNIQUE INDEX `downstream_site_channels_site_channel_unique` ON `downstream_site_channels` (`downstream_site_id`,`remote_channel_id`);
--> statement-breakpoint
CREATE INDEX `downstream_site_channels_site_id_idx` ON `downstream_site_channels` (`downstream_site_id`);
--> statement-breakpoint
CREATE INDEX `downstream_site_channels_synced_at_idx` ON `downstream_site_channels` (`synced_at`);
