/**
 * INSTRUCTIONS:
 * Replace the contents of src/types/index.ts with this file.
 * Only the Question interface has new fields — everything else is unchanged.
 */

import { Timestamp } from 'firebase/firestore';

export interface University {
  universityId: string;
  name: string;
  code: string;
  logoUrl: string;
  createdAt: Timestamp;
}

export interface Module {
  moduleId: string;
  code: string;
  name: string;
  universityId: string;
  createdAt: Timestamp;
}

export type AssessmentType = 'exam' | 'test' | 'supplementary';

export interface Assessment {
  assessmentId: string;
  moduleId: string;
  universityId: string;
  type: AssessmentType;
  title: string;
  year: number;
  pdfUrl?: string;
  createdAt: Timestamp;
  createdBy: string;
}

export interface Question {
  questionId: string;
  title: string;
  contentUrl?: string;
  content?: string;
  answerUrl?: string;
  answerText?: string;        // existing
  aiAnswerText?: string;      // ✅ NEW: AI-generated answer (before teacher verification)
  aiAnswerVerified?: boolean; // ✅ NEW: true once teacher approves/edits
  videoUrl?: string;
  marks: number;
  order: number;
  page?: number;
  coordinates?: {
    yStart: number;
    yEnd: number;
  };
  // ✅ NEW: Topic classification fields
  primaryTopic?: string;      // e.g. "Algebra"
  subTopic?: string;          // e.g. "Quadratic equations"
  topicConfidence?: number;   // 0–1, how confident the AI classifier was
  createdAt: Timestamp;
}

export interface User {
  userId: string;
  name: string;
  email: string;
  universityId: string;
  points: number;
  subscriptionActive: boolean;
  createdAt: Timestamp;
}

export interface Announcement {
  announcementId: string;
  title: string;
  message: string;
  universityId: string;
  active: boolean;
  createdAt: Timestamp;
}

export type AdminRole = 'superadmin' | 'university_admin';

export interface Admin {
  adminId: string;
  email: string;
  role: AdminRole;
  universityId?: string;
  universityName?: string;
}