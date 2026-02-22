# Conceptual Entity Relationships

This document mirrors the entities defined in `server/prisma/schema.prisma` but removes explicit data types so you can present a conceptual view of the database design.

## Entities

### User

| Field | Notes |
|-------|-------|
| id | `@id @default(cuid())` |
| email | `@unique` |
| passwordHash | |
| name | |
| nickname | |
| studentId | |
| yearLevel | |
| block | |
| profession | |
| schedule | |
| avatarUrl | |
| createdAt | `@default(now())` |
| updatedAt | `@updatedAt` |
| messages | `Message[]` |
| enrollments | `Enrollment[]` |
| roles | `UserRole[]` |
| banners | `Banner[]` |
| bannerUserTargets | `BannerUserTarget[]` |

### Channel

| Field | Notes |
|-------|-------|
| id | `@id @default(cuid())` |
| name | |
| topic | |
| kind | |
| createdAt | `@default(now())` |
| messages | `Message[]` |
| members | `Enrollment[]` |
| pins | `ChannelPin[]` |

### Message

| Field | Notes |
|-------|-------|
| id | `@id @default(cuid())` |
| channelId | |
| senderId | |
| senderName | |
| senderAvatarUrl | |
| text | |
| priority | `@default("normal")` |
| contextSummary | |
| contextHighlights | |
| contextSuggestions | |
| contextTagline | |
| contextMeta | |
| createdAt | `@default(now())` |
| channel | `Channel @relation(fields: [channelId], references: [id])` |
| sender | `User? @relation(fields: [senderId], references: [id])` |
| pins | `ChannelPin[]` |

### ChannelPin

| Field | Notes |
|-------|-------|
| id | `@id @default(cuid())` |
| channelId | |
| messageId | |
| pinnedById | |
| pinnedByName | |
| pinnedAt | `@default(now())` |
| channel | `Channel @relation(fields: [channelId], references: [id])` |
| message | `Message @relation(fields: [messageId], references: [id])` |
| (index) | `@@unique([channelId, messageId])` |

### Subject

| Field | Notes |
|-------|-------|
| id | `@id` |
| name | |
| users | `Enrollment[]` |

### Enrollment

| Field | Notes |
|-------|-------|
| id | `@id @default(cuid())` |
| userId | |
| subjectId | |
| channelId | |
| createdAt | `@default(now())` |
| user | `User @relation(fields: [userId], references: [id])` |
| subject | `Subject? @relation(fields: [subjectId], references: [id])` |
| channel | `Channel? @relation(fields: [channelId], references: [id])` |

### UserRole

| Field | Notes |
|-------|-------|
| id | `@id @default(cuid())` |
| userId | |
| role | |
| user | `User @relation(fields: [userId], references: [id])` |

### Banner

| Field | Notes |
|-------|-------|
| id | `@id @default(cuid())` |
| title | |
| message | |
| kind | `@default("info")` |
| isActive | `@default(false)` |
| startsAt | |
| endsAt | |
| createdAt | `@default(now())` |
| updatedAt | `@updatedAt` |
| createdBy | |
| creator | `User? @relation(fields: [createdBy], references: [id])` |
| targets | `BannerTarget[]` |
| userTargets | `BannerUserTarget[]` |

### BannerTarget

| Field | Notes |
|-------|-------|
| id | `@id @default(cuid())` |
| bannerId | |
| targetType | |
| targetValue | |
| banner | `Banner @relation(fields: [bannerId], references: [id])` |

### BannerUserTarget

| Field | Notes |
|-------|-------|
| id | `@id @default(cuid())` |
| bannerId | |
| userId | |
| banner | `Banner @relation(fields: [bannerId], references: [id])` |
| user | `User @relation(fields: [userId], references: [id])` |

### ActivityLog

| Field | Notes |
|-------|-------|
| id | `@id @default(cuid())` |
| kind | |
| actorId | |
| actorName | |
| subjectType | |
| subjectId | |
| message | |
| data | |
| createdAt | `@default(now())` |
| (index) | `@@index([createdAt])` |
| (index) | `@@index([kind, createdAt])` |

## Relationship Diagram (Conceptual View)

```mermaid
erDiagram
  USER ||--o{ MESSAGE : sends
  CHANNEL ||--o{ MESSAGE : contains
  CHANNEL ||--o{ ENROLLMENT : has
  USER ||--o{ ENROLLMENT : joins
  SUBJECT ||--o{ ENROLLMENT : includes
  USER ||--o{ USERROLE : assigned
  USER ||--o{ BANNER : creates
  BANNER ||--o{ BANNERTARGET : targets
  BANNER ||--o{ BANNERUSERTARGET : targets
  USER ||--o{ BANNERUSERTARGET : receives
  CHANNEL ||--o{ CHANNELPIN : stores
  MESSAGE ||--o{ CHANNELPIN : isPinned
  USER ||--o{ ACTIVITYLOG : triggers
```

> Copy the `erDiagram` snippet into [https://mermaid.live](https://mermaid.live) or any Mermaid-enabled editor to export PNG/SVG.

## Relationship Diagram Without Attribute Types

Mermaid's `erDiagram` syntax expects a type token before each attribute name. For a relationship-only view, use a simple graph representation:

```mermaid
graph TD
  USER -->|sends| MESSAGE
  CHANNEL -->|contains| MESSAGE
  CHANNEL -->|has| ENROLLMENT
  USER -->|joins| ENROLLMENT
  SUBJECT -->|includes| ENROLLMENT
  USER -->|assigned| USERROLE
  USER -->|creates| BANNER
  BANNER -->|targets| BANNERTARGET
  BANNER -->|targets| BANNERUSERTARGET
  USER -->|receives| BANNERUSERTARGET
  CHANNEL -->|stores| CHANNELPIN
  MESSAGE -->|is pinned by| CHANNELPIN
  USER -->|triggers| ACTIVITYLOG
```

> Use the `graph TD` snippet in [https://mermaid.live](https://mermaid.live) or any Mermaid-enabled editor to render and export a diagram without attribute listings.

## Relationship Diagram with Entity Boxes (Hidden Types)

If you prefer the table-style ERD boxes but do not want to display data types, hide the type column with a Mermaid init directive:

```mermaid
%%{init: {'themeCSS': '.er .attributeType { display: none; } .er .attributeName { padding-left: 0.75rem; }'}}%%
erDiagram
  USER ||--o{ MESSAGE : sends
  CHANNEL ||--o{ MESSAGE : contains
  CHANNEL ||--o{ ENROLLMENT : has
  USER ||--o{ ENROLLMENT : joins
  SUBJECT ||--o{ ENROLLMENT : includes
  USER ||--o{ USERROLE : assigned
  USER ||--o{ BANNER : creates
  BANNER ||--o{ BANNERTARGET : targets
  BANNER ||--o{ BANNERUSERTARGET : targets
  USER ||--o{ BANNERUSERTARGET : receives
  CHANNEL ||--o{ CHANNELPIN : stores
  MESSAGE ||--o{ CHANNELPIN : isPinned
  USER ||--o{ ACTIVITYLOG : triggers

  USER {
    VARCHAR id
    VARCHAR email
    VARCHAR passwordHash
    VARCHAR name
    VARCHAR nickname
    VARCHAR studentId
    VARCHAR yearLevel
    VARCHAR block
    VARCHAR profession
    VARCHAR schedule
    VARCHAR avatarUrl
    DATETIME createdAt
    DATETIME updatedAt
  }
  CHANNEL {
    VARCHAR id
    VARCHAR name
    VARCHAR topic
    VARCHAR kind
    DATETIME createdAt
  }
  MESSAGE {
    VARCHAR id
    VARCHAR channelId
    VARCHAR senderId
    VARCHAR senderName
    VARCHAR senderAvatarUrl
    TEXT text
    VARCHAR priority
    TEXT contextSummary
    TEXT contextHighlights
    TEXT contextSuggestions
    TEXT contextTagline
    TEXT contextMeta
    DATETIME createdAt
  }
  CHANNELPIN {
    VARCHAR id
    VARCHAR channelId
    VARCHAR messageId
    VARCHAR pinnedById
    VARCHAR pinnedByName
    DATETIME pinnedAt
  }
  SUBJECT {
    VARCHAR id
    VARCHAR name
  }
  ENROLLMENT {
    VARCHAR id
    VARCHAR userId
    VARCHAR subjectId
    VARCHAR channelId
    DATETIME createdAt
  }
  USERROLE {
    VARCHAR id
    VARCHAR userId
    VARCHAR role
  }
  BANNER {
    VARCHAR id
    VARCHAR title
    TEXT message
    VARCHAR kind
    BOOLEAN isActive
    DATETIME startsAt
    DATETIME endsAt
    DATETIME createdAt
    DATETIME updatedAt
    VARCHAR createdBy
  }
  BANNERTARGET {
    VARCHAR id
    VARCHAR bannerId
    VARCHAR targetType
    VARCHAR targetValue
  }
  BANNERUSERTARGET {
    VARCHAR id
    VARCHAR bannerId
    VARCHAR userId
  }
  ACTIVITYLOG {
    VARCHAR id
    VARCHAR kind
    VARCHAR actorId
    VARCHAR actorName
    VARCHAR subjectType
    VARCHAR subjectId
    TEXT message
    TEXT data
    DATETIME createdAt
  }
```

> Paste this snippet into [https://mermaid.live](https://mermaid.live) to render table-style boxes with the type column hidden.

## Relationship Diagram with Attribute-Only Boxes (Class Diagram)

Mermaid's `classDiagram` lets you list attributes without type tokens while still using boxes. Relationships are added at the end.

```mermaid
classDiagram
  direction TB

  class User {
    id
    email
    passwordHash
    name
    nickname
    studentId
    yearLevel
    block
    profession
    schedule
    avatarUrl
    createdAt
    updatedAt
  }

  class Channel {
    id
    name
    topic
    kind
    createdAt
  }

  class Message {
    id
    channelId
    senderId
    senderName
    senderAvatarUrl
    text
    priority
    contextSummary
    contextHighlights
    contextSuggestions
    contextTagline
    contextMeta
    createdAt
  }

  class ChannelPin {
    id
    channelId
    messageId
    pinnedById
    pinnedByName
    pinnedAt
  }

  class Subject {
    id
    name
  }

  class Enrollment {
    id
    userId
    subjectId
    channelId
    createdAt
  }

  class UserRole {
    id
    userId
    role
  }

  class Banner {
    id
    title
    message
    kind
    isActive
    startsAt
    endsAt
    createdAt
    updatedAt
    createdBy
  }

  class BannerTarget {
    id
    bannerId
    targetType
    targetValue
  }

  class BannerUserTarget {
    id
    bannerId
    userId
  }

  class ActivityLog {
    id
    kind
    actorId
    actorName
    subjectType
    subjectId
    message
    data
    createdAt
  }

  User "1" --> "*" Message : sends
  Channel "1" --> "*" Message : contains
  Channel "1" --> "*" Enrollment : has
  User "1" --> "*" Enrollment : joins
  Subject "1" --> "*" Enrollment : includes
  User "1" --> "*" UserRole : assigned
  User "1" --> "*" Banner : creates
  Banner "1" --> "*" BannerTarget : targets
  Banner "1" --> "*" BannerUserTarget : targets
  User "1" --> "*" BannerUserTarget : receives
  Channel "1" --> "*" ChannelPin : stores
  Message "1" --> "*" ChannelPin : pinnedBy
  User "1" --> "*" ActivityLog : optional
```

> Paste the `classDiagram` block into [https://mermaid.live](https://mermaid.live) to render attribute-only entity boxes.
