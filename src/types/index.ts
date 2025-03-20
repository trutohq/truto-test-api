export interface PaginatedResponse<T> {
  data: T[];
  next_cursor: string;
  prev_cursor: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface BaseEntity {
  id: number;
  created_at: string;
  updated_at: string;
}

export interface RateLimit {
  api_key: string;
  count: number;
  reset_time: number;
  created_at: string;
  updated_at: string;
}

export interface ApiKey {
  id: number;
  key: string;
  user_id: number;
  created_at: string;
  last_used_at?: string;
}

export interface Organization extends BaseEntity {
  name: string;
  slug: string;
}

export interface User extends BaseEntity {
  email: string;
  name: string;
  organization_id: number;
  role: 'admin' | 'agent';
  organization: Organization;
}

export interface Team extends BaseEntity {
  name: string;
  organization_id: number;
  members: User[];
}

export interface ContactEmail extends BaseEntity {
  contact_id: number;
  email: string;
  is_primary: boolean;
}

export interface ContactPhone extends BaseEntity {
  contact_id: number;
  phone: string;
  is_primary: boolean;
}

export interface Contact extends BaseEntity {
  name: string;
  organization_id: number;
  emails: ContactEmail[];
  phones: ContactPhone[];
}

export type TicketStatus = 'open' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high';

export interface Ticket extends BaseEntity {
  subject: string;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  assignee_id: number | null;
  contact_id: number | null;
  organization_id: number;
  closed_at: string | null;
  
  // Populated fields
  assignee?: User;
  contact?: Contact;
  attachments?: Attachment[];
}

export interface CreateTicket {
  subject: string;
  description?: string;
  assignee_id?: number;
  contact_id?: number;
  organization_id: number;
  priority?: TicketPriority;
  status?: TicketStatus;
  created_at?: string;
  closed_at?: string;
}

export interface UpdateTicket {
  subject?: string;
  description?: string;
  assignee_id?: number | null;
  contact_id?: number | null;
  priority?: TicketPriority;
  status?: TicketStatus;
}

export type AuthorType = 'user' | 'contact';

export interface Comment extends BaseEntity {
  ticket_id: number;
  body: string;
  body_html: string;
  is_private: boolean;
  author_type: AuthorType;
  author_id: number;
  organization_id: number;
  
  // Populated fields
  author?: User | Contact;
  attachments?: Attachment[];
}

export interface CreateComment {
  ticket_id: number;
  body: string;
  is_private?: boolean;
  author_type: AuthorType;
  author_id: number;
  organization_id: number;
}

export interface UpdateComment {
  body?: string;
  is_private?: boolean;
}

export interface Attachment extends BaseEntity {
  file_name: string;
  content_type: string;
  size: number;
  file_path: string;
  organization_id: number;
}

export interface CreateAttachment {
  file_name: string;
  content_type: string;
  size: number;
  file_path: string;
  organization_id: number;
} 