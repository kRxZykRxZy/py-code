CREATE TABLE `contactMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`profileId` int NOT NULL,
	`senderName` varchar(120) NOT NULL,
	`senderEmail` varchar(320) NOT NULL,
	`message` text NOT NULL,
	`spamScore` int NOT NULL DEFAULT 0,
	`isRead` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contactMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `contact_profile_date_idx` ON `contactMessages` (`profileId`,`createdAt`);