import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import type { User as FirebaseUser } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

export type UserRole = "superadmin" | "community_admin" | "customer";
export type UserPlan = "free" | "pro" | "enterprise";

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  plan: UserPlan;
  community_id?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (
    email: string,
    password: string,
  ) => Promise<{ success: boolean; user?: User; error?: string }>;
  signup: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Extract user metadata from Firestore profile
  const extractUser = useCallback(
    (firebaseUser: FirebaseUser, profile?: any): User => {
      // Support both 'display_name' and 'full_name' field names
      const displayName =
        profile?.display_name ||
        profile?.full_name ||
        firebaseUser.displayName ||
        firebaseUser.email?.split("@")[0] ||
        "User";

      // Normalize role: trim whitespace and collapse "super admin" → "superadmin"
      // This handles the known Firestore typo without hardcoding any user
      let rawRole = (profile?.role as string) || "customer";
      const role: UserRole = rawRole
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "") as UserRole;


      return {
        id: firebaseUser.uid,
        email: firebaseUser.email || "",
        displayName,
        role,
        plan: (profile?.plan as UserPlan) || "pro",
        community_id: profile?.community_id,
      };
    },
    [],
  );

  const fetchProfile = useCallback(
    async (firebaseUser: FirebaseUser) => {
      try {
        let profileData = null;
        const superadminRef = doc(db, "superadmins", firebaseUser.uid);
        const superadminSnap = await getDoc(superadminRef);

        if (superadminSnap.exists()) {
          profileData = superadminSnap.data();
        } else {
          const customerRef = doc(db, "customers", firebaseUser.uid);
          const customerSnap = await getDoc(customerRef);
          if (customerSnap.exists()) {
            profileData = customerSnap.data();
          }
        }

        if (profileData) {
          setUser(extractUser(firebaseUser, profileData));
        } else {
          setUser(extractUser(firebaseUser));
        }
      } catch (err) {
        console.error("[AuthContext] Error fetching profile:", err);
        setUser(extractUser(firebaseUser));
      } finally {
        setLoading(false);
      }
    },
    [extractUser],
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser: FirebaseUser | null) => {
        if (firebaseUser) {
          await fetchProfile(firebaseUser);
        } else {
          setUser(null);
          setLoading(false);
        }
      },
    );

    return () => unsubscribe();
  }, [fetchProfile]);

  const login = useCallback(
    async (
      email: string,
      password: string,
    ): Promise<{ success: boolean; user?: User; error?: string }> => {
      setLoading(true);
      try {
        const credential = await signInWithEmailAndPassword(
          auth,
          email,
          password,
        );

        if (credential.user) {
          let profileData = null;
          const superadminRef = doc(db, "superadmins", credential.user.uid);
          const superadminSnap = await getDoc(superadminRef);

          if (superadminSnap.exists()) {
            profileData = superadminSnap.data();
          } else {
            const customerRef = doc(db, "customers", credential.user.uid);
            const customerSnap = await getDoc(customerRef);
            if (customerSnap.exists()) {
              profileData = customerSnap.data();
            }
          }

          const finalUser = extractUser(credential.user, profileData);

          setUser(finalUser);
          setLoading(false);
          return { success: true, user: finalUser };
        }

        setLoading(false);
        return { success: false, error: "Login failed" };
      } catch (err: any) {
        setLoading(false);
        return {
          success: false,
          error: err.message || "Login failed",
        };
      }
    },
    [extractUser],
  );

  const signup = useCallback(
    async (
      email: string,
      password: string,
      displayName: string,
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const credential = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );

        if (credential.user) {
          // Set display name in Firebase Auth
          await updateProfile(credential.user, { displayName });

          // Create profile in Firestore
          const profile = {
            full_name: displayName,
            role: "customer",
            plan: "pro",
            created_at: new Date().toISOString(),
          };

          await setDoc(doc(db, "customers", credential.user.uid), profile);

          await fetchProfile(credential.user);
          return { success: true };
        }

        return { success: false, error: "Signup failed" };
      } catch (err: any) {
        return {
          success: false,
          error: err.message || "Signup failed",
        };
      }
    },
    [fetchProfile],
  );

  const logout = useCallback(async (): Promise<void> => {
    await signOut(auth);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loading,
        login,
        signup,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined)
    throw new Error("useAuth must be used within an AuthProvider");
  return context;
};
