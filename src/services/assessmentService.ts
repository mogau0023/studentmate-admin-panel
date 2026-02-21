import { 
  collection, 
  addDoc, 
  updateDoc,
  deleteDoc, 
  doc, 
  getDocs, 
  serverTimestamp,
  query,
  where,
  orderBy,
  limit,
  getCountFromServer
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { Assessment, AssessmentType, Question } from '../types';

const COLLECTION_NAME = 'assessments';

export const getAssessments = async (universityId: string, moduleId: string, type: AssessmentType) => {
  const q = query(
    collection(db, COLLECTION_NAME), 
    where('universityId', '==', universityId),
    where('moduleId', '==', moduleId),
    where('type', '==', type),
    orderBy('year', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    assessmentId: doc.id,
    ...doc.data() as any
  } as Assessment));
};

export const getRecentAssessments = async (limitCount = 5) => {
  const q = query(
    collection(db, COLLECTION_NAME), 
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    assessmentId: doc.id,
    ...doc.data() as any
  } as Assessment));
};

export const getDashboardStats = async () => {
  const coll = collection(db, COLLECTION_NAME);
  
  const examsSnapshot = await getCountFromServer(query(coll, where('type', '==', 'exam')));
  const testsSnapshot = await getCountFromServer(query(coll, where('type', '==', 'test')));
  const suppsSnapshot = await getCountFromServer(query(coll, where('type', '==', 'supplementary')));

  return {
    exams: examsSnapshot.data().count,
    tests: testsSnapshot.data().count,
    supps: suppsSnapshot.data().count
  };
};

export const addAssessment = async (
  universityId: string, 
  moduleId: string, 
  type: AssessmentType,
  title: string,
  year: number,
  createdBy: string,
  pdfFile?: File | null,
) => {
  let pdfUrl = '';

  if (pdfFile) {
    const storageRef = ref(storage, `assessments/${universityId}/${moduleId}/${type}/${Date.now()}_${pdfFile.name}`);
    await uploadBytes(storageRef, pdfFile);
    pdfUrl = await getDownloadURL(storageRef);
  }

  const docRef = await addDoc(collection(db, COLLECTION_NAME), {
    universityId,
    moduleId,
    type,
    title,
    year,
    pdfUrl: pdfUrl || null,
    createdBy,
    createdAt: serverTimestamp()
  });

  return docRef.id;
};

export const deleteAssessment = async (assessment: Assessment) => {
  // Delete PDF from storage if exists
  if (assessment.pdfUrl) {
    try {
      const storageRef = ref(storage, assessment.pdfUrl);
      await deleteObject(storageRef);
    } catch (error) {
      console.error('Error deleting file from storage:', error);
    }
  }

  // Also need to delete all sub-questions? 
  // Firestore doesn't auto-delete subcollections. 
  // For now, we will leave them orphaned or implement cloud function cleanup later.

  // Delete document from Firestore
  await deleteDoc(doc(db, COLLECTION_NAME, assessment.assessmentId));
};

export const updateQuestion = async (
  assessmentId: string,
  questionId: string,
  data: Partial<Question>,
  contentFile?: File | null,
  answerFile?: File | null,
  deleteAnswerImage: boolean = false
) => {
  const updates: any = { ...data };

  // Upload Content Image if provided
  if (contentFile) {
    const contentStorageRef = ref(storage, `questions/${assessmentId}/${Date.now()}_content_${contentFile.name}`);
    await uploadBytes(contentStorageRef, contentFile);
    updates.contentUrl = await getDownloadURL(contentStorageRef);
  }

  // Handle Answer Image
  if (answerFile) {
    // Upload new one
    const answerStorageRef = ref(storage, `questions/${assessmentId}/${Date.now()}_answer_${answerFile.name}`);
    await uploadBytes(answerStorageRef, answerFile);
    updates.answerUrl = await getDownloadURL(answerStorageRef);
  } else if (deleteAnswerImage) {
    // Explicitly delete existing answer
    updates.answerUrl = null;
    // Note: We should ideally delete the old file from storage too, but we need the old URL to do that.
    // For now, nullifying the DB reference is sufficient to "remove" it from the UI.
  }

  await updateDoc(doc(db, COLLECTION_NAME, assessmentId, 'questions', questionId), updates);
};

// --- Question Management ---

export const getQuestions = async (assessmentId: string) => {
  const q = query(
    collection(db, COLLECTION_NAME, assessmentId, 'questions'),
    orderBy('order', 'asc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    questionId: doc.id,
    ...doc.data() as any
  } as Question));
};

export const addQuestion = async (
  assessmentId: string,
  title: string,
  marks: number,
  order: number,
  contentFile?: File | null,
  content?: string,
  answerFile?: File | null,
  answerText?: string,
  videoUrl?: string,
  page?: number,
  coordinates?: { yStart: number; yEnd: number }
) => {
  let contentUrl = '';
  
  // Upload Content Image if provided
  if (contentFile) {
    const contentStorageRef = ref(storage, `questions/${assessmentId}/${Date.now()}_content_${contentFile.name}`);
    await uploadBytes(contentStorageRef, contentFile);
    contentUrl = await getDownloadURL(contentStorageRef);
  }

  let answerUrl = '';
  if (answerFile) {
    const answerStorageRef = ref(storage, `questions/${assessmentId}/${Date.now()}_answer_${answerFile.name}`);
    await uploadBytes(answerStorageRef, answerFile);
    answerUrl = await getDownloadURL(answerStorageRef);
  }

  await addDoc(collection(db, COLLECTION_NAME, assessmentId, 'questions'), {
    title,
    marks,
    order,
    contentUrl: contentUrl || null,
    content: content || null,
    answerUrl: answerUrl || null,
    answerText: answerText || null,
    videoUrl: videoUrl || null,
    page: page || null,
    coordinates: coordinates || null,
    createdAt: serverTimestamp()
  });
};

export const deleteQuestion = async (assessmentId: string, question: Question) => {
  // Delete Content Image
  if (question.contentUrl) {
    try {
      const contentRef = ref(storage, question.contentUrl);
      await deleteObject(contentRef);
    } catch (e) {
      console.error('Error deleting content image', e);
    }
  }

  // Delete Answer Image
  if (question.answerUrl) {
    try {
      const answerRef = ref(storage, question.answerUrl);
      await deleteObject(answerRef);
    } catch (e) {
      console.error('Error deleting answer image', e);
    }
  }

  await deleteDoc(doc(db, COLLECTION_NAME, assessmentId, 'questions', question.questionId));
};
