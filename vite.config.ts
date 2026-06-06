import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const daemonUrl = env.VITE_JOLT_DAEMON_URL || "http://127.0.0.1:9862";

  return {
    plugins: [react()],
    server: {
      port: 5178,
      proxy: {
        "/jolt-api": {
          target: daemonUrl,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/jolt-api/, "/app/v1")
        },
        "/jolt-daemon": {
          target: daemonUrl,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/jolt-daemon/, "/api/v1")
        }
      }
    }
  };
});
