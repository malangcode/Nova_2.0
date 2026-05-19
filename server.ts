import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer } from "ws";
import Database from "better-sqlite3";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { AndroidRemote, RemoteKeyCode } from "androidtv-remote";
import adb from "adbkit";

dotenv.config();

const dbPath = path.join(process.cwd(), "data.db");
const db = new Database(dbPath);

// Initialize database tables
db.exec(`
  CREATE TABLE IF NOT EXISTS chat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT,
    content TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    embedding TEXT, -- Stored as JSON string
    type TEXT DEFAULT 'retrieval', -- 'retrieval' or 'long-term'
    userId TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS visual_memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    type TEXT, -- 'person' or 'object'
    face_embedding TEXT, -- Stored as JSON string
    image_snapshot TEXT, -- Base64 string
    description TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tv_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT UNIQUE,
    name TEXT,
    cert TEXT, -- JSON string
    adb_enabled INTEGER DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migration: Add 'type' column to 'memories' if it doesn't exist and update defaults
try {
  const tableInfo = db.prepare("PRAGMA table_info(memories)").all();
  const hasTypeColumn = tableInfo.some((col: any) => col.name === 'type');
  if (!hasTypeColumn) {
    db.prepare("ALTER TABLE memories ADD COLUMN type TEXT DEFAULT 'short-term'").run();
    console.log("Migration: Added 'type' column to 'memories' table");
  } else {
    // Convert any old 'retrieval' types to 'long-term' for UI consistency
    const result = db.prepare("UPDATE memories SET type = 'long-term' WHERE type = 'retrieval'").run();
    if (result.changes > 0) {
      console.log(`Migration: Converted ${result.changes} 'retrieval' memories to 'long-term'`);
    }
  }
} catch (err) {
  console.error("Migration error:", err);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/history", (req, res) => {
    try {
      const history = db.prepare("SELECT role, content, timestamp FROM chat_history ORDER BY timestamp DESC LIMIT 50").all();
      res.json(history);
    } catch (err) {
      console.error("Error fetching history:", err);
      res.status(500).json({ error: "Failed to fetch history" });
    }
  });

  app.post("/api/chat/store", (req, res) => {
    try {
      const { role, content } = req.body;
      const stmt = db.prepare("INSERT INTO chat_history (role, content) VALUES (?, ?)");
      stmt.run(role, content);
      res.json({ success: true, stored: true });
    } catch (err) {
      console.error("Error storing chat message:", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  });

  app.delete("/api/chat/history", (req, res) => {
    try {
      db.prepare("DELETE FROM chat_history").run();
      res.json({ success: true });
    } catch (err) {
      console.error("Error clearing history:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/memory/store", (req, res) => {
    try {
      const { content, embedding, userId, type = 'retrieval' } = req.body;
      const stmt = db.prepare("INSERT INTO memories (content, embedding, userId, type) VALUES (?, ?, ?, ?)");
      stmt.run(content, JSON.stringify(embedding), userId || null, type);
      res.json({ success: true });
    } catch (err) {
      console.error("Error storing memory:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/memory/list", (req, res) => {
    try {
      const { type } = req.query;
      let memories;
      if (type) {
        memories = db.prepare("SELECT id, content, embedding, type, timestamp FROM memories WHERE type = ? ORDER BY timestamp DESC LIMIT 100").all(type);
      } else {
        memories = db.prepare("SELECT id, content, embedding, type, timestamp FROM memories ORDER BY timestamp DESC LIMIT 100").all();
      }
      const formatted = memories.map((m: any) => ({
        ...m,
        embedding: m.embedding ? JSON.parse(m.embedding) : null
      }));
      res.json(formatted);
    } catch (err) {
      console.error("Error listing memories:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/memory", (req, res) => {
    try {
      db.prepare("DELETE FROM memories").run();
      res.json({ success: true });
    } catch (err) {
      console.error("Error clearing memories:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/memory/:id", (req, res) => {
    try {
      const { id } = req.params;
      db.prepare("DELETE FROM memories WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting memory:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/memory/search", (req, res) => {
    try {
      const { embedding, limit = 5, type } = req.body;
      
      // Since SQLite doesn't have native vector search, we'll do a simple cosine similarity in JS
      // for small datasets (up to 1000 memories, this is fine).
      let memories;
      if (type) {
        memories = db.prepare("SELECT content, embedding, type, timestamp FROM memories WHERE type = ?").all(type);
      } else {
        memories = db.prepare("SELECT content, embedding, type, timestamp FROM memories").all();
      }
      
      if (!embedding || embedding.length === 0) {
        return res.json(memories.slice(0, limit));
      }

      const cosineSimilarity = (vecA: number[], vecB: number[]) => {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < vecA.length; i++) {
          dotProduct += vecA[i] * vecB[i];
          normA += vecA[i] * vecA[i];
          normB += vecB[i] * vecB[i];
        }
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
      };

      const results = memories
        .map((m: any) => ({
          content: m.content,
          timestamp: m.timestamp,
          score: cosineSimilarity(embedding, JSON.parse(m.embedding))
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      res.json(results);
    } catch (err) {
      console.error("Error searching memory:", err);
      res.json([]);
    }
  });

  app.get("/api/summary", (req, res) => {
    try {
      const summary = db.prepare("SELECT content FROM summaries ORDER BY updated_at DESC LIMIT 1").get();
      res.json(summary || { content: "" });
    } catch (err) {
      console.error("Error fetching summary:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/summary", (req, res) => {
    try {
      const { content } = req.body;
      const stmt = db.prepare("INSERT INTO summaries (content) VALUES (?)");
      stmt.run(content);
      res.json({ success: true });
    } catch (err) {
      console.error("Error updating summary:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Visual Memory API
  app.post("/api/visual-memory/store", (req, res) => {
    try {
      const { name, type, face_embedding, image_snapshot, description } = req.body;
      const stmt = db.prepare("INSERT INTO visual_memory (name, type, face_embedding, image_snapshot, description) VALUES (?, ?, ?, ?, ?)");
      stmt.run(name, type, face_embedding ? JSON.stringify(face_embedding) : null, image_snapshot, description);
      res.json({ success: true });
    } catch (err) {
      console.error("Error storing visual memory:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/visual-memory/list", (req, res) => {
    try {
      const memories = db.prepare("SELECT * FROM visual_memory ORDER BY timestamp DESC").all();
      const formatted = memories.map((m: any) => ({
        ...m,
        face_embedding: m.face_embedding ? JSON.parse(m.face_embedding) : null
      }));
      res.json(formatted);
    } catch (err) {
      console.error("Error listing visual memories:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/visual-memory/:id", (req, res) => {
    try {
      const { id } = req.params;
      db.prepare("DELETE FROM visual_memory WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting visual memory:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/visual-memory", (req, res) => {
    try {
      db.prepare("DELETE FROM visual_memory").run();
      res.json({ success: true });
    } catch (err) {
      console.error("Error clearing visual memories:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // TV Control API
  const activeRemotes = new Map<string, any>();
  const tvState = new Map<string, { volume: number, muted: boolean, app: string }>();
  let adbClient: any = null;
  
  try {
    adbClient = adb.createClient();
  } catch (e) {
    console.warn("ADB Client could not be initialized:", e);
  }

  // Helper to start/get remote
  async function getOrStartRemote(ip: string, certJson: string) {
    let remote = activeRemotes.get(ip);
    if (remote) return remote;

    remote = new AndroidRemote(ip, { cert: JSON.parse(certJson) });
    
    remote.on("error", (err: any) => {
      console.error(`TV Remote Error (${ip}):`, err.message);
      activeRemotes.delete(ip);
    });

    remote.on("close", () => {
      console.log(`TV Remote Connection Closed (${ip})`);
      activeRemotes.delete(ip);
    });

    remote.on("volume", (volume: any) => {
      console.log(`TV Volume Update (${ip}):`, volume.level);
      tvState.set(ip, { 
        ...tvState.get(ip) || { volume: 0, muted: false, app: "unknown" },
        volume: volume.level,
        muted: volume.muted
      });
    });

    remote.on("app", (app: string) => {
      console.log(`TV Active App (${ip}):`, app);
      tvState.set(ip, {
        ...tvState.get(ip) || { volume: 0, muted: false, app: "unknown" },
        app: app
      });
    });

    await remote.start();
    activeRemotes.set(ip, remote);
    return remote;
  }

  app.get("/api/tv/list", (req, res) => {
    try {
      const tvs = db.prepare("SELECT * FROM tv_config").all() as any[];
      const enrichedTvs = tvs.map(tv => ({
        ...tv,
        status: activeRemotes.has(tv.ip) ? "connected" : "offline",
        state: tvState.get(tv.ip) || { volume: 0, muted: false, app: "unknown" }
      }));
      res.json(enrichedTvs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/tv/pair/start", async (req, res) => {
    const { ip } = req.body;
    if (!ip) return res.status(400).json({ error: "IP is required" });

    try {
      const remote = new AndroidRemote(ip, {});
      activeRemotes.set(ip, remote);

      remote.on("secret", () => {
        if (!res.headersSent) res.json({ success: true, message: "PIN requested on TV" });
      });

      remote.on("error", (err) => {
        console.error("Remote Error:", err);
        if (!res.headersSent) res.status(500).json({ error: err.message });
      });

      await remote.start();
    } catch (err: any) {
      let errorMessage = err.message;
      if (errorMessage.includes("ETIMEDOUT") || errorMessage.includes("EHOSTUNREACH")) {
        errorMessage = `Connection timed out to ${ip}. Since this application is running in a cloud environment, it cannot reach devices on your private local network (192.168.x.x, 10.x.x.x, etc.). Please ensure the TV is reachable from the public internet or run this application locally.`;
      }
      if (!res.headersSent) res.status(500).json({ error: errorMessage });
    }
  });

  app.post("/api/tv/pair/pin", async (req, res) => {
    const { ip, pin } = req.body;
    const remote = activeRemotes.get(ip);
    if (!remote) return res.status(400).json({ error: "Pairing session not found" });

    try {
      await remote.sendCode(pin);
      const cert = remote.getCertificate();
      db.prepare("INSERT OR REPLACE INTO tv_config (ip, cert, name) VALUES (?, ?, ?)")
        .run(ip, JSON.stringify(cert), "Android TV");
      if (!res.headersSent) res.json({ success: true, message: "Pairing successful" });
    } catch (err: any) {
      let errorMessage = err.message;
      if (errorMessage.includes("ETIMEDOUT") || errorMessage.includes("EHOSTUNREACH")) {
        errorMessage = `Network error: Cannot reach ${ip} from the cloud.`;
      }
      if (!res.headersSent) res.status(500).json({ error: errorMessage });
    }
  });

  app.post("/api/tv/command", async (req, res) => {
    let { ip, command, args } = req.body;
    
    // If IP is missing, try to use the last added TV
    if (!ip) {
      const lastTv = db.prepare("SELECT ip FROM tv_config ORDER BY timestamp DESC LIMIT 1").get() as any;
      if (lastTv) ip = lastTv.ip;
    }

    if (!ip) return res.status(400).json({ error: "IP is required or no TV configured" });

    const tv = db.prepare("SELECT * FROM tv_config WHERE ip = ?").get(ip) as any;
    if (!tv) return res.status(404).json({ error: "TV configuration not found" });

    try {
      if (tv.cert) {
        const remote = await getOrStartRemote(ip, tv.cert);
        
        // Map command strings to RemoteKeyCode
        const keyMap: Record<string, any> = {
          "up": RemoteKeyCode.UP,
          "down": RemoteKeyCode.DOWN,
          "left": RemoteKeyCode.LEFT,
          "right": RemoteKeyCode.RIGHT,
          "center": RemoteKeyCode.CENTER,
          "back": RemoteKeyCode.BACK,
          "home": RemoteKeyCode.HOME,
          "power": RemoteKeyCode.POWER,
          "volume_up": RemoteKeyCode.VOLUME_UP,
          "volume_down": RemoteKeyCode.VOLUME_DOWN,
          "mute": RemoteKeyCode.MUTE,
          "play": RemoteKeyCode.PLAY,
          "pause": RemoteKeyCode.PAUSE,
        };

        if (keyMap[command]) {
          console.log(`Executing TV Command: ${command} on ${ip}`);
          remote.sendKey(keyMap[command]);
          return res.json({ success: true, state: tvState.get(ip) });
        }
      }

      // ADB Fallback
      if (adbClient) {
        const devices = await adbClient.listDevices();
        const device = devices.find((d: any) => d.id.includes(ip));
        
        if (device) {
          if (command === "launch") {
            await adbClient.shell(device.id, `am start -a android.intent.action.VIEW -d ${args}`);
          } else {
            // generic keyevent for adb fallback
            const adbKeyMap: Record<string, string> = {
              "up": "19", "down": "20", "left": "21", "right": "22", "center": "23",
              "back": "4", "home": "3", "power": "26"
            };
            if (adbKeyMap[command]) {
              await adbClient.shell(device.id, `input keyevent ${adbKeyMap[command]}`);
            }
          }
          return res.json({ success: true, mechanism: "adb" });
        }
      }

      res.status(404).json({ error: "TV not reachable via Remote Protocol or ADB. Note: Cloud-to-Local network access is restricted." });
    } catch (err: any) {
      let errorMessage = err.message;
      if (errorMessage.includes("ETIMEDOUT") || errorMessage.includes("EHOSTUNREACH")) {
        errorMessage = `TV unreachable: ${errorMessage}. Cloud environments cannot access local home network IPs directly.`;
      }
      res.status(500).json({ error: errorMessage });
    }
  });

  app.post("/api/vision/analyze", (req, res) => {
    try {
      const { image, prompt } = req.body;
      if (!image) return res.status(400).json({ error: "Image is required" });
      res.json({
        success: true,
        message: "Vision analysis received. For real-time interaction, use the Live Session feature.",
        analysis: "This is a placeholder for server-side vision analysis. Real-time vision is active in the Assistant tab."
      });
    } catch (err) {
      console.error("Vision analysis error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws) => {
    console.log("Client connected to WebSocket");
    ws.on("message", (message) => {
      console.log("Received:", message.toString());
    });
  });
}

startServer();
