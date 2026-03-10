const logger = require('../utils/logger');
const { db } = require('../config/firebase');

class HealthCheckService {
  constructor() {
    this.checks = new Map();
    this.startTime = Date.now();
  }

  // Register a health check
  register(name, checkFunction) {
    this.checks.set(name, checkFunction);
  }

  // Execute all health checks
  async runAllChecks() {
    const results = {};
    let overallStatus = 'healthy';
    let responseTime = 0;

    const startTime = Date.now();

    for (const [name, checkFunction] of this.checks) {
      try {
        const checkStart = Date.now();
        const result = await Promise.race([
          checkFunction(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Health check timeout')), 5000)
          )
        ]);
        const checkTime = Date.now() - checkStart;

        results[name] = {
          status: 'healthy',
          responseTime: checkTime,
          message: result.message || 'OK',
          details: result.details || null
        };
      } catch (error) {
        results[name] = {
          status: 'unhealthy',
          responseTime: 0,
          message: error.message,
          error: error.name
        };
        
        if (overallStatus === 'healthy') {
          overallStatus = 'unhealthy';
        }
      }
    }

    responseTime = Date.now() - startTime;

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      responseTime,
      checks: results,
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    };
  }

  // Database health check
  async checkDatabase() {
    try {
      const start = Date.now();
      await db.collection('health').doc('check').set({
        timestamp: new Date(),
        status: 'ok'
      });
      
      const responseTime = Date.now() - start;
      
      return {
        message: 'Database connection successful',
        details: {
          responseTime,
          type: 'firestore'
        }
      };
    } catch (error) {
      throw new Error(`Database connection failed: ${error.message}`);
    }
  }

  // Memory usage check
  checkMemory() {
    const memUsage = process.memoryUsage();
    const totalMemory = require('os').totalmem();
    const freeMemory = require('os').freemem();
    
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const systemUsagePercent = Math.round(((totalMemory - freeMemory) / totalMemory) * 100);

    let status = 'healthy';
    let message = 'Memory usage normal';

    if (heapUsedMB > 500) { // 500MB threshold
      status = 'warning';
      message = 'High memory usage';
    }

    if (heapUsedMB > 1000) { // 1GB threshold
      status = 'unhealthy';
      message = 'Critical memory usage';
    }

    return {
      message,
      details: {
        heapUsed: `${heapUsedMB}MB`,
        heapTotal: `${heapTotalMB}MB`,
        systemUsage: `${systemUsagePercent}%`,
        status
      }
    };
  }

  // CPU usage check
  checkCpu() {
    const cpus = require('os').cpus();
    const loadAvg = require('os').loadavg();
    
    const cpuCount = cpus.length;
    const loadPercentage = Math.round((loadAvg[0] / cpuCount) * 100);

    let status = 'healthy';
    let message = 'CPU usage normal';

    if (loadPercentage > 70) {
      status = 'warning';
      message = 'High CPU usage';
    }

    if (loadPercentage > 90) {
      status = 'unhealthy';
      message = 'Critical CPU usage';
    }

    return {
      message,
      details: {
        loadAverage: loadAvg[0].toFixed(2),
        cpuCount,
        loadPercentage: `${loadPercentage}%`,
        status
      }
    };
  }

  // Disk space check
  async checkDisk() {
    try {
      const fs = require('fs').promises;
      const stats = await fs.statfs('.');
      
      const totalSpace = stats.blocks * stats.bsize;
      const freeSpace = stats.bavail * stats.bsize;
      const usedSpace = totalSpace - freeSpace;
      const usagePercentage = Math.round((usedSpace / totalSpace) * 100);

      let status = 'healthy';
      let message = 'Disk space normal';

      if (usagePercentage > 80) {
        status = 'warning';
        message = 'Low disk space';
      }

      if (usagePercentage > 95) {
        status = 'unhealthy';
        message = 'Critical disk space';
      }

      return {
        message,
        details: {
          total: `${Math.round(totalSpace / 1024 / 1024 / 1024)}GB`,
          used: `${Math.round(usedSpace / 1024 / 1024 / 1024)}GB`,
          free: `${Math.round(freeSpace / 1024 / 1024 / 1024)}GB`,
          usage: `${usagePercentage}%`,
          status
        }
      };
    } catch (error) {
      return {
        message: 'Disk check failed',
        details: { error: error.message }
      };
    }
  }

  // External service check
  async checkExternalServices() {
    const services = [];
    
    // Check Firebase
    try {
      await this.checkDatabase();
      services.push({
        name: 'firebase',
        status: 'healthy',
        responseTime: Date.now()
      });
    } catch (error) {
      services.push({
        name: 'firebase',
        status: 'unhealthy',
        error: error.message
      });
    }

    // Check Redis if available
    try {
      const redis = require('../services/redisClient');
      await redis.ping();
      services.push({
        name: 'redis',
        status: 'healthy',
        responseTime: Date.now()
      });
    } catch (error) {
      services.push({
        name: 'redis',
        status: 'unhealthy',
        error: error.message
      });
    }

    return {
      message: 'External services checked',
      details: { services }
    };
  }

  // Initialize default health checks
  initialize() {
    this.register('database', this.checkDatabase.bind(this));
    this.register('memory', this.checkMemory.bind(this));
    this.register('cpu', this.checkCpu.bind(this));
    this.register('disk', this.checkDisk.bind(this));
    this.register('external_services', this.checkExternalServices.bind(this));
  }
}

// Create health check service instance
const healthService = new HealthCheckService();
healthService.initialize();

// Health check endpoints
const healthRoutes = {
  // Basic health check (for load balancers)
  '/health': async (req, res) => {
    try {
      const result = await healthService.runAllChecks();
      const statusCode = result.status === 'healthy' ? 200 : 503;
      
      res.status(statusCode).json(result);
      
      logger.api('GET', '/health', statusCode, null, {
        status: result.status,
        responseTime: result.responseTime
      });
    } catch (error) {
      logger.error('Health check failed', error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  },

  // Detailed health check (for monitoring)
  '/health/detailed': async (req, res) => {
    try {
      const result = await healthService.runAllChecks();
      const statusCode = result.status === 'healthy' ? 200 : 503;
      
      res.status(statusCode).json({
        ...result,
        hostname: require('os').hostname(),
        platform: require('os').platform(),
        nodeVersion: process.version,
        memory: process.memoryUsage(),
        uptime: process.uptime()
      });
    } catch (error) {
      logger.error('Detailed health check failed', error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  },

  // Readiness probe (for Kubernetes)
  '/health/ready': async (req, res) => {
    // Check if application is ready to serve traffic
    const checks = await healthService.runAllChecks();
    const isReady = checks.status === 'healthy';
    
    res.status(isReady ? 200 : 503).json({
      status: isReady ? 'ready' : 'not ready',
      timestamp: new Date().toISOString(),
      checks
    });
  },

  // Liveness probe (for Kubernetes)
  '/health/live': async (req, res) => {
    // Check if application is alive
    res.status(200).json({
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  }
};

module.exports = healthRoutes;
