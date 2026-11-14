
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Meeting = require('../models/Meeting');

// Authentication middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Please login first.'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token.'
    });
  }
};

// Create meeting
router.post('/', verifyToken, async (req, res) => {
  try {
    const { title, description, date, time } = req.body;

    if (!title || !date || !time) {
      return res.status(400).json({
        success: false,
        message: 'Title, date and time are required.'
      });
    }

    const meeting = await Meeting.create({
      title,
      description,
      date,
      time,
      createdBy: req.user.userId
    });

    res.status(201).json({
      success: true,
      message: 'Meeting created successfully!',
      meeting
    });
  } catch (error) {
    console.error('CREATE MEETING ERROR:', error);

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get user's meetings
router.get('/', verifyToken, async (req, res) => {
  try {
    const meetings = await Meeting.find({
      createdBy: req.user.userId
    }).sort({ date: 1 });

    console.log('Logged-in user ID:', req.user.userId);
console.log('Meetings found:', meetings.length);

    res.json({
      success: true,
      meetings
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Edit a meeting
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { title, description, date, time } = req.body;

    if (!title || !date || !time) {
      return res.status(400).json({
        success: false,
        message: 'Title, date and time are required.'
      });
    }

    const meeting = await Meeting.findOneAndUpdate(
      {
        _id: req.params.id,
        createdBy: req.user.userId
      },
      {
        title,
        description,
        date,
        time
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found.'
      });
    }

    res.json({
      success: true,
      message: 'Meeting updated successfully!',
      meeting
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Delete a meeting
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const meeting = await Meeting.findOneAndDelete({
      _id: req.params.id,
      createdBy: req.user.userId
    });

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found.'
      });
    }

    res.json({
      success: true,
      message: 'Meeting deleted successfully!'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
