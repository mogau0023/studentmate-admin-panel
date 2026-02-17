import { create } from 'zustand';
import { User as FirebaseUser } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Admin } from '../types';

interface AuthState {
  user: FirebaseUser | null;
  adminProfile: Admin | null;
  loading: boolean;
  setUser: (user: FirebaseUser | null) => void;
  setAdminProfile: (profile: Admin | null) => void;
  setLoading: (loading: boolean) => void;
  checkUserRole: (uid: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  adminProfile: null,
  loading: true,
  setUser: (user) => set({ user }),
  setAdminProfile: (adminProfile) => set({ adminProfile }),
  setLoading: (loading) => set({ loading }),
  checkUserRole: async (uid: string) => {
    try {
      const adminDoc = await getDoc(doc(db, 'admins', uid));
      if (adminDoc.exists()) {
        set({ adminProfile: adminDoc.data() as Admin });
      } else {
        set({ adminProfile: null });
      }
    } catch (error: any) {
      console.error('Error fetching admin profile:', error);
      if (error.code === 'permission-denied') {
        console.error('Check your Firestore Security Rules. You might not have permission to read the "admins" collection.');
      }
      set({ adminProfile: null });
    }
  },
}));
