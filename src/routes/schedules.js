const { Router } = require("express");
const { addScheduledJob, removeScheduledJob, listScheduledJobs } = require("../scheduler");

const router = Router();

router.post("/", (req, res, next) => {
  try {
    const { platform, cronExpression, payload } = req.body;

    if (!platform || !cronExpression || !payload) {
      return res.status(400).json({ error: "platform, cronExpression, and payload are required" });
    }

    const job = addScheduledJob({ platform, cronExpression, payload });
    res.status(201).json(job);
  } catch (err) {
    next(err);
  }
});

router.get("/", (req, res) => {
  const jobs = listScheduledJobs();
  res.json({ jobs });
});

router.delete("/:id", (req, res) => {
  removeScheduledJob(req.params.id);
  res.json({ message: "Schedule removed" });
});

module.exports = router;
