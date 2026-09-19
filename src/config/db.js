const mongoose = require("mongoose");

let isConnecting = false;

const connectDB = async () => {
  // Reuse existing connection if connected or connecting
  if (mongoose.connection.readyState >= 1) {
    return;
  }
  if (isConnecting) return;
  isConnecting = true;

  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI environment variable is missing.");
    }
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    isConnecting = false;
  } catch (error) {
    console.warn(`MongoDB Connection Warning: ${error.message}`);
    isConnecting = false;

    // In serverless environments (Vercel), skip MongoMemoryServer binary spawn
    if (process.env.VERCEL || process.env.NOW_REGION) {
      console.warn("Vercel serverless environment detected — set MONGO_URI in Vercel project environment variables.");
      return;
    }

    console.log("Switching to MongoMemoryServer fallback for development testing...");
    try {
      const { MongoMemoryServer } = require("mongodb-memory-server");
      const mongoServer = await MongoMemoryServer.create();
      const mongoUri = mongoServer.getUri();
      await mongoose.connect(mongoUri);
      console.log("MongoDB In-Memory Fallback Connected");
    } catch (memError) {
      console.error(`In-Memory Database fallback failed: ${memError.message}`);
    }
  }
};

module.exports = connectDB;
