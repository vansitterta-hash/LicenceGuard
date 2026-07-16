import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type DealerProfile = {
  dealerId: string;
  dealerName: string;
  role: 'owner' | 'administrator' | 'staff';
  fullName: string | null;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  dealerProfile: DealerProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthProviderProps = {
  children: ReactNode;
};

type DealerUserRow = {
  dealer_id: string;
  role: DealerProfile['role'];
  full_name: string | null;
  dealers:
    | {
        name: string;
      }
    | Array<{
        name: string;
      }>
    | null;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [dealerProfile, setDealerProfile] =
    useState<DealerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDealerProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('dealer_users')
      .select(
        `
        dealer_id,
        role,
        full_name,
        dealers (
          name
        )
      `
      )
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(2);

    if (error) {
      throw new Error(error.message);
    }

    const rows = (data ?? []) as DealerUserRow[];

    if (rows.length === 0) {
      setDealerProfile(null);
      throw new Error(
        'This user is not linked to an active LicenceGuard dealer.'
      );
    }

    if (rows.length > 1) {
      setDealerProfile(null);
      throw new Error(
        'This user is linked to more than one active dealer. Resolve the duplicate dealer membership before continuing.'
      );
    }

    const membership = rows[0];
    const dealer = Array.isArray(membership.dealers)
      ? membership.dealers[0]
      : membership.dealers;

    if (!dealer) {
      setDealerProfile(null);
      throw new Error(
        'The active dealer membership is not linked to a valid dealer record.'
      );
    }

    setDealerProfile({
      dealerId: membership.dealer_id,
      dealerName: dealer.name,
      role: membership.role,
      fullName: membership.full_name,
    });
  };

  useEffect(() => {
    let mounted = true;

    const initialise = async () => {
      try {
        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession();

        if (!mounted) {
          return;
        }

        setSession(currentSession);

        if (currentSession?.user) {
          await loadDealerProfile(currentSession.user.id);
        } else {
          setDealerProfile(null);
        }
      } catch (error) {
        console.error('LicenceGuard authentication initialisation failed:', error);
        setDealerProfile(null);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void initialise();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setLoading(true);
      setSession(nextSession);

      try {
        if (nextSession?.user) {
          await loadDealerProfile(nextSession.user.id);
        } else {
          setDealerProfile(null);
        }
      } finally {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data.user) {
        throw new Error(
          'Login succeeded, but no user account was returned.'
        );
      }

      await loadDealerProfile(data.user.id);
    } catch (error) {
      await supabase.auth.signOut();
      setSession(null);
      setDealerProfile(null);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw new Error(error.message);
      }

      setSession(null);
      setDealerProfile(null);
    } finally {
      setLoading(false);
    }
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      dealerProfile,
      loading,
      signIn,
      signOut,
    }),
    [dealerProfile, loading, session]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }

  return context;
}