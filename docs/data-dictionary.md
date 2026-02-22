# Data Dictionary

This document summarizes the database schema defined in `server/prisma/schema.prisma`.

## Table: User

| Attribute | Type | Null | Default | Key | Description |
|-----------|------|------|---------|-----|-------------|
| id | String | NO | `cuid()` | PK | Primary key. |
| email | String | NO | — | — | Unique email address. |
| passwordHash | String | NO | — | — | Hashed password. |
| name | String | YES | — | — | Full name (optional). |
| nickname | String | YES | — | — | Preferred nickname. |
| studentId | String | YES | — | — | External student identifier. |
| yearLevel | String | YES | — | — | Academic year level. |
| block | String | YES | — | — | Student block/section. |
| profession | String | YES | — | — | Profession for staff/faculty. |
| schedule | String | YES | — | — | Schedule notes. |
| avatarUrl | String | YES | — | — | Profile image URL. |
| createdAt | DateTime | NO | `now()` | — | Record creation timestamp. |
| updatedAt | DateTime | NO | auto | — | Auto-updated timestamp. |
| messages | Relation (Message[]) | N/A | — | — | Messages sent by the user. |
| enrollments | Relation (Enrollment[]) | N/A | — | — | Sections or channels the user belongs to. |
| roles | Relation (UserRole[]) | N/A | — | — | Role assignments. |
| banners | Relation (Banner[]) | N/A | — | — | Banners created by the user. |
| bannerUserTargets | Relation (BannerUserTarget[]) | N/A | — | — | Banner targeting records for the user. |

## Table: Channel

| Attribute | Type | Null | Default | Key | Description |
|-----------|------|------|---------|-----|-------------|
| id | String | NO | `cuid()` | PK | Primary key. |
| name | String | NO | — | — | Channel name. |
| topic | String | YES | — | — | Channel topic/description. |
| kind | String | NO | — | — | Channel type indicator. |
| createdAt | DateTime | NO | `now()` | — | Creation timestamp. |
| messages | Relation (Message[]) | N/A | — | — | Messages posted in the channel. |
| members | Relation (Enrollment[]) | N/A | — | — | User/channel membership links. |
| pins | Relation (ChannelPin[]) | N/A | — | — | Pinned messages in the channel. |

## Table: Message

| Attribute | Type | Null | Default | Key | Description |
|-----------|------|------|---------|-----|-------------|
| id | String | NO | `cuid()` | PK | Primary key. |
| channelId | String | NO | — | FK | FK to `Channel.id`. |
| senderId | String | YES | — | FK | FK to `User.id` (nullable for system messages). |
| senderName | String | NO | — | — | Display name of sender. |
| senderAvatarUrl | String | YES | — | — | Sender avatar override. |
| text | String | NO | — | — | Message body. |
| priority | String | NO | "normal" | — | Priority flag. |
| contextSummary | String | YES | — | — | Summary metadata. |
| contextHighlights | String | YES | — | — | Highlight metadata. |
| contextSuggestions | String | YES | — | — | Suggestion metadata. |
| contextTagline | String | YES | — | — | Tagline metadata. |
| contextMeta | String | YES | — | — | Additional metadata JSON. |
| createdAt | DateTime | NO | `now()` | — | Timestamp sent. |
| channel | Relation (Channel) | N/A | — | — | Channel reference. |
| sender | Relation (User?) | N/A | — | — | Sender reference (optional). |
| pins | Relation (ChannelPin[]) | N/A | — | — | Pins referencing this message. |

## Table: ChannelPin

| Attribute | Type | Null | Default | Key | Description |
|-----------|------|------|---------|-----|-------------|
| id | String | NO | `cuid()` | PK | Primary key. |
| channelId | String | NO | — | FK | FK to `Channel.id`. |
| messageId | String | NO | — | FK | FK to `Message.id`. |
| pinnedById | String | YES | — | — | User who pinned the message (optional reference to `User.id`). |
| pinnedByName | String | YES | — | — | Display name of the pinning user. |
| pinnedAt | DateTime | NO | `now()` | — | When the message was pinned. |
| channel | Relation (Channel) | N/A | — | — | Channel reference. |
| message | Relation (Message) | N/A | — | — | Message reference. |

> Unique constraint: `@@unique([channelId, messageId])`.

## Table: Subject

| Attribute | Type | Null | Default | Key | Description |
|-----------|------|------|---------|-----|-------------|
| id | String | NO | — | PK | Subject code (primary key). |
| name | String | YES | — | — | Subject title. |
| users | Relation (Enrollment[]) | N/A | — | — | Enrolled users. |

## Table: Enrollment

| Attribute | Type | Null | Default | Key | Description |
|-----------|------|------|---------|-----|-------------|
| id | String | NO | `cuid()` | PK | Primary key. |
| userId | String | NO | — | FK | FK to `User.id`. |
| subjectId | String | YES | — | FK | FK to `Subject.id`. |
| channelId | String | YES | — | FK | FK to `Channel.id`. |
| createdAt | DateTime | NO | `now()` | — | Enrollment timestamp. |
| user | Relation (User) | N/A | — | — | User reference. |
| subject | Relation (Subject?) | N/A | — | — | Subject reference (optional). |
| channel | Relation (Channel?) | N/A | — | — | Channel reference (optional). |

## Table: UserRole

| Attribute | Type | Null | Default | Key | Description |
|-----------|------|------|---------|-----|-------------|
| id | String | NO | `cuid()` | PK | Primary key. |
| userId | String | NO | — | FK | FK to `User.id`. |
| role | String | NO | — | — | Role identifier. |
| user | Relation (User) | N/A | — | — | User reference. |

## Table: Banner

| Attribute | Type | Null | Default | Key | Description |
|-----------|------|------|---------|-----|-------------|
| id | String | NO | `cuid()` | PK | Primary key. |
| title | String | NO | — | — | Banner headline. |
| message | String | NO | — | — | Banner content body. |
| kind | String | NO | "info" | — | Banner type. |
| isActive | Boolean | NO | `false` | — | Activation flag. |
| startsAt | DateTime | YES | — | — | Start of display window. |
| endsAt | DateTime | YES | — | — | End of display window. |
| createdAt | DateTime | NO | `now()` | — | Creation timestamp. |
| updatedAt | DateTime | NO | auto | — | Auto-updated timestamp. |
| createdBy | String | YES | — | FK | FK to `User.id` (creator). |
| creator | Relation (User?) | N/A | — | — | Creator reference. |
| targets | Relation (BannerTarget[]) | N/A | — | — | Section/subject targeting rules. |
| userTargets | Relation (BannerUserTarget[]) | N/A | — | — | User-specific targets. |

## Table: BannerTarget

| Attribute | Type | Null | Default | Key | Description |
|-----------|------|------|---------|-----|-------------|
| id | String | NO | `cuid()` | PK | Primary key. |
| bannerId | String | NO | — | FK | FK to `Banner.id`. |
| targetType | String | NO | — | — | Target type (e.g., section, subject). |
| targetValue | String | YES | — | — | Specific target identifier. |
| banner | Relation (Banner) | N/A | — | — | Banner reference. |

## Table: BannerUserTarget

| Attribute | Type | Null | Default | Key | Description |
|-----------|------|------|---------|-----|-------------|
| id | String | NO | `cuid()` | PK | Primary key. |
| bannerId | String | NO | — | FK | FK to `Banner.id`. |
| userId | String | NO | — | FK | FK to `User.id`. |
| banner | Relation (Banner) | N/A | — | — | Banner reference. |
| user | Relation (User) | N/A | — | — | Targeted user reference. |

## Table: ActivityLog

| Attribute | Type | Null | Default | Key | Description |
|-----------|------|------|---------|-----|-------------|
| id | String | NO | `cuid()` | PK | Primary key. |
| kind | String | NO | — | — | Activity type code. |
| actorId | String | YES | — | — | Optional stored user identifier (no FK constraint). |
| actorName | String | YES | — | — | Actor display name. |
| subjectType | String | YES | — | — | Entity type affected. |
| subjectId | String | YES | — | — | ID of the affected entity (stored as reference identifier). |
| message | String | NO | — | — | Human-readable description. |
| data | String | YES | — | — | JSON payload or metadata. |
| createdAt | DateTime | NO | `now()` | — | Timestamp of the activity. |

> Indexes: `@@index([createdAt])`, `@@index([kind, createdAt])`.
