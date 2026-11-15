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
    content: `You are a professional AI meeting assistant.
Analyze meeting transcripts and create clear, structured summaries.

Always use these five sections:

1. MEETING OVERVIEW
Write a short explanation of the meeting.

2. KEY DISCUSSION POINTS
List the important topics discussed.

3. IMPORTANT DECISIONS
List the decisions made during the meeting.

4. ACTION ITEMS
List the tasks that need to be completed.

5. ASSIGNED TASKS
Mention each person's name and their assigned task.

Use bullet points where appropriate.
If information is not available, write "Not specified".
Do not invent names, decisions, or tasks.`
  },
  {
    role: 'user',
    content: `Analyze this meeting transcript and generate the structured summary:\n\n${transcript}`
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