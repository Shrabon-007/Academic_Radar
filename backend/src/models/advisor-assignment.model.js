const mongoose = require("mongoose");

const advisorAssignmentSchema = new mongoose.Schema(
  {
    batch: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    advisorName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    advisorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Advisor",
      index: true,
      default: null,
    },
    startSerial: {
      type: Number,
      required: true,
      min: 1,
    },
    endSerial: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator(value) {
          return value >= this.startSerial;
        },
        message: "endSerial must be greater than or equal to startSerial",
      },
    },
    status: {
      type: String,
      enum: ["assigned", "paused", "closed"],
      default: "assigned",
      index: true,
    },
    createdByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "advisor_assignments",
  }
);

advisorAssignmentSchema.index({ batch: 1, advisorName: 1, startSerial: 1, endSerial: 1 }, { unique: true });

module.exports = mongoose.model("AdvisorAssignment", advisorAssignmentSchema);
