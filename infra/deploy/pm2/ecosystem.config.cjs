module.exports = {
  apps: [
    {
      name: "edevida-api",
      cwd: "./apps/api",
      script: "src/server.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        APP_HOST: "127.0.0.1",
      },
    },
  ],
};
