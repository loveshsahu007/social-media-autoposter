const express = require("express");
const morgan = require("morgan");
const postsRouter = require("./routes/posts");
const schedulesRouter = require("./routes/schedules");
const healthRouter = require("./routes/health");
const errorHandler = require("./middleware/errorHandler");
const logger = require("./utils/logger");

const app = express();

app.use(express.json());
app.use(morgan("short", { stream: { write: (msg) => logger.info(msg.trim()) } }));

app.use("/api/posts", postsRouter);
app.use("/api/schedules", schedulesRouter);
app.use("/api/health", healthRouter);

app.use(errorHandler);

module.exports = app;
