const express = require("express");
const router = express.Router()
const classes = require("../controllers/classesController")
const moderatorMiddleware = require("../middlewares/moderatorMiddleware")
const authMiddleware = require("../middlewares/authMiddleware")

router.get("/list-classes",moderatorMiddleware,classes.listClasses)
router.delete("/delete-class/:id",moderatorMiddleware,classes.deleteClass)
router.post("/create-classes",moderatorMiddleware,classes.createClass)
router.get("/room-token/:accessCode",authMiddleware,classes.getRoomToken)

module.exports = router;