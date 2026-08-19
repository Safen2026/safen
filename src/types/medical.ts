export type Severity = 'mild' | 'severe';

export type Allergy = {
  name: string;
  severity: Severity;
};

export type MedicalProfile = {
  blood_type: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  is_organ_donor: boolean;
  allergies: Allergy[];
  conditions: string[];
  medications: string[];
  doctor_name: string | null;
  doctor_phone: string | null;
  doctor_hospital: string | null;
};

export const EMPTY_PROFILE: MedicalProfile = {
  blood_type: null,
  height_cm: null,
  weight_kg: null,
  is_organ_donor: false,
  allergies: [],
  conditions: [],
  medications: [],
  doctor_name: null,
  doctor_phone: null,
  doctor_hospital: null,
};

export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export const calcCompleteness = (p: MedicalProfile): number => {
  const checks = [
    !!p.blood_type,
    !!p.height_cm,
    !!p.weight_kg,
    p.allergies.length > 0,
    p.conditions.length > 0,
    p.medications.length > 0,
    !!p.doctor_name,
    !!p.doctor_phone,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
};
