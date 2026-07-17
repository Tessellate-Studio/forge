// Configuration management for Rubric SDK
const fs = require('fs-extra');
const path = require('path');
const yaml = require('yaml');

class ConfigManager {
  constructor() {
    this.defaultConfig = this.getDefaultConfig();
  }

  // Get default configuration template
  getDefaultConfig() {
    return {
      version: '1.0.0',
      weights: {
        impact: 0.35,
        complexity: 0.25,
        reusability: 0.20,
        strategic: 0.20
      },
      thresholds: {
        high_priority: 3,
        medium_priority: 2,
        low_priority: 1
      },
      settings: {
        autoSave: true,
        defaultFormat: 'json',
        enableAI: false,
        trackHistory: true
      }
    };
  }

  // Initialize configuration file in project directory
  async initializeConfig(projectPath = process.cwd(), options = {}) {
    try {
      const configPath = path.join(projectPath, 'rubric-config.yml');
      
      // Check if config already exists
      if (await fs.pathExists(configPath) && !options.force) {
        throw new Error('Configuration file already exists. Use --force to overwrite.');
      }
      
      // Create config with user preferences
      const config = { ...this.defaultConfig };
      
      
      // Apply custom weights if provided
      if (options.weights) {
        config.weights = { ...config.weights, ...options.weights };
      }
      
      // Write configuration file
      const configYaml = yaml.stringify(config, {
        indent: 2,
        lineWidth: 80
      });
      
      await fs.writeFile(configPath, configYaml, 'utf8');
      
      return {
        success: true,
        configPath,
        message: `Configuration initialized at ${configPath}`
      };
    } catch (error) {
      throw new Error(`Failed to initialize config: ${error.message}`);
    }
  }

  // Load configuration from file
  async loadConfig(configPath) {
    try {
      if (!configPath) {
        // Try to find config in current directory or parent directories
        configPath = await this.findConfigFile();
      }
      
      if (!configPath || !(await fs.pathExists(configPath))) {
        return this.defaultConfig;
      }
      
      const configContent = await fs.readFile(configPath, 'utf8');
      const config = yaml.parse(configContent);
      
      // Merge with defaults to ensure all properties exist
      return this.mergeWithDefaults(config);
    } catch (error) {
      console.warn(`Warning: Could not load config file: ${error.message}`);
      return this.defaultConfig;
    }
  }

  // Find configuration file in current or parent directories
  async findConfigFile(startPath = process.cwd()) {
    const configFilenames = ['rubric-config.yml', 'rubric-config.yaml', '.rubricrc.yml'];
    let currentPath = startPath;
    
    // Search up the directory tree
    while (currentPath !== path.dirname(currentPath)) {
      for (const filename of configFilenames) {
        const configPath = path.join(currentPath, filename);
        if (await fs.pathExists(configPath)) {
          return configPath;
        }
      }
      currentPath = path.dirname(currentPath);
    }
    
    return null;
  }

  // Merge user config with defaults
  mergeWithDefaults(userConfig) {
    const merged = { ...this.defaultConfig };
    
    if (userConfig.weights) {
      merged.weights = { ...merged.weights, ...userConfig.weights };
    }
    
    if (userConfig.thresholds) {
      merged.thresholds = { ...merged.thresholds, ...userConfig.thresholds };
    }
    
    if (userConfig.profiles) {
      merged.profiles = { ...merged.profiles, ...userConfig.profiles };
    }
    
    if (userConfig.settings) {
      merged.settings = { ...merged.settings, ...userConfig.settings };
    }
    
    return merged;
  }

  // Validate configuration structure
  validateConfig(config) {
    const errors = [];
    
    // Validate weights
    if (config.weights) {
      const requiredWeights = ['impact', 'complexity', 'reusability', 'strategic'];
      const weightSum = Object.values(config.weights).reduce((sum, weight) => sum + weight, 0);
      
      for (const weight of requiredWeights) {
        if (!(weight in config.weights)) {
          errors.push(`Missing weight: ${weight}`);
        } else if (typeof config.weights[weight] !== 'number' || config.weights[weight] < 0 || config.weights[weight] > 1) {
          errors.push(`Invalid weight for ${weight}: must be a number between 0 and 1`);
        }
      }
      
      if (Math.abs(weightSum - 1.0) > 0.01) {
        errors.push(`Weights must sum to 1.0, current sum: ${weightSum.toFixed(2)}`);
      }
    }
    
    // Validate thresholds
    if (config.thresholds) {
      const requiredThresholds = ['high_priority', 'medium_priority', 'low_priority'];
      
      for (const threshold of requiredThresholds) {
        if (!(threshold in config.thresholds)) {
          errors.push(`Missing threshold: ${threshold}`);
        } else if (typeof config.thresholds[threshold] !== 'number' || config.thresholds[threshold] < 0 || config.thresholds[threshold] > 3) {
          errors.push(`Invalid threshold for ${threshold}: must be a number between 0 and 3`);
        }
      }
      
      // Ensure thresholds are in descending order
      const thresholds = config.thresholds;
      if (thresholds.high_priority <= thresholds.medium_priority || 
          thresholds.medium_priority <= thresholds.low_priority) {
        errors.push('Thresholds must be in descending order: high > medium > low');
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Update configuration file
  async updateConfig(configPath, updates) {
    try {
      const currentConfig = await this.loadConfig(configPath);
      const updatedConfig = this.mergeWithDefaults({ ...currentConfig, ...updates });
      
      // Validate updated configuration
      const validation = this.validateConfig(updatedConfig);
      if (!validation.valid) {
        throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
      }
      
      // Write updated configuration
      const configYaml = yaml.stringify(updatedConfig, {
        indent: 2,
        lineWidth: 80
      });
      
      await fs.writeFile(configPath, configYaml, 'utf8');
      
      return {
        success: true,
        configPath,
        message: 'Configuration updated successfully'
      };
    } catch (error) {
      throw new Error(`Failed to update config: ${error.message}`);
    }
  }

  // Get available profiles
  getAvailableProfiles() {
    return Object.keys(this.defaultConfig.profiles).map(key => ({
      name: key,
      description: this.defaultConfig.profiles[key].name,
      weights: this.defaultConfig.profiles[key].weights
    }));
  }
}

module.exports = ConfigManager;