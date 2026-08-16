ALTER TABLE `repositories` ADD `imageUrl` text;--> statement-breakpoint
ALTER TABLE `repositories` ADD `imageKey` varchar(512);--> statement-breakpoint
ALTER TABLE `repositories` ADD `imageAlt` varchar(180);--> statement-breakpoint
ALTER TABLE `repositories` ADD `imageCrop` json;