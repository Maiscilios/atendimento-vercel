import { ArrowRight, Lock } from 'lucide-react';
import type { AuthUser, Professional } from '../../../shared/catalog';

interface HomeScreenProps {
  currentUser: AuthUser | null;
  onSelectProfessional: (professional: Professional) => void;
  onOpenStaffAccess: () => void;
}

export function HomeScreen({
  currentUser,
  onSelectProfessional,
  onOpenStaffAccess,
}: HomeScreenProps) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
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
    </div>
  );
}
