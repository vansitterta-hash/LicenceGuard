import { finishPendingDraftSaves } from '../utils/draftSaveQueue';
import { acceptPasswordRecovery, isPasswordRecoveryUrl } from '../services/passwordService';
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
  role: 'owner' | 'administrator' | 'staff' | 'tester';
  fullName: string | null;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  dealerProfile: DealerProfile | null;
  loading: boolean;
  recovery: boolean;
  recoveryError: string | null;
  finishRecovery: () => Promise<void>;
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
  const [recovery, setRecovery] = useState(() => typeof window !== 'undefined' && isPasswordRecoveryUrl(window.location.href));
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
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

    if (membership.role === 'tester') {
      setDealerProfile(null);
      throw new Error(
        'Tester accounts must use a dedicated test workspace. Production personal data is not available in this workspace.'
      );
    }

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
        if (typeof window !== 'undefined' && isPasswordRecoveryUrl(window.location.href)) {
          try {
            await acceptPasswordRecovery(window.location.href, window.sessionStorage.getItem('licenceguard-password-recovery') === '1');
            window.sessionStorage.setItem('licenceguard-password-recovery', '1');
          } catch (error) {
            setRecoveryError(error instanceof Error ? error.message : 'This reset link is invalid or has expired.');
          } finally {
            window.history.replaceState(null, '', window.location.pathname + '?reset-password=1');
          }
        }
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
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (!nextSession) { setDealerProfile(null); return; }
      // Leave the Supabase auth callback before making database requests.
      // Token refresh and USER_UPDATED must not unmount an active application form.
      if (event === 'SIGNED_IN') setTimeout(() => {
        if (mounted) void loadDealerProfile(nextSession.user.id).catch((error) => {
          console.error('Unable to load dealer membership:', error);
          setDealerProfile(null);
        });
      }, 0);
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
    await finishPendingDraftSaves();
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

  const finishRecovery = async () => {
    await signOut();
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem('licenceguard-password-recovery');
      window.history.replaceState(null, '', window.location.pathname);
    }
    setRecovery(false); setRecoveryError(null);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      recovery, recoveryError, finishRecovery,
      session,
      user: session?.user ?? null,
      dealerProfile,
      loading,
      signIn,
      signOut,
    }),
    [dealerProfile, loading, session, recovery, recoveryError]
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