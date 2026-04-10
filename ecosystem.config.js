module.exports = {
  apps: [
    {
      name: 'jade-subscriber',
      script: './orchestrator-upgrades/jade_subscriber.js',
      cwd: 'C:/Users/danie/OneDrive/Documents/AI_AGENTS_ANTIGRAVITY_LOCAL/Sovereign_Domain_Mesh/',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      exp_backoff_restart_delay: 100,
      max_memory_restart: '300M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: {
        NODE_ENV: 'production',
      }
    },
    {
      name: 'stripe-node',
      script: 'node.js',
      cwd: 'C:/Users/danie/OneDrive/Documents/AI_AGENTS_ANTIGRAVITY_LOCAL/Sovereign_Domain_Mesh/nodes/stripe-node/',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 4000,
      exp_backoff_restart_delay: 100,
      max_memory_restart: '300M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: {
        NODE_ENV: 'production',
      }
    },
    {
      name: 'crm-node',
      script: 'node.js',
      cwd: 'C:/Users/danie/OneDrive/Documents/AI_AGENTS_ANTIGRAVITY_LOCAL/Sovereign_Domain_Mesh/nodes/crm-node/',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 4000,
      exp_backoff_restart_delay: 100,
      max_memory_restart: '300M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: {
        NODE_ENV: 'production',
      }
    },
    {
      name: 'webhook-monitor',
      script: './orchestrator-upgrades/webhook_monitor.js',
      cwd: 'C:/Users/danie/OneDrive/Documents/AI_AGENTS_ANTIGRAVITY_LOCAL/Sovereign_Domain_Mesh/',
      autorestart: true,
      max_restarts: 15,
      restart_delay: 5000,
      exp_backoff_restart_delay: 100,
      max_memory_restart: '200M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: {
        NODE_ENV: 'production',
      }
    },
    {
      name: 'webhook-sweeper',
      script: './orchestrator-upgrades/webhook_sweeper.js',
      cwd: 'C:/Users/danie/OneDrive/Documents/AI_AGENTS_ANTIGRAVITY_LOCAL/Sovereign_Domain_Mesh/',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      exp_backoff_restart_delay: 100,
      max_memory_restart: '200M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: {
        NODE_ENV: 'production',
      }
    },
    {
      name: 'wellness-node',
      script: 'node.js',
      cwd: 'C:/Users/danie/OneDrive/Documents/AI_AGENTS_ANTIGRAVITY_LOCAL/Sovereign_Domain_Mesh/nodes/wellness-node/',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 4000,
      exp_backoff_restart_delay: 100,
      max_memory_restart: '300M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: {
        NODE_ENV: 'production',
      }
    },
    {
      name: 'jade-brain-proxy',
      script: 'jade-brain-proxy.js',
      cwd: 'C:/Users/danie/OneDrive/Documents/AI_AGENTS_ANTIGRAVITY_LOCAL/RxFit-MCP/',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 4000,
      exp_backoff_restart_delay: 100,
      max_memory_restart: '200M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: {
        NODE_ENV: 'production',
      }
    }
  ]
};
