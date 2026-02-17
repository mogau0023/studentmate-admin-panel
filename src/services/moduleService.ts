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
  orderBy
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Module } from '../types';

const COLLECTION_NAME = 'modules';

export const getModulesByUniversity = async (universityId: string) => {
  const q = query(
    collection(db, COLLECTION_NAME), 
    where('universityId', '==', universityId),
    orderBy('code')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    moduleId: doc.id,
    ...doc.data() as any
  } as Module));
};

export const addModule = async (universityId: string, code: string, name: string) => {
  const docRef = await addDoc(collection(db, COLLECTION_NAME), {
    universityId,
    code,
    name,
    createdAt: serverTimestamp()
  });
  return docRef.id;
};

export const updateModule = async (id: string, data: Partial<Module>) => {
  await updateDoc(doc(db, COLLECTION_NAME, id), data);
};

export const deleteModule = async (id: string) => {
  await deleteDoc(doc(db, COLLECTION_NAME, id));
};
