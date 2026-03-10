const Redis = require("ioredis");

/**
 * Enhanced Cache Provider
 * Transparently falls back to in-memory if Redis isn't reachable.
 */

class MemoryCache {
    constructor() {
        this.store = new Map();
        this.cleanupInterval = setInterval(() => this._cleanup(), 60_000);
    }
    get(key) {
        const entry = this.store.get(key);
        if (!entry) return undefined;
        if (Date.now() > entry.expiry) {
            this.store.delete(key);
            return undefined;
        }
        return entry.value;
    }
    set(key, value, ttlSeconds) {
        this.store.set(key, {
            value,
            expiry: Date.now() + (ttlSeconds || 300) * 1000,
        });
    }
    del(key) { this.store.delete(key); }
    flushPrefix(prefix) {
        for (const key of this.store.keys()) {
            if (key.startsWith(prefix)) this.store.delete(key);
        }
    }
    flushAll() { this.store.clear(); }
    _cleanup() {
        const now = Date.now();
        for (const [key, entry] of this.store) {
            if (now > entry.expiry) this.store.delete(key);
        }
    }
}

class CacheProvider {
    constructor() {
        this.memory = new MemoryCache();
        this.redis = null;
        this.isRedisReady = false;

        const redisUrl = process.env.REDIS_URL;
        if (redisUrl) {
            try {
                this.redis = new Redis(redisUrl, {
                    maxRetriesPerRequest: 1,
                    connectTimeout: 2000,
                    retryStrategy: (times) => null // Don't retry indefinitely for dev
                });
                this.redis.on("connect", () => {
                    console.log("[Cache] Redis Connected");
                    this.isRedisReady = true;
                });
                this.redis.on("error", (err) => {
                    console.warn("[Cache] Redis Unavailable, using memory fallback");
                    this.isRedisReady = false;
                });
            } catch (err) {
                console.error("[Cache] Failed to init Redis:", err.message);
            }
        }
    }

    async get(key) {
        if (this.isRedisReady) {
            try {
                const val = await this.redis.get(key);
                return val ? JSON.parse(val) : undefined;
            } catch (e) { return this.memory.get(key); }
        }
        return this.memory.get(key);
    }

    async set(key, value, ttlSeconds = 300) {
        if (this.isRedisReady) {
            try {
                await this.redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
                return;
            } catch (e) { /* fallback */ }
        }
        this.memory.set(key, value, ttlSeconds);
    }

    async del(key) {
        if (this.isRedisReady) {
            try {
                await this.redis.del(key);
                return;
            } catch (e) { /* fallback */ }
        }
        this.memory.del(key);
    }

    async flushPrefix(prefix) {
        if (this.isRedisReady) {
            try {
                const keys = await this.redis.keys(`${prefix}*`);
                if (keys.length > 0) await this.redis.del(...keys);
                return;
            } catch (e) { /* fallback */ }
        }
        this.memory.flushPrefix(prefix);
    }

    async flushAll() {
        if (this.isRedisReady) {
            try {
                await this.redis.flushall();
                return;
            } catch (e) { /* fallback */ }
        }
        this.memory.flushAll();
    }

    // SaaS Architecture: Redis Pub/Sub Support
    getPubSub() {
        if (!this.isRedisReady || !this.redis) return null;
        // ioredis needs separate connections for Pub and Sub
        const pub = new Redis(process.env.REDIS_URL);
        const sub = new Redis(process.env.REDIS_URL);
        return { pub, sub };
    }
}

module.exports = new CacheProvider();
