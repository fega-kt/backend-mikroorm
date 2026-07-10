// Số lượng process chạy song song, đọc từ env NUM_OF_INSTANCES, mặc định 1 (chạy đơn)
const numOfInstances = parseInt(process.env.NUM_OF_INSTANCES || '1');
// Ngưỡng RAM để pm2 tự restart process khi bị leak memory, mặc định 2G
const maxMemoryRestart = process.env.MAX_MEMORY_RESTART || '2G';
// Thời gian (ms) đợi trước khi restart lại sau khi crash, mặc định 30s
const restartDelay = parseInt(process.env.RESTART_DELAY || '30000');

module.exports = {
  apps: [
    {
      name: 'app', // Tên hiển thị của process trong `pm2 list`
      script: 'dist/main.js', // File entry point đã build để pm2 chạy
      instances: numOfInstances, // Số instance, >1 sẽ chạy đa tiến trình (load balancing giữa các core)
      exec_mode: numOfInstances > 1 ? 'cluster' : 'fork', // cluster: nhiều instance chia sẻ port qua Node cluster; fork: 1 process độc lập
      max_memory_restart: maxMemoryRestart, // Vượt ngưỡng RAM này thì pm2 tự kill & restart process
      restart_delay: restartDelay, // Đợi bao lâu trước khi restart lại sau khi crash, tránh restart-loop dồn dập
    },
  ],
};
