import { 
  collection, 
  getDocs, 
  query,
  where,
  orderBy,
  limit
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User } from '../types';

const COLLECTION_NAME = 'users';

export const getUsers = async (universityId?: string) => {
  let q;
  if (universityId) {
    q = query(
      collection(db, COLLECTION_NAME), 
      where('universityId', '==', universityId),
      orderBy('createdAt', 'desc')
    );
  } else {
    q = query(
      collection(db, COLLECTION_NAME), 
      orderBy('createdAt', 'desc'),
      limit(50) // Limit for performance
    );
  }
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    userId: doc.id,
    ...doc.data() as any
  } as User));
};
