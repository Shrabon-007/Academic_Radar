const dotenv = require("dotenv");

dotenv.config();

const app = require("./app");
const { connectDatabase } = require("./config/db");

const PORT = Number(process.env.PORT) || 5000;

const startServer = async () => {
  try {
    const connection = await connectDatabase();
    console.log(`MongoDB connected: ${connection.connection.host}/${connection.connection.name}`);

    app.listen(PORT, () => {
      console.log(`Backend server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start backend server:", error.message);
    process.exit(1);
  }
};

startServer();
