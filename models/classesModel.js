const db = require("../config/db")
const Classes = {
    async create(data){
        const values = [
            data.title,
            data.subject,
            data.classTime || "now",
            data.accessCode,
            data.moderator_id,
            data.createdAt
        ]
        const createInfo = await db.query("INSERT INTO live_classes (title,subject,scheduled_at,access_code,moderator_id,created_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",values)
        return createInfo.rows[0]
    },
    async listClasses(moderator_id) {
    const result = await db.query(
      `SELECT * FROM live_classes WHERE moderator_id = $1 ORDER BY created_at DESC`,
      [moderator_id]
    );
    return result.rows;
  },

  async deleteClass(id, moderator_id) {
    const result = await db.query(
      `DELETE FROM live_classes WHERE id = $1 AND moderator_id = $2 RETURNING *`,
      [id, moderator_id]
    );
    return result.rows[0]; // return deleted class
  },

  async findClassById(id){
    const results = await db.query("SELECT * FROM live_classes WHERE id = $1",[id])
    return results.rows[0]
 },

  async findClassByAccessCode(accessCode){
    const results = await db.query("SELECT * FROM live_classes WHERE access_code = $1",[accessCode])
    return results.rows[0]
 },

async updateClassStatus(status,id){
    await db.query("UPDATE live_classes SET status = $1 WHERE id = $2",[status,id])
}

}

module.exports = Classes