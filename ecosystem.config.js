module.exports = {
  apps: [
    {
      name: 'azeroth-api',
      script: 'src/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    },
    {
      name: 'azeroth-web',
      script: 'src/web.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      env_production: {
        NODE_ENV: 'production',
        WEB_HOST: '0.0.0.0',
        WEB_PORT: 4173,
        API_HOST: '127.0.0.1',
        API_PORT: 3000
      }
    }
  ]
};
