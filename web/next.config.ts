import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  eslint: {
    ignoreDuringBuilds: true,
  },
  /* config options here */
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Prevent client bundle from pulling Node-only modules
      config.resolve = config.resolve || {};
      // Ensure 'browser' condition takes precedence in client builds
      const existing = (config.resolve as any).conditionNames as string[] | undefined;
      const baseConds = existing && Array.isArray(existing) ? existing : [];
      (config.resolve as any).conditionNames = [
        'browser',
        'import',
        'module',
        ...baseConds.filter((c) => c !== 'browser' && c !== 'import' && c !== 'module'),
      ];
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        ws: false as unknown as string,
        "ws/wrapper.mjs": false as unknown as string,
        // Block specific ws lib files referenced in traces
        "ws/lib/permessage-deflate.js": false as unknown as string,
        "ws/lib/receiver.js": false as unknown as string,
        "ws/lib/websocket.js": false as unknown as string,
        "ws/lib/sender.js": false as unknown as string,
        // Force browser websocket transport
        "engine.io-client/build/esm-debug/transports/websocket.node.js":
          "engine.io-client/build/esm-debug/transports/websocket.browser.js",
        "engine.io-client/build/esm/transports/websocket.node.js":
          "engine.io-client/build/esm/transports/websocket.browser.js",
        "engine.io-client/build/esm-debug/transports/websocket.node.mjs":
          "engine.io-client/build/esm-debug/transports/websocket.browser.js",
        "engine.io-client/build/esm/transports/websocket.node.mjs":
          "engine.io-client/build/esm/transports/websocket.browser.js",
        // Catch relative requests inside engine.io-client sources
        "./transports/websocket.node.js": "engine.io-client/build/esm/transports/websocket.browser.js",
        "./transports/websocket.node.mjs": "engine.io-client/build/esm/transports/websocket.browser.js",
        // Ensure debug builds resolve to non-debug browser builds
        "engine.io-client/build/esm-debug/index.js":
          "engine.io-client/build/esm/index.js",
        "engine.io-client/build/esm-debug/index.mjs":
          "engine.io-client/build/esm/index.js",
        // Prefer non-debug client in dev to avoid debug path resolving node bits
        "socket.io-client/build/esm-debug/index.js":
          "socket.io-client/build/esm/index.js",
      } as typeof config.resolve.alias;

      // Some versions look up 'bufferutil'/'utf-8-validate' optional deps; stub them out
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        bufferutil: false,
        "utf-8-validate": false,
      };

      // Prefer browser fields when resolving
      (config.resolve as any).mainFields = [
        "browser",
        "module",
        "main",
        ...(((config.resolve as any).mainFields || []).filter((f: string) => !["browser","module","main"].includes(f)))
      ];
    }
    return config;
  },
};

export default nextConfig;
