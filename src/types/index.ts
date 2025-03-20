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