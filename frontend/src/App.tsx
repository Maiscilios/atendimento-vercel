import { useEffect, useState } from 'react';
import { AttendanceForm } from './components/AttendanceForm';
import { DudaPanel } from './components/DudaPanel';
import { HomeScreen } from './components/HomeScreen';
import { InterestedLeadForm } from './components/InterestedLeadForm';
import { LaisAdminPanel } from './components/LaisAdminPanel';
import { LoginScreen } from './components/LoginScreen';
import { PublicPreBookingForm } from './components/PublicPreBookingForm';
import { fetchCurrentUser, logoutRequest } from './lib/api';
import type { AuthUser, Professional } from '../../shared/catalog';

export interface PanelDeepLink {
  token: number;
  tab: 'appointments' | 'agenda';
  returnRequestId?: string | null;
  appointmentId?: string | null;
  targetDate?: string | null;
  targetProfessional?: Professional | null;
}

type ViewState =
  | { screen: 'home' }
  | { screen: 'form'; professional: Professional }
  | { screen: 'pre-booking' }
  | { screen: 'interested' }
  | { screen: 'login' }
  | { screen: 'panel' };

function parseDeepLinkFromSearch(): PanelDeepLink | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const rawTab = params.get('notifTab');
  const reqId = params.get('notifReqId');
  const apptId = params.get('notifApptId');
  const targetDate = params.get('notifDate');
  const rawProf = params.get('notifProf');

  if (!rawTab && !reqId && !apptId && !targetDate) {
    return null;
  }

  const tab: 'appointments' | 'agenda' =
    rawTab === 'agenda' ? 'agenda' : 'appointments';
  const targetProfessional: Professional | null =
    rawProf === 'lais' || rawProf === 'duda' ? rawProf : null;

  params.delete('notifTab');
  params.delete('notifReqId');
  params.delete('notifApptId');
  params.delete('notifDate');
  params.delete('notifProf');
  const nextQs = params.toString();
  const nextUrl =
    window.location.pathname +
    (nextQs ? `?${nextQs}` : '') +
    window.location.hash;
  window.history.replaceState({}, '', nextUrl);

  return {
    token: Date.now(),
    tab,
    returnRequestId: reqId,
    appointmentId: apptId,
    targetDate,
    targetProfessional,
  };
}

export default function App() {
  const [view, setView] = useState<ViewState>({ screen: 'home' });
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [pendingDeepLink, setPendingDeepLink] = useState<PanelDeepLink | null>(
    () => parseDeepLinkFromSearch(),
  );

  useEffect(() => {
    let active = true;
    fetchCurrentUser()
      .then((user) => {
        if (active) {
          setCurrentUser(user);
        }
      })
      .catch(() => {
        if (active) {
          setCurrentUser(null);
        }
      })
      .finally(() => {
        if (active) {
          setAuthChecked(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!authChecked || !pendingDeepLink) return;

    if (!currentUser) {
      setView({ screen: 'login' });
      return;
    }

    const canAccessTarget =
      currentUser.role === 'admin' ||
      !pendingDeepLink.targetProfessional ||
      pendingDeepLink.targetProfessional === currentUser.professional;

    if (canAccessTarget) {
      setView({ screen: 'panel' });
    }
  }, [authChecked, currentUser, pendingDeepLink]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const handleSwMessage = (event: MessageEvent) => {
      const payload = event.data as {
        type?: string;
        data?: {
          targetTab?: string | null;
          relatedReturnRequestId?: string | null;
          relatedAppointmentId?: string | null;
          targetDate?: string | null;
          targetProfessional?: string | null;
        };
      } | null;

      if (payload?.type !== 'MAIS_CILIOS_NOTIFICATION_CLICK' || !payload.data) {
        return;
      }

      const d = payload.data;
      const targetProf: Professional | null =
        d.targetProfessional === 'lais' || d.targetProfessional === 'duda'
          ? d.targetProfessional
          : null;

      setPendingDeepLink({
        token: Date.now(),
        tab: d.targetTab === 'agenda' ? 'agenda' : 'appointments',
        returnRequestId: d.relatedReturnRequestId ?? null,
        appointmentId: d.relatedAppointmentId ?? null,
        targetDate: d.targetDate ?? null,
        targetProfessional: targetProf,
      });
    };

    navigator.serviceWorker.addEventListener('message', handleSwMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleSwMessage);
    };
  }, []);

  function handleOpenStaffAccess() {
    if (currentUser) {
      setView({ screen: 'panel' });
    } else {
      setView({ screen: 'login' });
    }
  }

  function handleLoginSuccess(user: AuthUser) {
    setCurrentUser(user);
    setView({ screen: 'panel' });
  }

  async function handleLogout() {
    await logoutRequest();
    setCurrentUser(null);
    setPendingDeepLink(null);
    setView({ screen: 'home' });
  }

  if (!authChecked && view.screen === 'panel') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-sm text-text-secondary">
        Carregando sistema MAIS CÍLIOS...
      </div>
    );
  }

  if (view.screen === 'form') {
    return (
      <AttendanceForm
        professional={view.professional}
        onBack={() => setView({ screen: 'home' })}
      />
    );
  }

  if (view.screen === 'pre-booking') {
    return <PublicPreBookingForm onBack={() => setView({ screen: 'home' })} />;
  }

  if (view.screen === 'interested') {
    return <InterestedLeadForm onBack={() => setView({ screen: 'home' })} />;
  }

  if (view.screen === 'login') {
    return (
      <LoginScreen
        onBack={() => setView({ screen: 'home' })}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  if (view.screen === 'panel' && currentUser) {
    if (currentUser.role === 'admin') {
      return (
        <LaisAdminPanel
          user={currentUser}
          onGoHome={() => setView({ screen: 'home' })}
          onLogout={() => void handleLogout()}
          deepLink={pendingDeepLink}
          onDeepLinkConsumed={() => setPendingDeepLink(null)}
        />
      );
    }

    return (
      <DudaPanel
        user={currentUser}
        onGoHome={() => setView({ screen: 'home' })}
        onLogout={() => void handleLogout()}
        deepLink={pendingDeepLink}
        onDeepLinkConsumed={() => setPendingDeepLink(null)}
      />
    );
  }

  return (
    <HomeScreen
      currentUser={currentUser}
      onSelectProfessional={(professional) =>
        setView({ screen: 'form', professional })
      }
      onOpenStaffAccess={handleOpenStaffAccess}
      onOpenPreBooking={() => setView({ screen: 'pre-booking' })}
      onOpenInterestedLead={() => setView({ screen: 'interested' })}
    />
  );
}
