// emissions-calculator.js
// Calculates environmental impact (energy, water, carbon) of LLM queries
// Based on "How Hungry is AI?" paper by Jegham et al., 2025

// Model configuration database with infrastructure specifications
const MODEL_CONFIGS = {
  // GPT-4o models
  'gpt-4o': {
    name: 'GPT-4o',
    provider: 'OpenAI (Azure)',
    hardware: 'DGX H100/H200',
    class: 'Large',
    p_gpu_kw: 10.20,
    p_non_gpu_kw: 1.02,
    u_gpu: 0.065,
    u_non_gpu: 0.0625,
    pue: 1.12,
    wue_site: 0.30,
    wue_source: 3.142,
    cif: 0.3528
  },
  'gpt-4o-mini': {
    name: 'GPT-4o mini',
    provider: 'OpenAI (Azure)',
    hardware: 'DGX A100',
    class: 'Medium',
    p_gpu_kw: 6.50,
    p_non_gpu_kw: 0.65,
    u_gpu: 0.0625,
    u_non_gpu: 0.03125,
    pue: 1.12,
    wue_site: 0.30,
    wue_source: 3.142,
    cif: 0.3528
  },
  'gpt-4': {
    name: 'GPT-4',
    provider: 'OpenAI (Azure)',
    hardware: 'DGX H100/H200',
    class: 'Large',
    p_gpu_kw: 10.20,
    p_non_gpu_kw: 1.02,
    u_gpu: 0.065,
    u_non_gpu: 0.0625,
    pue: 1.12,
    wue_site: 0.30,
    wue_source: 3.142,
    cif: 0.3528
  },
  // Claude models
  'claude-3.7-sonnet': {
    name: 'Claude-3.7 Sonnet',
    provider: 'Anthropic (AWS)',
    hardware: 'DGX H100/H200',
    class: 'Large',
    p_gpu_kw: 10.20,
    p_non_gpu_kw: 1.02,
    u_gpu: 0.065,
    u_non_gpu: 0.0625,
    pue: 1.14,
    wue_site: 0.18,
    wue_source: 3.142,
    cif: 0.385
  },
  'claude-3.5-sonnet': {
    name: 'Claude-3.5 Sonnet',
    provider: 'Anthropic (AWS)',
    hardware: 'DGX H100/H200',
    class: 'Large',
    p_gpu_kw: 10.20,
    p_non_gpu_kw: 1.02,
    u_gpu: 0.065,
    u_non_gpu: 0.0625,
    pue: 1.14,
    wue_site: 0.18,
    wue_source: 3.142,
    cif: 0.385
  },
  'claude-3-sonnet': {
    name: 'Claude-3 Sonnet',
    provider: 'Anthropic (AWS)',
    hardware: 'DGX H100/H200',
    class: 'Large',
    p_gpu_kw: 10.20,
    p_non_gpu_kw: 1.02,
    u_gpu: 0.065,
    u_non_gpu: 0.0625,
    pue: 1.14,
    wue_site: 0.18,
    wue_source: 3.142,
    cif: 0.385
  }
};

// Default configuration for unknown models (conservative Large class estimate)
const DEFAULT_CONFIG = {
  name: 'Unknown Model',
  provider: 'Unknown',
  hardware: 'DGX H100/H200',
  class: 'Large',
  p_gpu_kw: 10.20,
  p_non_gpu_kw: 1.02,
  u_gpu: 0.065,
  u_non_gpu: 0.0625,
  pue: 1.12,
  wue_site: 0.30,
  wue_source: 3.142,
  cif: 0.3528
};

/**
 * Get model configuration by name
 * @param {string} modelName - The name of the model
 * @returns {object} The model configuration
 */
function getModelConfig(modelName) {
  if (!modelName) return DEFAULT_CONFIG;
  
  const normalizedName = modelName.toLowerCase().trim();
  
  // Try exact match first
  if (MODEL_CONFIGS[normalizedName]) {
    return MODEL_CONFIGS[normalizedName];
  }
  
  // Try partial match
  for (const [key, config] of Object.entries(MODEL_CONFIGS)) {
    if (normalizedName.includes(key) || key.includes(normalizedName)) {
      return config;
    }
  }
  
  // Default if not found
  return DEFAULT_CONFIG;
}

/**
 * Calculate emissions for an LLM query
 * Based on Equation 1, 3, and 4 from Jegham et al., 2025
 * 
 * @param {object} params - Calculation parameters
 * @param {number} params.outputTokens - Number of output tokens generated
 * @param {number} params.tps - Tokens per second (generation speed)
 * @param {number} params.latencyMs - Latency in milliseconds (time to first token)
 * @param {string} params.modelName - Name of the LLM model
 * @returns {object} Environmental impact metrics
 */
function calculateEmissions(params) {
  const { outputTokens, tps, latencyMs, modelName } = params;
  
  // Input validation
  if (!outputTokens || outputTokens <= 0) {
    return createErrorMetrics('Invalid output tokens');
  }
  if (!tps || tps <= 0) {
    return createErrorMetrics('Invalid tokens per second');
  }
  
  const config = getModelConfig(modelName);
  
  // Step 1: Calculate inference time in hours
  const latencySec = Math.max(0, latencyMs / 1000); // Convert to seconds
  const generationTimeSec = outputTokens / tps;
  const totalTimeSec = latencySec + generationTimeSec;
  const inferenceTimeHours = totalTimeSec / 3600;
  
  // Step 2: Calculate power draw in kilowatts
  const gpuPower = config.p_gpu_kw * config.u_gpu;
  const nonGpuPower = config.p_non_gpu_kw * config.u_non_gpu;
  const powerDrawKw = gpuPower + nonGpuPower;
  
  // Step 3: Calculate energy consumption (Equation 1)
  const energyKwh = inferenceTimeHours * powerDrawKw * config.pue;
  const energyWh = energyKwh * 1000; // Convert to Watt-hours for readability
  
  // Step 4: Calculate water consumption (Equation 3)
  const itEnergyKwh = energyKwh / config.pue; // Energy without overhead
  const waterOnSiteLiters = itEnergyKwh * config.wue_site;
  const waterSourceLiters = energyKwh * config.wue_source;
  const waterTotalLiters = waterOnSiteLiters + waterSourceLiters;
  const waterMl = waterTotalLiters * 1000; // Convert to milliliters
  
  // Step 5: Calculate carbon emissions (Equation 4)
  const carbonKg = energyKwh * config.cif;
  const carbonGrams = carbonKg * 1000; // Convert to grams
  
  // Calculate contextual comparisons
  const googleSearchEquivalent = Math.round(energyWh / 0.30);
  const phoneChargePercent = ((energyWh / 5) * 100).toFixed(1);
  
  return {
    success: true,
    energy: {
      wh: parseFloat(energyWh.toFixed(2)),
      kwh: parseFloat(energyKwh.toFixed(6))
    },
    water: {
      ml: parseFloat(waterMl.toFixed(2)),
      liters: parseFloat(waterTotalLiters.toFixed(5))
    },
    carbon: {
      grams: parseFloat(carbonGrams.toFixed(2)),
      kg: parseFloat(carbonKg.toFixed(6))
    },
    model: {
      name: config.name,
      provider: config.provider,
      hardware: config.hardware
    },
    technical: {
      inferenceTimeSeconds: parseFloat(totalTimeSec.toFixed(3)),
      powerDrawKw: parseFloat(powerDrawKw.toFixed(4)),
      tokensProcessed: outputTokens,
      latencyMs: parseFloat(latencyMs.toFixed(1)),
      tps: parseFloat(tps.toFixed(2))
    },
    context: {
      googleSearchEquivalent,
      phoneChargePercent
    }
  };
}

/**
 * Create an error metrics object
 * @param {string} error - Error message
 * @returns {object} Error metrics object
 */
function createErrorMetrics(error) {
  return {
    success: false,
    error,
    energy: { wh: 0, kwh: 0 },
    water: { ml: 0, liters: 0 },
    carbon: { grams: 0, kg: 0 }
  };
}

/**
 * Format emissions for display
 * @param {object} emissions - Emissions metrics from calculateEmissions
 * @returns {object} Formatted strings for UI display
 */
function formatEmissionsForDisplay(emissions) {
  if (!emissions.success) {
    return {
      energyDisplay: 'N/A',
      waterDisplay: 'N/A',
      carbonDisplay: 'N/A'
    };
  }
  
  return {
    energyDisplay: `${emissions.energy.wh} Wh`,
    waterDisplay: `${emissions.water.ml} mL`,
    carbonDisplay: `${emissions.carbon.grams} g CO₂e`,
    googleEquivalent: `~${emissions.context.googleSearchEquivalent} Google searches`,
    phoneChargePercent: `~${emissions.context.phoneChargePercent}% of a phone charge`,
    modelInfo: `${emissions.model.name} (${emissions.model.provider})`,
    inferenceTime: `${emissions.technical.inferenceTimeSeconds}s`,
    powerDraw: `${emissions.technical.powerDrawKw} kW`
  };
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calculateEmissions,
    formatEmissionsForDisplay,
    getModelConfig,
    MODEL_CONFIGS,
    DEFAULT_CONFIG
  };
}
