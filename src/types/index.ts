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
  moduleId: string; // This now stores the module code (e.g., "SMTH011") instead of the document ID
  universityId: string;
  type: AssessmentType;
  title: string;
  year: number;
  pdfUrl?: string; // Made optional as we might have question-based assessments only
  createdAt: Timestamp;
  createdBy: string;
}

export interface Question {
  questionId: string;
  title: string;
  contentUrl?: string; // Image URL of the question (optional if content is provided)
  content?: string;    // Text content of the question
  answerUrl?: string;  // Image URL of the answer (optional)
  answerText?: string; // Text content of the answer (optional)
  videoUrl?: string;   // YouTube/Vimeo link (optional)
  marks: number;
  order: number;
  // New fields for PDF parsing
  page?: number;       // Page number in the original PDF
  coordinates?: {      // Coordinates for rendering/cropping
    yStart: number;
    yEnd: number;
  };
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
