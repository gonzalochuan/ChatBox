export type ChannelKind = "general" | "subject" | "section" | "section-subject" | "section-group" | "dm" | "announcement";

export interface Channel {
  id: string;
  name: string;
  topic?: string;
  kind: ChannelKind;
  meta?: Record<string, unknown>;
  pins?: PinnedMessageInfo[];
}

export type MessagePriority = "normal" | "high" | "emergency";

export interface MessageContextMeta {
  filename: string;
  size: number;
  mimetype: string;
}

export interface MessageContext {
  summary: string;
  highlights: string[];
  suggestions: string[];
  tagline: string;
  meta: MessageContextMeta;
}

export interface Message {
  id: string;
  channelId: string;
  senderId: string; // may be empty when guest
  senderName: string;
  senderAvatarUrl?: string | null;
  senderSocketId?: string; // present on live socket events for ownership
  text: string;
  createdAt: number; // epoch ms
  priority: MessagePriority;
  senderIsTeacher?: boolean;
  context?: MessageContext | null;
}

export interface PinnedMessageInfo {
  id: string;
  message: Message;
  pinnedById: string | null;
  pinnedByName: string | null;
  pinnedAt: number | null;
}

export type BannerKind = "info" | "success" | "error";

export interface Banner {
  id: string;
  title: string;
  message: string;
  kind: BannerKind;
  isActive: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityLog {
  id: string;
  kind: string;
  actorId?: string | null;
  actorName?: string | null;
  subjectType?: string | null;
  subjectId?: string | null;
  message: string;
  data?: any;
  createdAt: string;
}
