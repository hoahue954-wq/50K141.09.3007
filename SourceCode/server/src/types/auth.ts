import type { RoleCode, ProfileStatus } from '@prisma/client';

export interface AuthenticatedProfile {
  id: string;
  username: string;
  fullName: string;
  status: ProfileStatus;
  createdAt: Date;
  role: {
    id: string;
    code: RoleCode;
    name: string;
  };
}

export interface ApiUserProfile {
  id: string;
  username: string;
  full_name: string;
  role: 'owner' | 'staff';
  status: 'active' | 'locked';
  created_at: string;
}

declare global {
  namespace Express {
    interface Locals {
      authProfile?: AuthenticatedProfile;
    }
  }
}
