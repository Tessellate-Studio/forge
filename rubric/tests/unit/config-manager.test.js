// Unit tests for ConfigManager
const ConfigManager = require('../../lib/config-manager');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

describe('ConfigManager', () => {
  let configManager;
  let tempDir;

  beforeEach(() => {
    configManager = new ConfigManager();
    tempDir = path.join(os.tmpdir(), `rubric-test-${Date.now()}`);
    fs.ensureDirSync(tempDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  describe('getDefaultConfig', () => {
    test('should return valid default configuration', () => {
      const defaultConfig = configManager.getDefaultConfig();

      expect(defaultConfig.version).toBe('1.0.0');
      expect(defaultConfig.weights).toBeDefined();
      expect(defaultConfig.thresholds).toBeDefined();
      expect(defaultConfig.settings).toBeDefined();

      // Verify weights sum to 1.0
      const weightSum = Object.values(defaultConfig.weights).reduce(
        (sum, weight) => sum + weight,
        0
      );
      expect(weightSum).toBeCloseTo(1.0, 2);
    });

    test('should include all required weight dimensions', () => {
      const defaultConfig = configManager.getDefaultConfig();

      expect(defaultConfig.weights.impact).toBeDefined();
      expect(defaultConfig.weights.complexity).toBeDefined();
      expect(defaultConfig.weights.reusability).toBeDefined();
      expect(defaultConfig.weights.strategic).toBeDefined();
    });

    test('should include default thresholds on the 0-3 scale', () => {
      const defaultConfig = configManager.getDefaultConfig();

      expect(defaultConfig.thresholds.high_priority).toBe(3);
      expect(defaultConfig.thresholds.medium_priority).toBe(2);
      expect(defaultConfig.thresholds.low_priority).toBe(1);
    });
  });

  describe('validateConfig', () => {
    test('should validate correct configuration', () => {
      const validConfig = {
        weights: {
          impact: 0.35,
          complexity: 0.25,
          reusability: 0.2,
          strategic: 0.2,
        },
        thresholds: { high_priority: 3, medium_priority: 2, low_priority: 1 },
      };

      const result = configManager.validateConfig(validConfig);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should detect missing weights', () => {
      const invalidConfig = {
        weights: { impact: 0.35, complexity: 0.25 }, // missing reusability and strategic
        thresholds: { high_priority: 3, medium_priority: 2, low_priority: 1 },
      };

      const result = configManager.validateConfig(invalidConfig);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(e => e.includes('Missing weight: reusability'))
      ).toBe(true);
    });

    test('should detect invalid weight range', () => {
      const invalidConfig = {
        weights: {
          impact: 1.5,
          complexity: 0.25,
          reusability: 0.2,
          strategic: 0.2,
        },
        thresholds: { high_priority: 3, medium_priority: 2, low_priority: 1 },
      };

      const result = configManager.validateConfig(invalidConfig);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(e => e.includes('Invalid weight for impact'))
      ).toBe(true);
    });

    test('should detect incorrect weight sum', () => {
      const invalidConfig = {
        weights: {
          impact: 0.5,
          complexity: 0.3,
          reusability: 0.3,
          strategic: 0.2,
        }, // sums to 1.3
        thresholds: { high_priority: 3, medium_priority: 2, low_priority: 1 },
      };

      const result = configManager.validateConfig(invalidConfig);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(e => e.includes('Weights must sum to 1.0'))
      ).toBe(true);
    });

    test('should detect invalid threshold range', () => {
      const invalidConfig = {
        weights: {
          impact: 0.35,
          complexity: 0.25,
          reusability: 0.2,
          strategic: 0.2,
        },
        thresholds: { high_priority: 3.5, medium_priority: 2, low_priority: 1 }, // 3.5 exceeds 0-3 scale
      };

      const result = configManager.validateConfig(invalidConfig);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(e =>
          e.includes('Invalid threshold for high_priority')
        )
      ).toBe(true);
    });

    test('should detect invalid threshold order', () => {
      const invalidConfig = {
        weights: {
          impact: 0.35,
          complexity: 0.25,
          reusability: 0.2,
          strategic: 0.2,
        },
        thresholds: { high_priority: 2, medium_priority: 3, low_priority: 1 }, // wrong order
      };

      const result = configManager.validateConfig(invalidConfig);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(e =>
          e.includes('Thresholds must be in descending order')
        )
      ).toBe(true);
    });
  });

  describe('mergeWithDefaults', () => {
    test('should merge user config with defaults', () => {
      const userConfig = {
        weights: { impact: 0.5 },
        settings: { autoSave: false },
      };

      const merged = configManager.mergeWithDefaults(userConfig);

      expect(merged.weights.impact).toBe(0.5); // user value
      expect(merged.weights.complexity).toBe(0.25); // default value
      expect(merged.settings.autoSave).toBe(false); // user value
    });

    test('should preserve all default properties', () => {
      const userConfig = { weights: { impact: 0.5 } };
      const merged = configManager.mergeWithDefaults(userConfig);

      expect(merged.weights).toBeDefined();
      expect(merged.thresholds).toBeDefined();
      expect(merged.settings).toBeDefined();
    });
  });

  describe('initializeConfig', () => {
    test('should create config file with defaults', async () => {
      const configPath = path.join(tempDir, 'rubric-config.yml');

      const result = await configManager.initializeConfig(tempDir);

      expect(result.success).toBe(true);
      expect(await fs.pathExists(configPath)).toBe(true);
    });

    test('should apply custom weights when specified', async () => {
      const customWeights = {
        impact: 0.4,
        complexity: 0.3,
        reusability: 0.2,
        strategic: 0.1,
      };
      const configPath = path.join(tempDir, 'rubric-config.yml');

      await configManager.initializeConfig(tempDir, { weights: customWeights });

      expect(await fs.pathExists(configPath)).toBe(true);

      const configContent = await fs.readFile(configPath, 'utf8');
      expect(configContent).toContain('0.4'); // custom impact weight
    });

    test('should not overwrite existing config without force flag', async () => {
      // Create initial config
      await configManager.initializeConfig(tempDir);

      // Try to initialize again without force
      await expect(configManager.initializeConfig(tempDir)).rejects.toThrow(
        'Configuration file already exists'
      );
    });

    test('should overwrite existing config with force flag', async () => {
      // Create initial config
      await configManager.initializeConfig(tempDir);

      // Initialize again with force
      const result = await configManager.initializeConfig(tempDir, {
        force: true,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('loadConfig', () => {
    test('should load existing config file', async () => {
      const configPath = path.join(tempDir, 'rubric-config.yml');
      await configManager.initializeConfig(tempDir);

      const config = await configManager.loadConfig(configPath);

      expect(config.version).toBe('1.0.0');
      expect(config.weights).toBeDefined();
    });

    test('should return defaults for non-existent file', async () => {
      const nonExistentPath = path.join(tempDir, 'non-existent.yml');

      const config = await configManager.loadConfig(nonExistentPath);

      expect(config).toEqual(configManager.getDefaultConfig());
    });
  });
});
