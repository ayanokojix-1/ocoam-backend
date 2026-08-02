const jwt = require("jsonwebtoken");
const Classes = require("../models/classesModel");

const classes = {
    async createClass(req,res){
        const { title,subject, time } = req.body;
        if(!title || !subject){
            return res.status(400).json({
                status:400,
                message:"All fields are required"
            })
        }
        if (time && isNaN(new Date(time))) {
    return res.status(400).json({
      status: 400,
      message: "Invalid date format for 'time'"
    });
  }

        try{
        const accessCode = [...Array(8)]
      .map(() => Math.random().toString(36)[2])
      .join("")
      .toUpperCase();
       const classTime = time ? new Date(time).toISOString() : null;
      const createdAt = new Date().toISOString()
      const moderator_id = req?.user?.id || 5;
      const classInfo = await Classes.create({title,subject,classTime,createdAt,accessCode, moderator_id});
      res.json({
        status:200,
        message:"Successfully Created Class",
        classInfo
      })            
    } catch(error){
        console.error("Error Creating class",error)
        res.status(500).json({
            status:500,
            message:"An error Occured"
        })
    }
},

async deleteClass(req, res) {
  try {
    const { id } = req.params;
    const moderator_id = req.user.id;

    const exists = await Classes.findClassById(id)
    if(!exists){
      return res.status(404).json({
        status:404,
        message:"Class does not exist"
      })
    }
    const deleted = await Classes.deleteClass(id, moderator_id);
    res.json({
      status: 200,
      message: "Class deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting class:", error);
    res.status(500).json({
      status: 500,
      message: "An error occurred"
    });
  }
},

async listClasses(req, res) {
  try {
    const moderator_id =  req.user?.id
    const classes = await Classes.listClasses(moderator_id);
console.log(classes)
    res.json({
      status: 200,
      message: "Classes fetched successfully",
      classes
    });
  } catch (error) {
    console.error("Error listing classes:", error);
    res.status(500).json({
      status: 500,
      message: "An error occurred"
    });
  }
},

async startClass(req,res){
    const {id} = req.params;
    if(!id){
        return res.status(400).json({
            status:400,
            message:"ID field is required"
        })
    }
    try{
        const classInfo = await Classes.findClassById(id);
        if(!classInfo){
           return res.status(404).json({
                status:404,
                message:`Class with id ${id} not found`
            })
        }
        if (classInfo.status === "live") {
  return res.status(400).json({
    status: 400,
    message: "Class is already live"
  });
}

        await Classes.updateClassStatus("live",id)
        res.json({
            status:200,
            message:"Successfully started Class"
        })
    } catch(error){
        console.error("Class starting Error: ",error)
         return res.status(500).json({
      status: 500,
      message: "An error occurred"
    });
    }
},

// Mints a short-lived token the video-call service can verify, so it doesn't
// have to trust a client-supplied "role" for who's the moderator.
async getRoomToken(req, res) {
  const { accessCode } = req.params;

  try {
    const classInfo = await Classes.findClassByAccessCode(accessCode);
    if (!classInfo) {
      return res.status(404).json({
        status: 404,
        message: "Class not found"
      });
    }

    const role = classInfo.moderator_id === req.user.id ? "moderator" : "student";

    const roomToken = jwt.sign(
      {
        userId: req.user.id,
        name: req.user.username,
        role,
        roomId: accessCode
      },
      process.env.JWT_SECRET,
      { expiresIn: "4h" }
    );

    res.json({
      status: 200,
      message: "Room token issued",
      token: roomToken,
      role,
      name: req.user.username
    });
  } catch (error) {
    console.error("Error issuing room token:", error);
    res.status(500).json({
      status: 500,
      message: "An error occurred"
    });
  }
}

}
module.exports = classes