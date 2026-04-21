const mongoose = require("mongoose");

const connectDatabase = async () => {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("MONGODB_URI is missing in environment variables.");
  }

  mongoose.set("strictQuery", true);

  const connection = await mongoose.connect(mongoUri);
  return connection;
};

module.exports = { connectDatabase };
