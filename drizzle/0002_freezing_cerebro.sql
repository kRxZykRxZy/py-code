ALTER TABLE `subscriptions` MODIFY COLUMN `plan` enum('free','pro','proPlus') NOT NULL DEFAULT 'free';--> statement-breakpoint
ALTER TABLE `analyticsEvents` ADD `utmSource` varchar(120);--> statement-breakpoint
ALTER TABLE `analyticsEvents` ADD `utmMedium` varchar(120);--> statement-breakpoint
ALTER TABLE `analyticsEvents` ADD `utmCampaign` varchar(160);--> statement-breakpoint
ALTER TABLE `profiles` ADD `analyticsConsent` boolean DEFAULT true NOT NULL;