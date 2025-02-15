//routes/generateRoutes.js

const express = require('express');
const { generateFromPrompt } = require('../controllers/generateController');
const router = express.Router();

router.post('/', generateFromPrompt);

module.exports = router;
