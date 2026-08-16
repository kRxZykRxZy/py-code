ALTER TABLE `repositories` ADD `contributorCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `repositories` ADD `latestReleaseTag` varchar(180);--> statement-breakpoint
ALTER TABLE `repositories` ADD `latestReleaseAt` timestamp;--> statement-breakpoint
ALTER TABLE `repositories` ADD `commitActivity` json;