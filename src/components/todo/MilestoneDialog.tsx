import { Trophy, PartyPopper, Star } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface MilestoneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  completedCount: number;
}

const encouragements = [
  "You're on fire! 🔥",
  "Incredible progress! 🚀",
  "Unstoppable! 💪",
  "Knowledge master! 🧠",
  "Keep crushing it! ⭐",
  "Amazing dedication! 🏆",
  "You're a champion! 🎯",
  "Phenomenal work! 🌟",
];

export function MilestoneDialog({ open, onOpenChange, completedCount }: MilestoneDialogProps) {
  const encouragement = encouragements[Math.floor((completedCount / 10 - 1) % encouragements.length)];

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="text-center max-w-sm">
        <AlertDialogHeader>
          <div className="flex justify-center gap-2 mb-2">
            <PartyPopper className="h-8 w-8 text-primary animate-bounce" />
            <Trophy className="h-10 w-10 text-primary" />
            <Star className="h-8 w-8 text-primary animate-bounce" style={{ animationDelay: '150ms' }} />
          </div>
          <AlertDialogTitle className="text-2xl">
            {completedCount} Tasks Done!
          </AlertDialogTitle>
          <AlertDialogDescription className="text-base">
            {encouragement}
            <br />
            You've completed {completedCount} tasks. Keep up the amazing work!
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-center">
          <AlertDialogAction className="min-w-[120px]">
            Let's Go!
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
