ALTER TABLE `account_tokens` ADD `used_quota` real;
--> statement-breakpoint
ALTER TABLE `account_tokens` ADD `remain_quota` real;
--> statement-breakpoint
ALTER TABLE `account_tokens` ADD `unlimited_quota` integer;
