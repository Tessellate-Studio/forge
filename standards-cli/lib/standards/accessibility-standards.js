// Accessibility standards and guidelines for inclusive UI development

const AccessibilityStandards = {
  // Color and contrast standards
  contrast: {
    // WCAG 2.1 Level AA requirements
    textOnBackground: {
      normalText: {
        minimumRatio: 4.5, // 4.5:1 for normal text
        preferredRatio: 7.0, // 7:1 for AAA level
        description: 'Minimum contrast ratio for normal text (14pt+) on any background'
      },
      largeText: {
        minimumRatio: 3.0, // 3:1 for large text (18pt+ or 14pt+ bold)
        preferredRatio: 4.5, // 4.5:1 for AAA level
        description: 'Minimum contrast ratio for large text (18pt+ or 14pt+ bold)'
      },
      uiElements: {
        minimumRatio: 3.0, // 3:1 for UI components, graphical objects, and focus indicators
        description: 'Minimum contrast ratio for interactive elements, borders, and icons'
      }
    },
    
    // Prohibited color combinations (common accessibility failures)
    avoidCombinations: [
      { text: '#6b7280', background: '#ffffff', reason: 'Gray-500 on white fails WCAG AA (3.1:1)' },
      { text: '#9ca3af', background: '#ffffff', reason: 'Gray-400 on white fails WCAG AA (2.3:1)' },
      { text: '#d1d5db', background: '#ffffff', reason: 'Gray-300 on white fails WCAG AA (1.6:1)' },
      { text: '#374151', background: '#f3f4f6', reason: 'Gray-700 on gray-100 may be borderline (3.8:1)' }
    ],

    // Recommended color combinations that meet WCAG AA
    recommendedCombinations: [
      { text: '#111827', background: '#ffffff', ratio: '16.8:1', level: 'AAA' }, // Gray-900 on white
      { text: '#1f2937', background: '#ffffff', ratio: '13.1:1', level: 'AAA' }, // Gray-800 on white  
      { text: '#374151', background: '#ffffff', ratio: '8.3:1', level: 'AAA' },  // Gray-700 on white
      { text: '#4b5563', background: '#ffffff', ratio: '5.9:1', level: 'AAA' },  // Gray-600 on white
      { text: '#ffffff', background: '#111827', ratio: '16.8:1', level: 'AAA' }, // White on gray-900
      { text: '#ffffff', background: '#1f2937', ratio: '13.1:1', level: 'AAA' }, // White on gray-800
      { text: '#ffffff', background: '#374151', ratio: '8.3:1', level: 'AAA' }   // White on gray-700
    ]
  },

  // Typography accessibility guidelines
  typography: {
    sizing: {
      minimumFontSize: '16px', // Never go below 16px for body text
      relativeSizing: true,    // Use rem/em units for scalability
      lineHeight: {
        minimum: 1.4,          // At least 1.4x for readability
        preferred: 1.5         // 1.5x is optimal for most text
      }
    },
    
    fonts: {
      readability: {
        avoidFonts: ['Comic Sans MS', 'Brush Script MT'], // Hard to read fonts
        preferredFonts: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Arial'],
        fallbacks: 'Always include generic fallbacks (sans-serif, serif, monospace)'
      }
    }
  },

  // Interactive element accessibility
  interactivity: {
    focusIndicators: {
      required: true,
      visible: true,
      contrastRatio: 3.0, // Must meet 3:1 contrast against adjacent colors
      thickness: '2px',   // Minimum thickness for visibility
      style: 'outline or border with sufficient contrast'
    },
    
    clickTargets: {
      minimumSize: '44px', // WCAG recommendation for touch targets
      spacing: '8px',      // Minimum space between interactive elements
      description: 'Ensure all clickable elements are large enough and well-spaced'
    },

    stateIndicators: {
      hoverStates: {
        required: true,
        contrastChange: 'Must maintain minimum contrast ratios in all states'
      },
      disabledStates: {
        styling: 'Use opacity or desaturated colors, not just color changes',
        contrastRatio: 'Disabled text should still meet 3:1 ratio where possible'
      }
    }
  },

  // Color usage guidelines
  colorUsage: {
    informationConveyance: {
      neverColorAlone: true,
      description: 'Never rely on color alone to convey information',
      alternatives: ['icons', 'text labels', 'patterns', 'shapes', 'positioning'],
      examples: {
        errorStates: 'Use red color + error icon + descriptive text',
        successStates: 'Use green color + checkmark icon + "Success" text',
        warningStates: 'Use orange color + warning icon + descriptive text'
      }
    },

    semanticColors: {
      error: {
        background: '#fef2f2',   // Red-50
        text: '#991b1b',         // Red-800  
        border: '#fecaca',       // Red-200
        contrastRatio: '7.3:1'   // Red-800 on red-50
      },
      warning: {
        background: '#fffbeb',   // Amber-50
        text: '#92400e',         // Amber-800
        border: '#fde68a',       // Amber-200  
        contrastRatio: '6.8:1'   // Amber-800 on amber-50
      },
      success: {
        background: '#f0fdf4',   // Green-50
        text: '#166534',         // Green-800
        border: '#bbf7d0',       // Green-200
        contrastRatio: '6.9:1'   // Green-800 on green-50
      },
      info: {
        background: '#eff6ff',   // Blue-50
        text: '#1e40af',         // Blue-800
        border: '#bfdbfe',       // Blue-200
        contrastRatio: '8.1:1'   // Blue-800 on blue-50
      }
    }
  },

  // Specific UI component guidelines
  components: {
    cards: {
      textHierarchy: {
        title: 'Use gray-900 (#111827) for primary headings',
        subtitle: 'Use gray-700 (#374151) for secondary text',  
        body: 'Use gray-600 (#4b5563) for body text - minimum safe gray',
        muted: 'Use gray-500 (#6b7280) sparingly and only for truly auxiliary information',
        avoid: 'Never use gray-400 (#9ca3af) or lighter for text'
      },
      
      backgrounds: {
        primary: '#ffffff',      // White backgrounds for main content
        secondary: '#f9fafb',    // Gray-50 for subtle differentiation
        elevated: '#ffffff',     // Keep cards on white for maximum contrast
        borders: '#e5e7eb'       // Gray-200 for subtle borders
      }
    },

    navigation: {
      activeStates: {
        contrast: 'Active nav items must meet 4.5:1 contrast',
        differentiation: 'Use multiple visual cues: color, background, font-weight',
        focusRing: 'Provide clear focus indicators for keyboard navigation'
      }
    },

    forms: {
      labels: {
        association: 'Always associate labels with form controls',
        contrast: 'Form labels should use gray-800 (#1f2937) or darker',
        required: 'Mark required fields with both visual and text indicators'
      },
      
      validation: {
        errorText: 'Use red-800 (#991b1b) for error messages',
        successText: 'Use green-800 (#166534) for success messages',
        multipleIndicators: 'Combine color, icons, and descriptive text'
      }
    }
  },

  // Testing and validation
  testing: {
    automated: {
      tools: ['axe-core', 'lighthouse', 'WAVE browser extension'],
      ciIntegration: 'Run accessibility tests in CI/CD pipeline',
      coverage: 'Test all interactive states and color combinations'
    },

    manual: {
      keyboardNavigation: 'Test all functionality with keyboard only',
      screenReader: 'Test with screen readers (NVDA, JAWS, VoiceOver)',
      colorBlindness: 'Test with color blindness simulators',
      contrastCheckers: 'Use tools like WebAIM Contrast Checker, Colour Contrast Analyser'
    }
  },

  // Implementation guidelines for developers
  implementation: {
    cssVariables: {
      useSemanticNames: true,
      example: `
        :root {
          /* Semantic color naming */
          --text-primary: #111827;      /* Gray-900 - highest contrast */
          --text-secondary: #374151;    /* Gray-700 - good contrast */
          --text-tertiary: #4b5563;     /* Gray-600 - minimum safe */
          --text-muted: #6b7280;        /* Gray-500 - use sparingly */
          
          /* Never use for text on white backgrounds */
          --text-disabled: #9ca3af;     /* Gray-400 - decorative only */
          --text-placeholder: #d1d5db;  /* Gray-300 - decorative only */
        }`
    },

    tailwindClasses: {
      safeTextClasses: [
        'text-gray-900', // 16.8:1 ratio - Excellent
        'text-gray-800', // 13.1:1 ratio - Excellent  
        'text-gray-700', // 8.3:1 ratio - Good
        'text-gray-600'  // 5.9:1 ratio - Minimum safe
      ],
      
      problematicClasses: [
        'text-gray-500', // 3.1:1 ratio - Use sparingly, may fail WCAG AA
        'text-gray-400', // 2.3:1 ratio - Fails WCAG AA, avoid for text
        'text-gray-300'  // 1.6:1 ratio - Fails WCAG AA, decorative only
      ],

      recommendations: {
        primaryHeadings: 'text-gray-900',
        secondaryHeadings: 'text-gray-800', 
        bodyText: 'text-gray-700',
        captionText: 'text-gray-600',
        placeholders: 'text-gray-500 (use with caution)',
        decorativeText: 'Consider if text is truly necessary'
      }
    }
  },

  // Common patterns and fixes
  commonIssues: {
    lowContrastText: {
      problem: 'Using gray-500, gray-400, or lighter for body text',
      solution: 'Use gray-600 or darker for all readable text',
      impact: 'Affects users with low vision, older users, users in bright environments'
    },
    
    colorOnlyInformation: {
      problem: 'Using only color to indicate status, importance, or state',
      solution: 'Add icons, text labels, or other visual indicators',
      impact: 'Affects colorblind users (8% of men, 0.5% of women)'
    },
    
    smallClickTargets: {
      problem: 'Buttons, links, or interactive elements smaller than 44px',
      solution: 'Ensure minimum 44x44px touch targets with adequate spacing',
      impact: 'Affects users with motor disabilities, mobile users'
    }
  }
};

module.exports = AccessibilityStandards;