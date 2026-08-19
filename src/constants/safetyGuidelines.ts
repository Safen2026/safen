import { Ionicons } from '@expo/vector-icons';

export type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

export type Guideline = {
  key: string;
  title: string;
  icon: IoniconsName;
  iconSet: 'ion' | 'mci';
  color: string;
  points: string[];
};

export const GUIDELINES: Guideline[] = [
  {
    key: 'setup',
    title: 'Before You Need It',
    icon: 'shield-checkmark-outline',
    iconSet: 'ion',
    color: '#00875A',
    points: [
      'Add at least 2–3 emergency contacts, and try to get contacts who are also on Safen — they get instant in-app alerts.',
      'Fill in your Medical Profile (blood type, allergies, conditions, medications) so first responders have what they need if you can\'t speak for yourself.',
      'Keep your "at home" status current in the app so contacts can tell your situation at a glance.',
      'Test the SOS button once in a safe moment so the hold-to-trigger motion is familiar before you ever need it under pressure.',
    ],
  },
  {
    key: 'sos',
    title: 'During an SOS or Quick Action',
    icon: 'alert-circle',
    iconSet: 'ion',
    color: '#E02B2B',
    points: [
      'Press and hold the SOS button — a short press won\'t trigger it, this prevents accidental alerts.',
      'Once triggered, your on-app emergency contacts are notified immediately with your location.',
      'If it was an accident, use Cancel right away — contacts will see the alert was cancelled.',
      'Medical, Police, and Fire quick actions work the same way, but let your contacts know exactly what kind of help you may need.',
      'Try to stay in one place if it\'s safe to do so — your location updates as long as the alert is active.',
    ],
  },
  {
    key: 'reporting',
    title: 'Filing a Safety Report',
    icon: 'document-text-outline',
    iconSet: 'ion',
    color: '#7C3AED',
    points: [
      'Use Report for incidents that aren\'t an active emergency for you personally — suspicious activity, a hazard, something you witnessed.',
      'Pick the category that fits best (Medical, Fire, Security, Traffic) — it helps anyone reviewing reports triage faster.',
      'Photos, video, or audio make a report far more useful — attach what you safely can.',
      'The anonymous toggle hides your identity from anyone reviewing the report, but the report is still linked to your account for accountability.',
      'Your location is attached automatically — you can adjust the pin if the incident happened somewhere other than where you\'re standing.',
    ],
  },
  {
    key: 'everyday',
    title: 'Everyday Personal Safety',
    icon: 'walk-outline',
    iconSet: 'ion',
    color: '#2563EB',
    points: [
      'Trust your instincts — if a situation feels wrong, it\'s okay to leave, even if you can\'t explain exactly why.',
      'Share your live location with a trusted contact when heading somewhere unfamiliar or meeting someone new.',
      'Keep your phone charged before heading out — a dead phone can\'t call for help.',
      'Vary your routes and routines occasionally, especially if you ever feel like you\'re being watched or followed.',
      'Let someone know your expected return time when going somewhere alone.',
    ],
  },
  {
    key: 'contact',
    title: 'Being Someone\'s Emergency Contact',
    icon: 'people-outline',
    iconSet: 'ion',
    color: '#DC6803',
    points: [
      'If you get an SOS or report notification from someone who added you, take it seriously — check in immediately.',
      'Tapping a notification shows you the type of alert and last known location.',
      'If you can\'t reach them and the alert stays active, consider contacting local emergency services directly.',
      'Being listed as someone\'s contact is a responsibility — make sure notifications are enabled so you don\'t miss one.',
    ],
  },
];
