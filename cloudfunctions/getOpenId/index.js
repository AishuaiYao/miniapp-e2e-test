const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()

  // 确保 users 集合存在
  const db = cloud.database()
  try {
    await db.createCollection('users')
  } catch (e) {
    // 集合已存在，忽略
  }

  return { openId: OPENID }
}
