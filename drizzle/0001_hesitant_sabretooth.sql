CREATE TABLE `deviceRegistrations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(64) NOT NULL,
	`installationId` varchar(128) NOT NULL,
	`model` varchar(128) NOT NULL,
	`brand` varchar(64) NOT NULL,
	`countryCode` varchar(8) NOT NULL,
	`countryName` varchar(128) NOT NULL,
	`latitude` double NOT NULL,
	`longitude` double NOT NULL,
	`isSpecial` boolean NOT NULL DEFAULT false,
	`expoPushToken` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `deviceRegistrations_id` PRIMARY KEY(`id`),
	CONSTRAINT `deviceRegistrations_installationId_unique` UNIQUE(`installationId`)
);
--> statement-breakpoint
CREATE TABLE `notificationInboxes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`notificationId` int NOT NULL,
	`recipientInstallationId` varchar(128) NOT NULL,
	`senderUsername` varchar(64) NOT NULL,
	`title` varchar(120) NOT NULL,
	`body` text NOT NULL,
	`deliveryStatus` enum('queued','delivered','failed') NOT NULL DEFAULT 'queued',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notificationInboxes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`senderInstallationId` varchar(128) NOT NULL,
	`senderUsername` varchar(64) NOT NULL,
	`recipientInstallationId` varchar(128),
	`title` varchar(120) NOT NULL,
	`body` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `deviceRegistrations_username_idx` ON `deviceRegistrations` (`username`);--> statement-breakpoint
CREATE INDEX `notificationInboxes_recipient_idx` ON `notificationInboxes` (`recipientInstallationId`);--> statement-breakpoint
CREATE INDEX `notifications_sender_idx` ON `notifications` (`senderInstallationId`);--> statement-breakpoint
CREATE INDEX `notifications_recipient_idx` ON `notifications` (`recipientInstallationId`);