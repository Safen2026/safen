/**
 * In-memory store for transient signup data.
 * Used to avoid passing PII (Personally Identifiable Information) like name and email
 * through URL route parameters, which is a security anti-pattern.
 */

interface SignupData {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

let signupData: SignupData = {};

export const setSignupData = (data: SignupData) => {
  signupData = { ...data };
};

export const getSignupData = (): SignupData => {
  return signupData;
};

export const clearSignupData = () => {
  signupData = {};
};
