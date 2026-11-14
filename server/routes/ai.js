const express = require('express');
const router = express.Router();
const Groq = require('groq-sdk');
const jwt = require('jsonwebtoken');
const Meeting = require('../models/Meeting');

const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  console.log(
  'AUTH CHECK:',
  req.headers.authorization?.split(' ')[0],
  token?.length,
  token?.split('.').length
);

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Please login first.'
    });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
 } catch (error) {
  console.log('JWT ERROR:', error.message);
  return res.status(401).json({
    success: false,
    message: error.message
  });
}
};
const client = new Groq({
  apiKey: process.env.GROQ_API_KEY
});


router.post('/summarize/:meetingId', verifyToken, async (req, res) => {
  try {
    const { transcript } = req.body;

    if (!transcript || !transcript.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Meeting transcript is required.'
      });
    }

    const meeting = await Meeting.findOne({
      _id: req.params.meetingId,
      createdBy: req.user.userId
    });

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found.'
      });
    }

  const result = await client.chat.completions.create({
  model: 'qwen/qwen3.8-27b',
  messages: [
    {
      role: 'system',
      content: 'You are an AI meeting assistant. Summarize the meeting clearly and list important action items.'
    },
    {
      role: 'user',
      content: `Summarize this meeting transcript. Include key points, decisions, and action items:\n\n${transcript}`
    }
  ],
  max_tokens: 800
});

const summary = result.choices?.[0]?.message?.content || '';

    meeting.transcript = transcript;
    meeting.summary = summary;
    await meeting.save();

    res.json({
      success: true,
      message: 'AI summary generated successfully.',
      summary
    });

  } catch (error) {
    console.error('AI SUMMARY ERROR:', error);

    console.log(
  'HUGGING FACE RESPONSE:',
  JSON.stringify(error.httpResponse?.body, null, 2)
);

    res.status(500).json({
      success: false,
      message: error.message || 'Unable to generate AI summary.'
    });
  }
});

module.exports = router;