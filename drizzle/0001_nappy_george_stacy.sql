CREATE TABLE `analyticsEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`profileId` int NOT NULL,
	`eventType` varchar(40) NOT NULL DEFAULT 'pageview',
	`visitorHash` varchar(128),
	`country` varchar(80),
	`region` varchar(120),
	`referrer` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analyticsEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customDomains` (
	`id` int AUTO_INCREMENT NOT NULL,
	`profileId` int NOT NULL,
	`domain` varchar(255) NOT NULL,
	`status` enum('pending','verified','active') NOT NULL DEFAULT 'pending',
	`verificationToken` varchar(120),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customDomains_id` PRIMARY KEY(`id`),
	CONSTRAINT `customDomains_domain_unique` UNIQUE(`domain`)
);
--> statement-breakpoint
CREATE TABLE `githubConnections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`githubId` varchar(80) NOT NULL,
	`accessToken` text NOT NULL,
	`scope` varchar(255),
	`syncedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `githubConnections_id` PRIMARY KEY(`id`),
	CONSTRAINT `github_user_idx` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`slug` varchar(80) NOT NULL,
	`githubLogin` varchar(80),
	`githubId` varchar(80),
	`displayName` varchar(180),
	`bio` text,
	`avatarUrl` text,
	`location` varchar(180),
	`websiteUrl` text,
	`isPublic` boolean NOT NULL DEFAULT true,
	`template` varchar(40) NOT NULL DEFAULT 'atelier',
	`customCss` text,
	`sectionConfig` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `profiles_slug_unique` UNIQUE(`slug`),
	CONSTRAINT `profiles_user_idx` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `repositories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`profileId` int NOT NULL,
	`githubRepoId` varchar(80) NOT NULL,
	`name` varchar(180) NOT NULL,
	`description` text,
	`language` varchar(80),
	`stars` int NOT NULL DEFAULT 0,
	`forks` int NOT NULL DEFAULT 0,
	`url` text,
	`homepage` text,
	`aiSummary` text,
	`displayName` varchar(180),
	`displayDescription` text,
	`isPinned` boolean NOT NULL DEFAULT false,
	`isHidden` boolean NOT NULL DEFAULT false,
	`sortOrder` int NOT NULL DEFAULT 0,
	`syncedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `repositories_id` PRIMARY KEY(`id`),
	CONSTRAINT `repo_external_idx` UNIQUE(`profileId`,`githubRepoId`)
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`paddleCustomerId` varchar(120),
	`paddleSubscriptionId` varchar(120),
	`plan` enum('free','pro') NOT NULL DEFAULT 'free',
	`status` varchar(40) NOT NULL DEFAULT 'inactive',
	`renewsAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscription_user_idx` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `openId` varchar(128) NOT NULL;--> statement-breakpoint
CREATE INDEX `analytics_profile_date_idx` ON `analyticsEvents` (`profileId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `repos_profile_idx` ON `repositories` (`profileId`);