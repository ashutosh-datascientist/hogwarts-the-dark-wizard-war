import React from 'react';
import { RotateCcw, ShieldAlert } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Unexpected rendering error occurred.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-screen h-screen bg-[#05080d] text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#090f19] border border-amber-500/40 rounded-lg p-7 text-center flex flex-col items-center gap-4 shadow-2xl">
            <ShieldAlert className="w-10 h-10 text-amber-400" />
            <h1 className="font-display text-xl font-bold tracking-wider text-white">
              COURTYARD RENDER INTERRUPTED
            </h1>
            <p className="text-xs text-slate-300 leading-relaxed">
              The 3D graphics engine encountered an unexpected interruption on this browser session ({this.state.message}).
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-xs tracking-wider flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-4 h-4" /> RELOAD GAME
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
