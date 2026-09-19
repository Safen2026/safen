export const LightTheme = {
  primary: '#E02B2B', // SOS Red
  background: '#F2F4F8',  // Cool blue-tinted light grey for more depth
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
  
  border: '#DDE1EA',  // Slightly deeper border for light mode
  icon: {
    medical: '#DC2626',
    police: '#2563EB',
    fire: '#EA580C',
    activeTab: '#107C41',
    inactiveTab: '#6B7280'
  }
};

export const DarkTheme = {
  primary: '#E02B2B',        // SOS Red — always stays red for emergencies
  background: '#0A0A0F',     // Near-black with a subtle blue-black tint
  white: '#13131A',          // Card surfaces — dark navy-charcoal

  text: {
    primary: '#F0F0F5',      // Slightly warm off-white for readability
    secondary: '#8B8FA8',    // Desaturated blue-grey
    inverse: '#0A0A0F',
  },

  status: {
    safeBackground: '#052E16', // Very dark green
    safeText: '#4ADE80',       // Bright lime-green
    alertBackground: '#450A0A', // Very dark red
    alertText: '#F87171',       // Soft coral-red
    warningBackground: '#431407', // Very dark amber
    warningText: '#FBBF24',      // Warm amber
  },

  border: '#1E1E2E',         // Subtle dark border (navy-tinted)
  icon: {
    medical: '#F87171',      // Soft red
    police: '#60A5FA',       // Soft blue
    fire: '#FB923C',         // Soft orange
    activeTab: '#4ADE80',    // Bright green
    inactiveTab: '#6B7280',
  },
};

// Temporarily keep Colors to prevent immediate app crash during refactor
export const Colors = LightTheme;

// Single source of truth for the theme colors type.
// All getStyles(colors) functions should use this.
export type ThemeColors = typeof LightTheme;

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
  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.10,
    shadowRadius: 24,
    elevation: 12,
  },
  sos: {
    shadowColor: "#E02B2B",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  }
};