ALTER TABLE `subscriptions` ADD `managedDomainAddOn` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `managedDomainName` varchar(255);--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `managedDomainStatus` enum('none','requested','provisioning','active','failed') DEFAULT 'none' NOT NULL;