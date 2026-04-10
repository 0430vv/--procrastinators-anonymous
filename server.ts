import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const PORT = 3000;

  // In-memory store for procrastinators and messages
  let procrastinators: any[] = [];
  let messages: any[] = [];

  io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    // Send initial data
    socket.emit("initial_data", { procrastinators, messages });

    socket.on("join", (data) => {
      const newUser = {
        id: socket.id,
        ...data,
        startTime: Date.now(),
        cheers: 0,
      };
      procrastinators.push(newUser);
      io.emit("user_joined", newUser);
    });

    socket.on("send_message", (msgData) => {
      const newMessage = {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: Date.now(),
        ...msgData,
      };
      messages.push(newMessage);
      if (messages.length > 50) messages.shift(); // Keep last 50
      io.emit("new_message", newMessage);
    });

    socket.on("cheer", (userId) => {
      const user = procrastinators.find((u) => u.id === userId);
      if (user) {
        user.cheers += 1;
        io.emit("user_updated", user);
      }
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      procrastinators = procrastinators.filter((u) => u.id !== socket.id);
      io.emit("user_left", socket.id);
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
