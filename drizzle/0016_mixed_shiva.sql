CREATE TABLE `webhookDeliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider` enum('paddle','github') NOT NULL,
	`eventId` varchar(180) NOT NULL,
	`eventType` varchar(120) NOT NULL,
	`status` varchar(40) NOT NULL DEFAULT 'processed',
	`payload` text,
	`receivedAt` timestamp NOT NULL DEFAULT (now()),
	`processedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `webhookDeliveries_id` PRIMARY KEY(`id`),
	CONSTRAINT `webhook_provider_event_idx` UNIQUE(`provider`,`eventId`)
);
--> statement-breakpoint
CREATE INDEX `webhook_provider_date_idx` ON `webhookDeliveries` (`provider`,`receivedAt`);