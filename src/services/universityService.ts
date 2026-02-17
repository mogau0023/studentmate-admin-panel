import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  serverTimestamp,
  query,
  orderBy
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { University } from '../types';

const COLLECTION_NAME = 'universities';

export const getUniversities = async () => {
  const q = query(collection(db, COLLECTION_NAME), orderBy('name'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    universityId: doc.id,
    ...doc.data() as any
  } as University));
};

export const addUniversity = async (name: string, code: string, logoFile: File | null) => {
  let logoUrl = '';
  
  if (logoFile) {
    const storageRef = ref(storage, `university-logos/${Date.now()}_${logoFile.name}`);
    await uploadBytes(storageRef, logoFile);
    logoUrl = await getDownloadURL(storageRef);
  }

  const docRef = await addDoc(collection(db, COLLECTION_NAME), {
    name,
    code,
    logoUrl,
    createdAt: serverTimestamp()
  });

  return docRef.id;
};

export const updateUniversity = async (id: string, data: Partial<University>, logoFile?: File | null) => {
  let updateData = { ...data };

  if (logoFile) {
    const storageRef = ref(storage, `university-logos/${Date.now()}_${logoFile.name}`);
    await uploadBytes(storageRef, logoFile);
    updateData.logoUrl = await getDownloadURL(storageRef);
  }

  await updateDoc(doc(db, COLLECTION_NAME, id), updateData);
};

export const deleteUniversity = async (id: string) => {
  await deleteDoc(doc(db, COLLECTION_NAME, id));
};
