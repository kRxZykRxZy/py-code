ALTER TABLE `repositories` ADD `organizationName` varchar(180);--> statement-breakpoint
ALTER TABLE `repositories` ADD `topics` json;--> statement-breakpoint
ALTER TABLE `repositories` ADD `isArchived` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `repositories` ADD `isFork` boolean DEFAULT false NOT NULL;