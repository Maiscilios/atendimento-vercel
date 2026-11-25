import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Calendar, Lock, Menu, UserPlus, X } from 'lucide-react';
import type { AuthUser, Professional } from '../../../shared/catalog';

interface HomeScreenProps {
  currentUser: AuthUser | null;
  onSelectProfessional: (professional: Professional) => void;
  onOpenStaffAccess: () => void;
  onOpenPreBooking: () => void;
  onOpenInterestedLead: () => void;
}

export function HomeScreen({
  currentUser,
  onSelectProfessional,
  onOpenStaffAccess,
  onOpenPreBooking,
  onOpenInterestedLead,
}: HomeScreenProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <div className="min-h-screen flex flex-col bg-background relative">
      <header className="w-full border-b border-border bg-surface/90 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-3 sm:gap-8">
          <span className="font-display text-xl sm:text-2xl font-bold tracking-wide text-brand-strong whitespace-nowrap shrink-0">
            MAIS CÍLIOS
          </span>

          <button
            type="button"
            onClick={onOpenStaffAccess}
            className="min-h-[40px] px-3 sm:px-4 py-2 inline-flex items-center gap-2 text-xs sm:text-sm font-medium rounded-xl transition-colors whitespace-nowrap shrink-0 btn-secondary"
          >
            <Lock className="w-4 h-4" />
            <span>
              {currentUser ? `Painel (${currentUser.displayName})` : 'Acesso da Equipe'}
            </span>
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col justify-center px-4 sm:px-8 py-8 sm:py-12 bg-[#dd57a5]">
        <div className="w-full max-w-5xl mx-auto bg-[#dd57a5] p-7 sm:p-12 md:p-16 flex flex-col justify-center">
          <div className="text-center">
            <h1 className="font-display text-4xl sm:text-[50px] leading-[1.12] text-left font-semibold text-[#ffffff] [text-wrap:balance]">
              Confirme seu atendimento
            </h1>
            <p className="mt-3 text-base sm:text-lg text-[#000000] font-semibold tracking-tight">
              Com quem foi realizado seu atendimento?
            </p>

            <div className="mt-8 sm:mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <button
                type="button"
                onClick={() => onSelectProfessional('lais')}
                className="group min-h-[112px] sm:min-h-[140px] px-7 py-6 rounded-2xl active:scale-[0.99] flex items-center justify-between transition-all professional-card professional-card-featured"
              >
                <div className="text-left">
                  <span className="block font-display text-2xl sm:text-3xl font-bold tracking-wide">
                    LAÍS
                  </span>
                  <span className="block text-sm sm:text-base font-medium text-text-secondary mt-1">
                    Cílios e sobrancelhas
                  </span>
                </div>
                <ArrowRight className="w-6 h-6 sm:w-7 sm:h-7 text-brand group-hover:translate-x-1 transition-transform shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => onSelectProfessional('duda')}
                className="group min-h-[112px] sm:min-h-[140px] px-7 py-6 rounded-2xl active:scale-[0.99] flex items-center justify-between transition-all professional-card"
              >
                <div className="text-left">
                  <span className="block font-display text-2xl sm:text-3xl font-bold tracking-wide">
                    DUDA
                  </span>
                  <span className="block text-sm sm:text-base font-medium text-text-secondary mt-1">
                    Unhas e cuidados
                  </span>
                </div>
                <ArrowRight className="w-6 h-6 sm:w-7 sm:h-7 text-brand group-hover:translate-x-1 transition-transform shrink-0" />
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Menu discreto no canto inferior direito */}
      <div
        ref={menuContainerRef}
        className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-30 flex flex-col items-end"
      >
        {menuOpen && (
          <div
            role="menu"
            aria-label="Outras opções"
            className="mb-3 w-64 bg-surface border border-brand/40 rounded-2xl shadow-dialog p-2 text-left"
          >
            <div className="px-3 py-1.5 border-b border-border/70 mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-strong">
                Outras opções
              </span>
            </div>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onOpenPreBooking();
              }}
              className="w-full min-h-[46px] px-3 py-2.5 rounded-xl flex items-center gap-3 text-sm font-medium text-text-primary hover:bg-brand-soft hover:text-brand-strong transition-colors"
            >
              <Calendar className="w-4 h-4 text-brand shrink-0" />
              <span>Novo agendamento</span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onOpenInterestedLead();
              }}
              className="w-full min-h-[46px] px-3 py-2.5 rounded-xl flex items-center gap-3 text-sm font-medium text-text-primary hover:bg-brand-soft hover:text-brand-strong transition-colors"
            >
              <UserPlus className="w-4 h-4 text-brand shrink-0" />
              <span>Cadastrar interessada</span>
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? 'Fechar outras opções' : 'Abrir outras opções'}
          aria-expanded={menuOpen}
          className="w-12 h-12 rounded-2xl bg-surface/95 hover:bg-surface border border-brand/40 text-brand-strong shadow-card flex items-center justify-center transition-all active:scale-95"
        >
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
}
