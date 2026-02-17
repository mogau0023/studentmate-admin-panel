import { 
  collection, 
  addDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  serverTimestamp,
  query,
  where,
  orderBy,
  updateDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Announcement } from '../types';

const COLLECTION_NAME = 'announcements';

export const getAnnouncements = async () => {
  const q = query(collection(db, COLLECTION_NAME), orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    announcementId: doc.id,
    ...doc.data() as any
  } as Announcement));
};

export const addAnnouncement = async (title: string, message: string, universityId: string, active: boolean) => {
  const docRef = await addDoc(collection(db, COLLECTION_NAME), {
    title,
    message,
    universityId,
    active,
    createdAt: serverTimestamp()
  });
  return docRef.id;
};

export const updateAnnouncementStatus = async (id: string, active: boolean) => {
  await updateDoc(doc(db, COLLECTION_NAME, id), { active });
};

export const deleteAnnouncement = async (id: string) => {
  await deleteDoc(doc(db, COLLECTION_NAME, id));
};
