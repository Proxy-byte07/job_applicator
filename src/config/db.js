const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    // Set a 5-second timeout for quick fallback if remote cluster is unreachable
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.warn(`MongoDB Connection Warning: ${error.message}`);
    console.log("Switching to MongoMemoryServer fallback for development testing...");
    try {
      const { MongoMemoryServer } = require("mongodb-memory-server");
      const mongoServer = await MongoMemoryServer.create();
      const mongoUri = mongoServer.getUri();
      const conn = await mongoose.connect(mongoUri);
      console.log(`MongoDB In-Memory Fallback Connected: ${conn.connection.host}`);
    } catch (memError) {
      console.error(`In-Memory Database fallback failed: ${memError.message}`);
      process.exit(1);
    }
  }
};

module.exports = connectDB;
