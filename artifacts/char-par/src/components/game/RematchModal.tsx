// components/game/RematchModal.tsx
import { motion, AnimatePresence } from 'framer-motion';

interface RematchModalProps {
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
  opponentName: string;
  isWaiting?: boolean;
}

export function RematchModal({ open, onAccept, onDecline, opponentName, isWaiting }: RematchModalProps) {
  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onDecline}
        />

        {/* Modal */}
        <motion.div
          className="relative bg-card border border-border rounded-2xl shadow-2xl max-w-sm w-full p-6"
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 400 }}
        >
          {isWaiting ? (
            // Waiting state
            <div className="text-center py-4">
              <div className="w-16 h-16 mx-auto mb-4 relative">
                <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
                <div className="absolute inset-0 rounded-full border-4 border-t-primary animate-spin" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Waiting for opponent...</h3>
              <p className="text-sm text-muted-foreground">They've been asked to rematch</p>
            </div>
          ) : (
            // Offer state
            <>
              <div className="text-center mb-6">
                <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <span className="text-3xl">🔄</span>
                </div>
                <h3 className="text-xl font-bold">Rematch Requested</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {opponentName} wants a rematch!
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={onAccept}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3 rounded-lg transition-colors"
                >
                  Accept
                </button>
                <button
                  onClick={onDecline}
                  className="flex-1 bg-secondary hover:bg-secondary/80 text-secondary-foreground font-semibold py-3 rounded-lg transition-colors"
                >
                  Decline
                </button>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
