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
    <div className="min-h-screen flex flex-col bg-[#FFF9FB]">
      <header className="w-full border-b border-[#F3DCE6] bg-white/90 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-8">
          <span className="font-display text-2xl font-bold tracking-wide text-[#831843] whitespace-nowrap shrink-0">
            MAIS CÍLIOS
          </span>

          <button
            type="button"
            onClick={onOpenStaffAccess}
            className="min-h-[40px] px-4 py-2 inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-[#831843] bg-[#FDF2F6] hover:bg-[#F9E3EC] border border-[#F1D8E2] rounded-xl transition-colors whitespace-nowrap shrink-0"
          >
            <Lock className="w-4 h-4" />
            <span>
              {currentUser ? `Painel (${currentUser.displayName})` : 'Acesso da Equipe'}
            </span>
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col justify-center px-4 sm:px-8 py-8 sm:py-12">
        <div className="w-full max-w-5xl mx-auto bg-white border border-[#F1D8E2] rounded-3xl p-7 sm:p-12 md:p-16 shadow-[0_6px_28px_rgba(131,24,67,0.05)] flex flex-col justify-center">
          <div className="text-center space-y-2">
            <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-[#831843] [text-wrap:balance]">
              MAIS CÍLIOS
            </h1>
            <p className="text-xs sm:text-sm font-medium tracking-[0.22em] text-[#9D2A58]">
              BELEZA • CUIDADO • AUTOESTIMA
            </p>
          </div>

          <div className="mt-8 sm:mt-10 pt-8 sm:pt-10 border-t border-[#F5E4EC] text-center">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold text-[#331824] [text-wrap:balance]">
              Confirme seu atendimento
            </h2>
            <p className="mt-2 text-base sm:text-lg text-[#6E4959]">
              Com quem foi realizado seu atendimento?
            </p>

            <div className="mt-8 sm:mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <button
                type="button"
                onClick={() => onSelectProfessional('lais')}
                className="group min-h-[112px] sm:min-h-[140px] px-7 py-6 rounded-2xl bg-[#9D2A58] hover:bg-[#831843] active:scale-[0.99] text-white flex items-center justify-between transition-all shadow-sm"
              >
                <div className="text-left">
                  <span className="block text-2xl sm:text-3xl font-bold tracking-wide">
                    LAÍS
                  </span>
                  <span className="block text-sm sm:text-base text-white/85 mt-1">
                    Cílios e sobrancelhas
                  </span>
                </div>
                <ArrowRight className="w-6 h-6 sm:w-7 sm:h-7 text-white/90 group-hover:translate-x-1 transition-transform shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => onSelectProfessional('duda')}
                className="group min-h-[112px] sm:min-h-[140px] px-7 py-6 rounded-2xl bg-[#FDF2F6] hover:bg-[#F9E3EC] active:scale-[0.99] text-[#831843] border border-[#EBC5D5] flex items-center justify-between transition-all"
              >
                <div className="text-left">
                  <span className="block text-2xl sm:text-3xl font-bold tracking-wide">
                    DUDA
                  </span>
                  <span className="block text-sm sm:text-base text-[#7A5464] mt-1">
                    Unhas e cuidados
                  </span>
                </div>
                <ArrowRight className="w-6 h-6 sm:w-7 sm:h-7 text-[#9D2A58] group-hover:translate-x-1 transition-transform shrink-0" />
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
