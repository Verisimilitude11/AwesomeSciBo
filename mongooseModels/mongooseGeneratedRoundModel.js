const mongoose = require("mongoose");

const generatedRoundSchema = new mongoose.Schema({
  htmlContent: {
    type: String,
    required: true,
  },
  requestedBy: {
    type: String,
    required: true,
  },
  authorTag: {
    type: String,
    required: true,
  },
  timestamp: {
    type: String,
    required: true,
  }
});

module.exports = mongoose.model("GeneratedRounds", generatedRoundSchema);
