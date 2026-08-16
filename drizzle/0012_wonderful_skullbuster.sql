ALTER TABLE `repositories` ADD `healthScore` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `repositories` ADD `complexityLevel` varchar(40);--> statement-breakpoint
ALTER TABLE `repositories` ADD `projectCategory` varchar(80);