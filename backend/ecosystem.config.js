module.exports = {
  apps: [{
    name: "evara-backend",
    script: "./src/server.js",
    instances: "max",
    exec_mode: "cluster",
    watch: false,
    env: {
      NODE_ENV: "production",
      PORT: 8000
    }
  }]
};
