import { io } from "socket.io-client";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
    args[key] = val;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const url = String(args.url || "http://localhost:4000");
  const users = Math.max(1, Math.min(parseInt(String(args.users || "500"), 10) || 500, 2000));
  const rampSeconds = Math.max(1, Math.min(parseInt(String(args.ramp || "60"), 10) || 60, 600));
  const durationSeconds = Math.max(10, Math.min(parseInt(String(args.duration || "120"), 10) || 120, 3600));
  const channelId = String(args.channel || "gen");
  const msgEveryMs = Math.max(0, Math.min(parseInt(String(args.msgEvery || "5000"), 10) || 5000, 60000));

  const sockets = [];
  const metrics = {
    connected: 0,
    connectErrors: 0,
    disconnects: 0,
    sent: 0,
  };

  const startTime = Date.now();
  const rampDelay = Math.floor((rampSeconds * 1000) / users);

  process.on("SIGINT", () => {
    console.log("\n[loadtest] shutting down...");
    for (const s of sockets) s.close();
    process.exit(0);
  });

  console.log(`[loadtest] url=${url} users=${users} ramp=${rampSeconds}s duration=${durationSeconds}s channel=${channelId} msgEvery=${msgEveryMs}ms`);

  for (let i = 1; i <= users; i++) {
    const userId = `loadtest-${process.pid}-${i}`;

    const socket = io(url, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 5,
      timeout: 20000,
    });

    socket.on("connect", () => {
      metrics.connected += 1;
      socket.emit("user:join", userId);
      socket.emit("join", channelId);
    });

    socket.on("connect_error", () => {
      metrics.connectErrors += 1;
    });

    socket.on("disconnect", () => {
      metrics.disconnects += 1;
    });

    sockets.push(socket);

    if (rampDelay > 0) await sleep(rampDelay);

    if (i % 50 === 0) {
      console.log(`[loadtest] ramp progress ${i}/${users} connected=${metrics.connected} errors=${metrics.connectErrors}`);
    }
  }

  const ticker = setInterval(() => {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`[loadtest] t=${elapsed}s connected=${metrics.connected}/${users} errors=${metrics.connectErrors} disconnects=${metrics.disconnects} sent=${metrics.sent}`);
  }, 5000);

  const sender = msgEveryMs > 0
    ? setInterval(() => {
        for (let i = 0; i < sockets.length; i++) {
          const s = sockets[i];
          if (!s.connected) continue;
          const senderId = `loadtest-${process.pid}-${i + 1}`;
          s.emit("message:send", {
            channelId,
            text: `loadtest msg ${Date.now()} from ${senderId}`,
            senderId,
            senderName: "LoadTest",
            senderAvatarUrl: null,
            priority: "normal",
          });
          metrics.sent += 1;
        }
      }, msgEveryMs)
    : null;

  await sleep(durationSeconds * 1000);

  clearInterval(ticker);
  if (sender) clearInterval(sender);

  console.log("[loadtest] done. closing sockets...");
  for (const s of sockets) s.close();

  console.log("[loadtest] summary", metrics);
}

main().catch((e) => {
  console.error("[loadtest] fatal", e);
  process.exit(1);
});
