import { useState, useEffect } from 'react';
import { MessageSquare, Clock, Calendar, Phone, Check, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RememberItemWithVideo, useUserProfile, useUpdateUserProfile, useCreateReminderSchedule } from '@/hooks/useHomeData';

interface TextMeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reminder: RememberItemWithVideo | null;
}

type QuickOption = 'later_today' | 'tomorrow_morning' | 'this_weekend' | 'custom';

function getQuickDate(option: QuickOption): Date {
  const now = new Date();
  switch (option) {
    case 'later_today':
      // 3 hours from now, or 6 PM if it's already late
      const laterToday = new Date(now);
      laterToday.setHours(Math.max(now.getHours() + 3, 18), 0, 0, 0);
      return laterToday;
    case 'tomorrow_morning':
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      return tomorrow;
    case 'this_weekend':
      const saturday = new Date(now);
      const daysUntilSat = (6 - now.getDay() + 7) % 7 || 7;
      saturday.setDate(saturday.getDate() + daysUntilSat);
      saturday.setHours(10, 0, 0, 0);
      return saturday;
    default:
      return now;
  }
}

export function TextMeDialog({ open, onOpenChange, reminder }: TextMeDialogProps) {
  const [step, setStep] = useState<'phone' | 'schedule'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [quickOption, setQuickOption] = useState<QuickOption | null>(null);
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('09:00');
  
  const { data: profile, isLoading: loadingProfile } = useUserProfile();
  const updateProfile = useUpdateUserProfile();
  const createReminder = useCreateReminderSchedule();

  // Initialize phone from profile
  useEffect(() => {
    if (profile?.phone_number) {
      setPhoneNumber(profile.phone_number);
      setStep('schedule');
    } else {
      setStep('phone');
    }
  }, [profile, open]);

  const handleSavePhone = () => {
    if (!phoneNumber.trim()) return;
    updateProfile.mutate({ phone_number: phoneNumber.trim() }, {
      onSuccess: () => setStep('schedule'),
    });
  };

  const handleSchedule = () => {
    if (!reminder) return;

    let sendAt: Date;
    if (quickOption && quickOption !== 'custom') {
      sendAt = getQuickDate(quickOption);
    } else if (customDate && customTime) {
      sendAt = new Date(`${customDate}T${customTime}`);
    } else {
      return;
    }

    createReminder.mutate({
      remember_item_id: reminder.id,
      send_at: sendAt,
    }, {
      onSuccess: () => {
        onOpenChange(false);
        setQuickOption(null);
        setCustomDate('');
      },
    });
  };

  const canSchedule = quickOption === 'custom' 
    ? (customDate && customTime)
    : quickOption !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Text Me This Reminder
          </DialogTitle>
          <DialogDescription>
            {reminder?.summary.slice(0, 80)}...
          </DialogDescription>
        </DialogHeader>

        {loadingProfile ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : step === 'phone' ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+1 (555) 000-0000"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Your number will be saved for future reminders
              </p>
            </div>
            <Button 
              className="w-full" 
              onClick={handleSavePhone}
              disabled={!phoneNumber.trim() || updateProfile.isPending}
            >
              {updateProfile.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Continue
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Sending to: {phoneNumber}
              <Button 
                variant="link" 
                className="h-auto p-0 ml-2"
                onClick={() => setStep('phone')}
              >
                Change
              </Button>
            </p>

            {/* Quick Options */}
            <div className="space-y-2">
              <Label>When to remind you?</Label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'later_today', label: 'Later today', icon: Clock },
                  { id: 'tomorrow_morning', label: 'Tomorrow morning', icon: Clock },
                  { id: 'this_weekend', label: 'This weekend', icon: Calendar },
                  { id: 'custom', label: 'Pick a time', icon: Calendar },
                ].map(({ id, label, icon: Icon }) => (
                  <Button
                    key={id}
                    variant={quickOption === id ? 'default' : 'outline'}
                    className="h-auto py-3 justify-start"
                    onClick={() => {
                      setQuickOption(id as QuickOption);
                      if (id !== 'custom') {
                        setCustomDate('');
                      }
                    }}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="text-sm">{label}</span>
                  </Button>
                ))}
              </div>
            </div>

            {/* Custom Date/Time */}
            {quickOption === 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="date">Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="time">Time</Label>
                  <Input
                    id="time"
                    type="time"
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button 
                className="w-full"
                onClick={handleSchedule}
                disabled={!canSchedule || createReminder.isPending}
              >
                {createReminder.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Schedule Reminder
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
