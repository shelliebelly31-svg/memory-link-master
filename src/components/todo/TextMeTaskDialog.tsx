import { useState, useEffect } from 'react';
import { MessageSquare, Clock, Calendar, Phone, Check, Loader2, Repeat } from 'lucide-react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TaskWithVideo, useUserProfile, useUpdateUserProfile } from '@/hooks/useHomeData';
import { useCreateTaskReminder } from '@/hooks/useTaskReminders';
import { cn } from '@/lib/utils';

interface TextMeTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: TaskWithVideo | null;
}

type QuickOption = 'later_today' | 'tomorrow_morning' | 'this_weekend' | 'custom';
type RepeatType = 'one_time' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom';

function getQuickDate(option: QuickOption): Date {
  const now = new Date();
  switch (option) {
    case 'later_today':
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

export function TextMeTaskDialog({ open, onOpenChange, task }: TextMeTaskDialogProps) {
  const [step, setStep] = useState<'phone' | 'schedule'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [quickOption, setQuickOption] = useState<QuickOption | null>(null);
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('09:00');
  const [repeatType, setRepeatType] = useState<RepeatType>('one_time');
  const [customDays, setCustomDays] = useState<number[]>([]);

  const { data: profile, isLoading: loadingProfile } = useUserProfile();
  const updateProfile = useUpdateUserProfile();
  const createReminder = useCreateTaskReminder();

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setQuickOption(null);
      setCustomDate('');
      setCustomTime('09:00');
      setRepeatType('one_time');
      setCustomDays([]);
      
      if (profile?.phone_number) {
        setPhoneNumber(profile.phone_number);
        setStep('schedule');
      } else {
        setStep('phone');
      }
    }
  }, [profile, open]);

  const handleSavePhone = () => {
    if (!phoneNumber.trim()) return;
    updateProfile.mutate({ phone_number: phoneNumber.trim() }, {
      onSuccess: () => setStep('schedule'),
    });
  };

  const handleSchedule = () => {
    if (!task) return;

    let sendAt: Date;
    if (quickOption && quickOption !== 'custom') {
      sendAt = getQuickDate(quickOption);
    } else if (customDate && customTime) {
      sendAt = new Date(`${customDate}T${customTime}`);
    } else {
      return;
    }

    createReminder.mutate({
      task_id: task.id,
      send_at: sendAt,
      repeat_type: repeatType,
      repeat_days: repeatType === 'custom' ? customDays : undefined,
    }, {
      onSuccess: () => {
        onOpenChange(false);
      },
    });
  };

  const toggleDay = (day: number) => {
    setCustomDays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day)
        : [...prev, day].sort()
    );
  };

  const canSchedule = quickOption === 'custom' 
    ? (customDate && customTime)
    : quickOption !== null;

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Text Me This Task
          </DialogTitle>
          <DialogDescription className="line-clamp-2">
            {task?.title}
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

            {/* Repeat Options */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Repeat className="h-4 w-4" />
                Repeat
              </Label>
              <Select value={repeatType} onValueChange={(v) => setRepeatType(v as RepeatType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="one_time">One time</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Bi-weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="custom">Custom days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Custom Days */}
            {repeatType === 'custom' && (
              <div className="space-y-2">
                <Label>Select days</Label>
                <div className="flex gap-1.5 flex-wrap">
                  {dayNames.map((name, index) => (
                    <Button
                      key={index}
                      variant={customDays.includes(index) ? 'default' : 'outline'}
                      size="sm"
                      className="w-10 h-10 p-0"
                      onClick={() => toggleDay(index)}
                    >
                      {name.slice(0, 2)}
                    </Button>
                  ))}
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
                Schedule Text
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
