const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      default: ''
    },
    date: {
      type: Date,
      required: true
    },
    time: {
      type: String,
      required: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    transcript: {
  type: String,
  default: ''
},
summary: {
  type: String,
  default: ''
},
actionItems: {
  type: [String],
  default: []
}

  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Meeting', meetingSchema);