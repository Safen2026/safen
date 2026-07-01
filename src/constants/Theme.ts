export const LightTheme = {
  primary: '#E02B2B', // SOS Red
  background: '#F8F9FA',
  white: '#FFFFFF',
  
  text: {
    primary: '#1F2937',
    secondary: '#6B7280',
    inverse: '#FFFFFF'
  },
  
  status: {
    safeBackground: '#D1EFE0',
    safeText: '#107C41',
    alertBackground: '#FEE2E2',
    alertText: '#B91C1C',
    warningBackground: '#FEF3C7',
    warningText: '#B45309'
  },
  
  border: '#E5E7EB',
  icon: {
    medical: '#DC2626',
    police: '#2563EB',
    fire: '#EA580C',
    activeTab: '#107C41',
    inactiveTab: '#6B7280'
  }
};

export const DarkTheme = {
  primary: '#E02B2B', // SOS Red (Keep red for emergencies)
  background: '#121212', // Deep dark gray
  white: '#1E1E1E', // Re-purpose 'white' to mean 'surface' for cards
  
  text: {
    primary: '#F3F4F6', // High contrast off-white
    secondary: '#9CA3AF', // Muted gray
    inverse: '#1F2937' // Dark gray for buttons if needed
  },
  
  status: {
    safeBackground: '#064E3B', // Deep green
    safeText: '#34D399', // Bright green
    alertBackground: '#7F1D1D', // Deep red
    alertText: '#FCA5A5', // Bright red
    warningBackground: '#78350F', // Deep yellow/orange
    warningText: '#FCD34D' // Bright yellow
  },
  
  border: '#374151', // Dark border
  icon: {
    medical: '#EF4444',
    police: '#3B82F6',
    fire: '#F97316',
    activeTab: '#34D399',
    inactiveTab: '#6B7280'
  }
};

// Temporarily keep Colors to prevent immediate app crash during refactor
export const Colors = LightTheme;

export const Shadows = {
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 4,
  },
  sos: {
    shadowColor: "#E02B2B",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  }
};