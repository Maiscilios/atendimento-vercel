import { useEffect, useState } from 'react';
import { AttendanceForm } from './components/AttendanceForm';
import { DudaPanel } from './components/DudaPanel';
import { HomeScreen } from './components/HomeScreen';
import { LaisAdminPanel } from './components/LaisAdminPanel';
import { LoginScreen } from './components/LoginScreen';
import { fetchCurrentUser, logoutRequest } from './lib/api';
import type { AuthUser, Professional } from '../../shared/catalog';

type ViewState =
  | { screen: 'home' }
  | { screen: 'form'; professional: Professional }
  | { screen: 'login' }
  | { screen: 'panel' };

export default function App() {
  const [view, setView] = useState<ViewState>({ screen: 'home' });
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

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
        />
      );
    }

    return (
      <DudaPanel
        user={currentUser}
        onGoHome={() => setView({ screen: 'home' })}
        onLogout={() => void handleLogout()}
      />
    );
  }

  return (
    <HomeScreen
      currentUser={currentUser}
      onSelectProfessional={(professional) => setView({ screen: 'form', professional })}
      onOpenStaffAccess={handleOpenStaffAccess}
    />
  );
}
