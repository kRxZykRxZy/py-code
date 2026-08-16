ALTER TABLE `repositories` ADD `licenseName` varchar(180);--> statement-breakpoint
ALTER TABLE `repositories` ADD `defaultBranch` varchar(180);--> statement-breakpoint
ALTER TABLE `repositories` ADD `openIssues` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `repositories` ADD `openPullRequests` int DEFAULT 0 NOT NULL;