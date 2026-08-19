// Normalize to E.164 for Nigerian numbers so we match what's in profiles
export const toE164Nigeria = (raw: string): string => {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('234')) return `+${digits}`;
  if (digits.startsWith('0')) return `+234${digits.slice(1)}`;
  if (digits.length === 10) return `+234${digits}`;
  return `+${digits}`;
};

export const isValidPhone = (raw: string): boolean => {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('234')) return digits.length === 13;
  if (digits.startsWith('0')) return digits.length === 11;
  return digits.length === 10;
};

export const getInitials = (name: string) =>
  name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

export const getAvatarColor = (name: string) => {
  const palette = ['#0A2463', '#1B5E20', '#DC2626', '#EA580C', '#7C3AED'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
};
